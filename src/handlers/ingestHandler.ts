// src/handlers/ingestHandler.ts

import { Esp32DataPayload, Env } from '../types'; // 导入我们定义的类型

// 这个函数将处理所有与数据摄入相关的逻辑
export async function handleIngestRequest(request: Request, env: Env): Promise<Response> {
  // 确保只处理 POST 请求 (虽然主 index.ts 可能已经检查过，但在这里再次确认是个好习惯)
  if (request.method !== 'POST') {
    // 返回 405 Method Not Allowed 状态码，表示此端点不支持非 POST 请求
    return new Response('Expected POST request for data ingestion', { status: 405 });
  }

  try {
    // 尝试从请求体中解析 JSON 数据
    // <Esp32DataPayload> 是一个类型断言，告诉 TypeScript 我们期望的数据结构
    const incomingData = await request.json<Esp32DataPayload>();

    // 数据校验：检查必要的字段是否存在且类型基本正确
    // 这是一个运行时的检查，因为外部传入的数据是不可信的
    if (!incomingData.device || typeof incomingData.timestamp !== 'number' || !incomingData.quaternions) {
      // 如果缺少关键字段，返回 400 Bad Request 状态码
      return new Response('Missing required fields for ingestion: device, timestamp, or quaternions', { status: 400 });
    }

    // 数据校验：确保 quaternions 字段是一个非空数组
    if (!Array.isArray(incomingData.quaternions) || incomingData.quaternions.length === 0) {
      // 如果 quaternions 不是数组或为空，返回 400 Bad Request 状态码
      return new Response('Field "quaternions" must be a non-empty array for ingestion', { status: 400 });
    }
    // 可选：检查样本数量
    // 如果需要严格控制每批数据的样本数量，可以取消下面代码的注释
    // if (incomingData.quaternions.length !== 50) {
    //   return new Response(`Expected 50 quaternion samples, received ${incomingData.quaternions.length}`, { status: 400 });
    // }

    // 数据转换：将四元数数组转换为 JSON 字符串，以便存储到数据库的 TEXT 类型字段中
    const quaternionsJsonString: string = JSON.stringify(incomingData.quaternions);
    // 定义 SQL 插入语句，使用 '?'作为占位符，以防止 SQL 注入
    const sqlQuery: string = 'INSERT INTO gait_data (device, timestamp, quaternions, note) VALUES (?, ?, ?, ?)';

    // 准备 SQL 语句，这是 D1 数据库推荐的做法
    const stmt = env.DB.prepare(sqlQuery);
    // 绑定参数到 SQL 语句并执行
    // 参数的顺序必须与 SQL 语句中 '?' 的顺序一致
    const { success, error } = await stmt.bind(
      incomingData.device,          // 对应第一个 '?' (device)
      incomingData.timestamp,       // 对应第二个 '?' (timestamp)
      quaternionsJsonString,        // 对应第三个 '?' (quaternions)
      incomingData.note || null     // 对应第四个 '?' (note)，如果 note 未提供，则插入 NULL
    ).run(); // .run() 用于执行不返回数据行的 SQL 命令 (如 INSERT, UPDATE, DELETE)

    // 根据数据库操作结果返回响应
    if (success) {
      // 在 Worker 日志中记录成功信息
      console.log(`INGESTION: Data inserted for device: ${incomingData.device} at timestamp: ${incomingData.timestamp}`);
      // 返回 201 Created 状态码，表示资源已成功创建
      return new Response('Data ingested successfully!', { status: 201 });
    } else {
      // 在 Worker 日志中记录数据库错误详情
      console.error('INGESTION: D1 DB Error:', error);
      // 返回 500 Internal Server Error 状态码，表示服务器端发生错误
      return new Response('Failed to store ingested data in database.', { status: 500 });
    }

  } catch (e: any) { // 捕获处理过程中可能发生的任何错误
    // 在 Worker 日志中记录发生的错误
    console.error('INGESTION: Worker Error:', e);
    // 错误类型判断：如果是 JSON 解析错误 (例如，请求体不是有效的 JSON)
    if (e instanceof SyntaxError) {
      // 返回 400 Bad Request 状态码
      return new Response('Invalid JSON payload for ingestion', { status: 400 });
    }
    // 对于其他类型的错误，返回 500 Internal Server Error 状态码
    return new Response(`Error processing ingestion request: ${e.message}`, { status: 500 });
  }
}