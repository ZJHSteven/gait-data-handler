// src/handlers/sessionHandler.ts

import { Env, StartSessionPayload, EndSessionPayload, SessionResponse } from '../types'; // 导入所需的类型定义

/**
 * 处理开始新实验会话的请求
 * @param request - Fetch API 的 Request 对象，包含客户端的请求信息
 * @param env - 包含环境变量和绑定（如数据库）的对象
 * @returns 返回一个 Promise，解析为 Fetch API 的 Response 对象
 */
export async function handleStartSession(request: Request, env: Env): Promise<Response> {
  // 检查请求方法是否为 POST
  if (request.method !== 'POST') {
    // 如果不是 POST 请求，返回 405 Method Not Allowed 状态码
    return new Response(JSON.stringify({ message: 'Expected POST request to start a session.' }), {
      status: 405, // 405 Method Not Allowed
      headers: { 'Content-Type': 'application/json' }, // 设置响应头为 JSON
    });
  }

  let payload: StartSessionPayload;
  try {
    // 尝试从请求体中解析 JSON 数据，并断言其类型为 StartSessionPayload
    payload = await request.json<StartSessionPayload>();
  } catch (e) {
    // 如果 JSON 解析失败，记录错误并返回 400 Bad Request 状态码
    console.error('SESSION_START: Invalid JSON payload', e);
    return new Response(JSON.stringify({ message: 'Invalid JSON payload.' }), {
      status: 400, // 400 Bad Request
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // 校验必要的字段 experiment_name 是否存在
  if (!payload.experiment_name) {
    // 如果缺少 experiment_name 字段，返回 400 Bad Request 状态码
    return new Response(JSON.stringify({ message: 'Missing required field: experiment_name.' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // 获取当前的 UTC 时间作为会话开始时间
  const startTimeUTC = new Date().toISOString();
  // 定义 SQL 插入语句
  // experiment_name 是主键，end_time 初始为 NULL，notes 可选
  const sql = `
    INSERT INTO experiment_sessions (experiment_name, start_time, notes) 
    VALUES (?, ?, ?);
  `; // 使用占位符 '?' 防止 SQL 注入

  try {
    // 准备 SQL 语句
    const stmt = env.DB.prepare(sql);
    // 绑定参数到 SQL 语句并执行
    const { success, error, meta } = await stmt.bind(
      payload.experiment_name, // 对应第一个 '?' (experiment_name)
      startTimeUTC,            // 对应第二个 '?' (start_time)
      payload.notes || null    // 对应第三个 '?' (notes)，如果 notes 未提供，则插入 NULL
    ).run(); // .run() 用于执行不返回数据行的 SQL 命令

    // 根据数据库操作结果返回响应
    if (success) {
      // 在 Worker 日志中记录成功信息
      console.log(`SESSION_START: Session '${payload.experiment_name}' started successfully at ${startTimeUTC}.`);
      // 构建成功的响应体
      const responsePayload: SessionResponse = {
        experiment_name: payload.experiment_name,
        start_time: startTimeUTC,
        notes: payload.notes,
        message: 'Session started successfully.'
      };
      // 返回 201 Created 状态码，表示资源已成功创建
      return new Response(JSON.stringify(responsePayload), {
        status: 201, // 201 Created
        headers: { 'Content-Type': 'application/json' },
      });
    } else {
      // 如果数据库操作失败，记录详细的错误信息
      // 这里是关键，我们要记录下 D1 返回的具体 error 对象
      console.error(`SESSION_START: D1 DB Error for experiment_name '${payload.experiment_name}'. Error object:`, JSON.stringify(error, null, 2));
      console.error('SESSION_START: D1 DB Error details:', error); // 尝试直接打印 error 对象

      // 初步的错误处理，后续根据实际日志调整
      // 检查是否因为唯一约束失败（例如，experiment_name 已存在）
      // 使用类型断言来帮助 TypeScript 理解 error 对象的结构
      const errorMessage = (error as any)?.message?.toLowerCase() || '';
      if (errorMessage.includes('unique constraint failed') || errorMessage.includes('primary key constraint failed')) {
        // 返回 409 Conflict 状态码，提示实验名称已存在
        return new Response(JSON.stringify({
          message: `错误：实验名称 "${payload.experiment_name}" 已存在，请输入一个唯一的实验名称。`
        }), {
          status: 409, // 409 Conflict
          headers: { 'Content-Type': 'application/json' },
        });
      }
      // 对于其他数据库错误，返回 500 Internal Server Error 状态码
      return new Response(JSON.stringify({ message: '数据库错误，无法开始实验会话。查看 Worker 日志获取详情。', errorDetails: (error as any)?.message }), {
        status: 500, // 500 Internal Server Error
        headers: { 'Content-Type': 'application/json' },
      });
    }
  } catch (e: any) { // 捕获处理过程中可能发生的任何其他 Worker 级别的错误
    // 记录 Worker 级别的异常信息
    console.error(`SESSION_START: Worker exception for experiment_name '${payload.experiment_name}'. Exception object:`, JSON.stringify(e, null, 2));
    console.error('SESSION_START: Worker exception details:', e); // 尝试直接打印 e 对象
    // 尝试从异常的 cause 中判断是否为唯一约束失败
    if (e.cause && e.cause.message && (e.cause.message.toLowerCase().includes('unique constraint failed') || e.cause.message.toLowerCase().includes('primary key constraint failed'))) {
         // 返回 409 Conflict 状态码
         return new Response(JSON.stringify({
          message: `错误：实验名称 "${payload.experiment_name}" 已存在，请输入一个唯一的实验名称。 (Caught via e.cause)`
        }), {
          status: 409, 
          headers: { 'Content-Type': 'application/json' },
        });
    }
    // 对于其他 Worker 异常，返回 500 Internal Server Error 状态码
    return new Response(JSON.stringify({ message: '服务器内部错误，请稍后再试。查看 Worker 日志获取详情。', errorDetails: e?.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}

/**
 * 处理结束实验会话的请求
 * @param request - Fetch API 的 Request 对象
 * @param env - 包含环境变量和绑定的对象
 * @returns 返回一个 Promise，解析为 Fetch API 的 Response 对象
 */
export async function handleEndSession(request: Request, env: Env): Promise<Response> {
  // 检查请求方法是否为 POST (或 PUT，根据 API 设计决定)
  if (request.method !== 'POST') { // 或者 PUT
    // 如果方法不匹配，返回 405 Method Not Allowed
    return new Response(JSON.stringify({ message: 'Expected POST (or PUT) request to end a session.' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  let payload: EndSessionPayload;
  try {
    // 解析请求体中的 JSON 数据
    payload = await request.json<EndSessionPayload>();
  } catch (e) {
    // JSON 解析失败，记录错误并返回 400 Bad Request
    console.error('SESSION_END: Invalid JSON payload', e);
    return new Response(JSON.stringify({ message: 'Invalid JSON payload.' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // 校验必要的字段 experiment_name 是否存在
  if (!payload.experiment_name) {
    // 缺少 experiment_name，返回 400 Bad Request
    return new Response(JSON.stringify({ message: 'Missing required field: experiment_name.' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // 获取当前的 UTC 时间作为会话结束时间
  const endTimeUTC = new Date().toISOString();
  // 定义 SQL 更新语句，用于设置会话的结束时间
  const sql = `
    UPDATE experiment_sessions 
    SET end_time = ? 
    WHERE experiment_name = ?;
  `; // 使用占位符 '?'

  try {
    // 准备 SQL 语句
    const stmt = env.DB.prepare(sql);
    // 绑定参数并执行更新操作
    const { success, error, meta } = await stmt.bind(
      endTimeUTC,             // 对应第一个 '?' (end_time)
      payload.experiment_name // 对应第二个 '?' (experiment_name)
    ).run();

    // 根据数据库操作结果返回响应
    if (success) {
      // 检查是否有行实际被更新 (meta.changes 表示受影响的行数)
      if (meta && meta.changes > 0) {
        // 成功更新，记录日志
        console.log(`SESSION_END: Session '${payload.experiment_name}' ended successfully at ${endTimeUTC}.`);
        // 构建成功的响应体
        const responsePayload: SessionResponse = { // 可以复用或创建一个新的响应类型
            experiment_name: payload.experiment_name,
            start_time: "N/A (fetch from DB if needed)", // 结束时不一定知道开始时间，除非再查一次
            end_time: endTimeUTC,
            message: 'Session ended successfully.'
        };
        // 返回 200 OK 状态码
        return new Response(JSON.stringify(responsePayload), {
          status: 200, // 200 OK
          headers: { 'Content-Type': 'application/json' },
        });
      } else {
        // 如果没有行被更新，说明可能没有找到对应 experiment_name 的会话
        console.warn(`SESSION_END: No session found with name '${payload.experiment_name}' to end.`);
        // 返回 404 Not Found 状态码
        return new Response(JSON.stringify({ message: `未找到实验名称为 "${payload.experiment_name}" 的会话以结束。` }), {
          status: 404, // 404 Not Found
          headers: { 'Content-Type': 'application/json' },
        });
      }
    } else {
      // 数据库更新操作失败，记录错误
      console.error(`SESSION_END: D1 DB Error for experiment_name '${payload.experiment_name}'. Error object:`, JSON.stringify(error, null, 2));
      console.error('SESSION_END: D1 DB Error details:', error);
      // 返回 500 Internal Server Error 状态码
      // 使用类型断言来帮助 TypeScript 理解 error 对象的结构
      return new Response(JSON.stringify({ message: '数据库错误，无法结束实验会话。查看 Worker 日志获取详情。', errorDetails: (error as any)?.message }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
    }
  } catch (e: any) { // 捕获 Worker 级别的其他异常
    // 记录 Worker 异常
    console.error(`SESSION_END: Worker exception for experiment_name '${payload.experiment_name}'. Exception object:`, JSON.stringify(e, null, 2));
    console.error('SESSION_END: Worker exception details:', e);
    // 返回 500 Internal Server Error 状态码
    return new Response(JSON.stringify({ message: '服务器内部错误，请稍后再试。查看 Worker 日志获取详情。', errorDetails: e?.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}


// 处理列出所有实验会话的请求
export async function handleListSessions(request: Request, env: Env): Promise<Response> {
    try {
      // 定义 SQL 查询语句，用于从 experiment_sessions 表中选择所有会话的相关信息
      // 按 start_time 降序排列，使最新的会话显示在前面
      const sql = `
        SELECT experiment_name, start_time, end_time, notes, created_at 
        FROM experiment_sessions 
        ORDER BY start_time DESC; 
      `;
      // 准备 SQL 语句
      const stmt = env.DB.prepare(sql);
      // 执行查询并获取所有结果行
      // .all() 用于执行返回多行的 SQL 查询
      const { results } = await stmt.all(); 
  
      // 成功获取数据，返回 200 OK 状态码和会话列表
      // 如果 results 为 undefined 或 null (理论上 .all() 会返回数组或抛异常)，则默认为空数组
      return new Response(JSON.stringify({ sessions: results || [] }), {
        status: 200, // 200 OK
        headers: { 'Content-Type': 'application/json' }, // 设置响应头为 JSON
      });
    } catch (e: any) { // 捕获数据库查询或其他过程中可能发生的任何错误
      // 在 Worker 日志中记录发生的错误
      console.error('LIST_SESSIONS: Error listing sessions:', e);
      // 返回 500 Internal Server Error 状态码和错误信息
      return new Response(JSON.stringify({ message: 'Error fetching session list.', errorDetails: e?.message }), {
        status: 500, // 500 Internal Server Error
        headers: { 'Content-Type': 'application/json' },
      });
    }
  }