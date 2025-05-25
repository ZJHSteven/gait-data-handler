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