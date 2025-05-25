// src/types.ts

/**
 * 定义 ESP32 发送过来的数据包结构。
 */
export interface Esp32DataPayload {
    device: string;
    timestamp: string;
    quaternions: Array<{ w: number; x: number; y: number; z: number }>; // 您已更正此字段名
    note?: string;
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