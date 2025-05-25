// src/index.ts

import { Env } from './types'; // 导入 Env 类型
import { handleIngestRequest } from './handlers/ingestHandler'; // 导入数据摄入处理器
// 将来在这里导入其他处理器，例如：
// import { handleSessionRequest } from './handlers/sessionHandler';
// import { handleQueryRequest } from './handlers/queryHandler';

export default {
  async fetch(
    request: Request,
    env: Env,
    ctx: ExecutionContext
  ): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname; // 获取请求的路径，例如 "/api/ingest"
    const method = request.method; // 获取请求的方法，例如 "POST"

    console.log(`Received request: ${method} ${path}`); // 记录请求信息

    // 基本的路由逻辑
    // 路由 1: 处理传感器数据摄入
    if (method === 'POST' && path === '/api/ingest') { // 我们定义 /api/ingest 作为数据摄入的端点
      return handleIngestRequest(request, env);
    }

    // 路由 2: 处理会话管理 (示例，尚未实现)
    // else if (path.startsWith('/api/session')) {
    //   return handleSessionRequest(request, env);
    // }

    // 路由 3: 处理数据查询 (示例，尚未实现)
    // else if (method === 'GET' && path.startsWith('/api/query')) {
    //   return handleQueryRequest(request, env);
    // }

    // 如果没有匹配的路由
    console.log(`No route matched for ${method} ${path}`);
    return new Response('Not Found. This endpoint does not exist.', { status: 404 });
  },
};