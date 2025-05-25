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