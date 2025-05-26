// src/handlers/queryHandler.ts

import { Env, GaitDataRecord, QueryDataResponse } from '../types'; // 从 types.ts 导入我们定义的接口

/**
 * 处理根据实验名称查询步态数据的请求。
 * 当前设计为: 前端通过 URL 查询参数 ?name=THE_EXPERIMENT_NAME 来指定实验名称。
 * @param request - Fetch API 的 Request 对象，包含客户端请求信息。
 * @param env - Worker 的环境对象，包含数据库绑定 (env.DB)。
 * @returns 返回一个 Promise，该 Promise 解析为 Fetch API 的 Response 对象。
 */
export async function handleQueryDataByExperimentName(request: Request, env: Env): Promise<Response> {
  // 从请求 URL 中解析出查询参数
  const url = new URL(request.url);
  const experimentName = url.searchParams.get('name'); // 获取 'name' 查询参数的值

  // 校验：确保 experimentName 参数已提供
  if (!experimentName) {
    const errorResponse = { message: '错误：必须提供 "name" 查询参数作为实验名称。' };
    return new Response(JSON.stringify(errorResponse), {
      status: 400, // 400 Bad Request - 客户端请求错误
      headers: { 'Content-Type': 'application/json' },
    });
  }

  try {
    // --- 步骤 1: 根据 experiment_name 查询 experiment_sessions 表获取会话信息 ---
    console.log(`QUERY_HANDLER: Fetching session info for experiment: ${experimentName}`);
    const sessionSql = `
      SELECT start_time, end_time, notes 
      FROM experiment_sessions 
      WHERE experiment_name = ?; 
    `; // '?' 是占位符
    const sessionStmt = env.DB.prepare(sessionSql).bind(experimentName); // 准备语句并绑定参数
    
    // .first<T>() 用于期望查询结果最多只有一行，并指定返回类型的结构
    const sessionInfo = await sessionStmt.first<{ start_time: string; end_time: string | null; notes: string | null }>();

    // 校验：检查是否找到了对应的实验会话
    if (!sessionInfo) {
      console.warn(`QUERY_HANDLER: No session found with name: ${experimentName}`);
      const errorResponse = { message: `错误：未找到名为 "${experimentName}" 的实验会话。` };
      return new Response(JSON.stringify(errorResponse), {
        status: 404, // 404 Not Found - 请求的资源不存在
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // 校验：检查实验是否已结束 (end_time 是否有值)
    if (!sessionInfo.end_time) {
      console.log(`QUERY_HANDLER: Experiment '${experimentName}' has started but not yet ended.`);
      const partialResponse: QueryDataResponse = { // 使用 QueryDataResponse 类型
        experiment_name: experimentName,
        session_notes: sessionInfo.notes || null,
        start_time: sessionInfo.start_time,
        end_time: null, // 明确表示未结束
        data_count: 0,
        gait_data_records: [], // 返回空数组
        message: `实验 "${experimentName}" 已开始但尚未结束，目前无法提供完整的步态数据。`
      };
      return new Response(JSON.stringify(partialResponse), {
        status: 202, // 202 Accepted - 请求已接受，但可能正在处理或数据不完整
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // --- 步骤 2: 根据获取到的时间范围 (start_time, end_time) 查询 gait_data 表 ---
    console.log(`QUERY_HANDLER: Fetching gait data for ${experimentName} between ${sessionInfo.start_time} and ${sessionInfo.end_time}`);
    const gaitDataSql = `
      SELECT device, timestamp, quaternions, note 
      FROM gait_data 
      WHERE timestamp >= ? AND timestamp <= ?  
      ORDER BY timestamp, device ASC;          
    `;
    const gaitDataStmt = env.DB.prepare(gaitDataSql).bind(sessionInfo.start_time, sessionInfo.end_time);
    
    // .all<T>() 用于期望查询结果可能有多行，并指定每行数据对象的类型
    const gaitDataQueryResults = await gaitDataStmt.all<GaitDataRecord>(); 
    const records = gaitDataQueryResults.results || []; // 如果没有结果，results可能是undefined或null，确保是空数组

    // --- 步骤 3: 构建并返回最终的响应 ---
    const responsePayload: QueryDataResponse = {
      experiment_name: experimentName,
      session_notes: sessionInfo.notes || null,
      start_time: sessionInfo.start_time,
      end_time: sessionInfo.end_time, // 此时 end_time 必然有值
      data_count: records.length,
      gait_data_records: records,
      message: '数据查询成功。'
    };

    // 将JavaScript对象序列化为JSON字符串作为响应体
    return new Response(JSON.stringify(responsePayload), {
      status: 200, // 200 OK - 请求成功
      headers: { 
        'Content-Type': 'application/json',
        // (可选) 如果希望浏览器直接下载这个JSON文件:
        // 'Content-Disposition': `attachment; filename="${experimentName}_gait_data.json"`
      },
    });

  } catch (e: unknown) { // 使用 unknown 类型捕获错误，更类型安全
    let errorMessage = `查询实验 "${experimentName}" 的数据时发生服务器内部错误。`;
    if (e instanceof Error) {
      errorMessage = e.message; // 如果是 Error 对象，获取其 message
    } else if (typeof e === 'string') {
      errorMessage = e; // 如果直接抛出的是字符串
    }
    console.error(`QUERY_HANDLER: Exception querying data for experiment '${experimentName}':`, e);
    
    const errorResponse = { 
      message: '数据查询失败，请查看 Worker 日志了解详情。', 
      errorDetails: errorMessage // 将具体的错误信息也返回给前端（可选）
    };
    return new Response(JSON.stringify(errorResponse), {
      status: 500, // 500 Internal Server Error
      headers: { 'Content-Type': 'application/json' },
    });
  }
}