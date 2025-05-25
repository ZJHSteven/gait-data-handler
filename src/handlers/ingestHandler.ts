// src/handlers/ingestHandler.ts

import { Esp32BatchedDataPayload, Env, SecondData } from '../types'; // 导入更新后的类型，以支持批量数据结构

/**
 * 处理批量数据摄入请求的函数
 */
export async function handleIngestRequest(request: Request, env: Env): Promise<Response> {
  // 确保只处理 POST 请求
  if (request.method !== 'POST') {
    // 如果不是 POST 请求，返回 405 Method Not Allowed 状态码
    return new Response('Expected POST request for data ingestion', { status: 405 });
  }

  try {
    // 尝试从请求体中解析 JSON 数据，期望其符合 Esp32BatchedDataPayload 结构
    const incomingBatch = await request.json<Esp32BatchedDataPayload>();

    // 基本的数据校验：检查 device ID 和 seconds_data 数组是否存在且不为空
    if (!incomingBatch.device || !incomingBatch.seconds_data || !Array.isArray(incomingBatch.seconds_data) || incomingBatch.seconds_data.length === 0) {
      // 如果缺少关键字段或 seconds_data 为空，返回 400 Bad Request 状态码
      return new Response('Missing required fields: device, or non-empty seconds_data array', { status: 400 });
    }

    // D1 数据库支持批量操作 (batching statements)
    // 我们将为 incomingBatch.seconds_data 中的每条有效记录准备一个插入语句
    const stmts: D1PreparedStatement[] = []; // 用于存储所有准备好的 D1 数据库语句
    const sqlQuery: string = 'INSERT INTO gait_data (device, timestamp, quaternions, note) VALUES (?, ?, ?, ?)'; // 定义 SQL 插入语句模板

    // 遍历批量数据中的每一秒条目
    for (const secondEntry of incomingBatch.seconds_data) {
      // 对每条秒级数据进行校验
      if (typeof secondEntry.timestamp !== 'string' || !Array.isArray(secondEntry.quaternions) || secondEntry.quaternions.length === 0) {
        // 如果时间戳不是字符串，或者四元数数据不是数组或为空，则记录警告并跳过此条目
        console.warn('INGESTION: Skipping invalid second_data entry in batch:', secondEntry);
        continue; // 跳过此无效条目，处理下一条
      }
      // 可选：如果需要严格检查每秒的样本数量（例如，期望每秒有50个样本）
      // if (secondEntry.quaternions.length !== 50) {
      //   console.warn(`INGESTION: Invalid sample count for timestamp ${secondEntry.timestamp}. Expected 50, got ${secondEntry.quaternions.length}`);
      //   continue; // 如果样本数不符合要求，跳过此条目
      // }

      // 将四元数数组转换为 JSON 字符串，以便存储到数据库的 TEXT 类型字段中
      const quaternionsJsonString: string = JSON.stringify(secondEntry.quaternions);
      
      // 准备单个插入语句并添加到 stmts 数组中
      stmts.push(
        env.DB.prepare(sqlQuery).bind(
          incomingBatch.device,     // 设备 ID，对于批次中的所有秒数据都是相同的
          secondEntry.timestamp,    // 当前这一秒的时间戳
          quaternionsJsonString,    // 当前这一秒的四元数数据 (JSON 字符串)
          secondEntry.note || null  // 当前这一秒的备注，如果未提供则为 NULL
        )
      );
    }

    // 检查在处理完所有条目后，是否有任何有效的语句被准备好
    if (stmts.length === 0 && incomingBatch.seconds_data.length > 0) {
        // 如果原始数据非空，但没有生成任何有效语句，说明所有条目都无效
        return new Response('All data entries in the batch were invalid.', { status: 400 });
    }
    // 此检查理论上已被前面的 `incomingBatch.seconds_data.length === 0` 覆盖，但为了代码的完整性保留
    if (stmts.length === 0 && incomingBatch.seconds_data.length === 0) {
        return new Response('No data entries provided in the batch.', { status: 400 });
    }


    // 使用 D1 的 batch 方法一次性执行所有准备好的语句
    // 这通常比对每个语句单独执行 .run() 并等待其完成更高效
    const batchResults = await env.DB.batch(stmts);

    // 检查批量操作的执行结果
    // D1 batch 方法返回一个 D1Result 对象的数组，每个对象对应一个语句的执行结果
    let allSuccess = true; // 标记是否所有语句都成功执行
    let successfulInserts = 0; // 计数成功插入的记录数
    const errors: any[] = []; // 用于收集执行失败的语句的错误信息

    for (const result of batchResults) {
      if (!result.success) {
        allSuccess = false; // 一旦有任何语句失败，将 allSuccess 设为 false
        errors.push(result.error || 'Unknown D1 batch error'); // 记录错误信息
        console.error('INGESTION: D1 batch insert error:', result.error); // 在 Worker 日志中记录数据库错误
      } else {
        successfulInserts++; // 成功执行，增加计数器
      }
    }

    // 根据批量操作的总体结果返回响应
    if (allSuccess) {
      // 如果所有语句都成功执行
      console.log(`INGESTION: Batch inserted ${successfulInserts} records for device: ${incomingBatch.device}`);
      // 返回 201 Created 状态码，表示所有数据已成功创建
      return new Response(`Batch data ingested successfully. ${successfulInserts} records stored.`, { status: 201 });
    } else {
      // 如果部分语句成功，部分失败，或者全部失败
      console.error(`INGESTION: D1 batch insert failed for some records. Device: ${incomingBatch.device}. Errors:`, errors);
      // 返回 207 Multi-Status 状态码，表示请求已完成，但结果是混合的
      // 或者，如果所有都失败，也可以考虑返回 500 Internal Server Error
      return new Response(JSON.stringify({ 
        message: `Batch data ingestion partially failed or fully failed. ${successfulInserts} records stored out of ${stmts.length}. Check Worker logs for details.`,
        errors: errors // 在响应体中包含错误详情
      }), { status: 207 }); 
    }

  } catch (e: any) { // 捕获处理过程中可能发生的任何顶层错误（例如 JSON 解析错误）
    // 在 Worker 日志中记录发生的错误
    console.error('INGESTION: Worker Error processing batch:', e);
    // 错误类型判断：如果是 JSON 解析错误 (例如，请求体不是有效的 JSON)
    if (e instanceof SyntaxError) {
      // 返回 400 Bad Request 状态码
      return new Response('Invalid JSON payload for batch ingestion', { status: 400 });
    }
    // 对于其他类型的顶层错误，返回 500 Internal Server Error 状态码
    // 注意：这里修正了原始代码片段中的语法错误，使用了模板字符串
    return new Response(`Error processing batch ingestion request: ${e.message}`, { status: 500 });
  }
}