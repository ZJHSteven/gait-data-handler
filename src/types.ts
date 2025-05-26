// src/types.ts

/**
 * 代表一秒钟的传感器数据结构
 */
export interface SecondData {
    timestamp: string; // 该秒的 ISO 8601 UTC 时间戳
    quaternions: Array<{ w: number; x: number; y: number; z: number }>; // 该秒内的50个四元数样本
    note?: string;      // (可选) 针对这一秒的备注
  }
  
  /**
   * ESP32 发送过来的批处理数据包结构 (例如包含10秒的数据)
   */
  export interface Esp32BatchedDataPayload {
    device: string;               // 设备/关节标识
    // start_timestamp: string;   // (可选) 批处理包的起始时间戳，用于校验或记录
    seconds_data: SecondData[];   // 包含多秒数据的数组
  }
/**
* 定义我们的 Worker 环境中绑定的资源。
*/
export interface Env {
    DB: D1Database;
  }
  
/**
 * 开始新实验会话时，前端发送过来的数据包结构
 */
export interface StartSessionPayload {
    experiment_name: string; // 实验名称，将作为主键
    notes?: string;         // 关于实验的可选备注
  }
  
  /**
   * 结束实验会话时，前端发送过来的数据包结构
   * (假设通过请求体发送 session_id，即 experiment_name)
   */
  export interface EndSessionPayload {
    experiment_name: string; // 要结束的实验的名称
  }
  
  // (可选) 定义会话成功开始时的响应结构
  export interface SessionResponse {
    experiment_name: string;
    start_time: string;
    notes?: string;
    message: string;
    end_time?: string; // 结束会话时可以包含这个
}
  
/**
 * 代表 gait_data 表中的一条记录的结构 (通常代表一秒的传感器数据)
 * 用于从数据库查询出来的数据，以及API响应中包含的数据。
 */
export interface GaitDataRecord {
  device: string;      // 设备/关节标识
  timestamp: string;   // 该条记录的 ISO 8601 UTC 时间戳
  quaternions: string; // 直接是字符串
  note?: string;      // (可选) 针对这条记录的备注
}

/**
 * 数据查询成功时，Worker 返回给前端的响应体结构
 */
export interface QueryDataResponse { // 改个更具体的名字，避免与通用的 QueryResponse 混淆
  experiment_name: string;   // 被查询的实验名称
  session_notes: string | null; // 实验的备注信息 (如果有的话)
  start_time: string;        // 实验的开始时间 (ISO 8601 UTC)
  end_time: string | null;   // 实验的结束时间 (ISO 8601 UTC)，如果实验未结束则为 null
  data_count: number;        // 本次查询实际返回的 gait_data 记录数量
  gait_data_records: GaitDataRecord[]; // 查询到的步态数据记录数组
  message: string;           // 操作结果的消息
}