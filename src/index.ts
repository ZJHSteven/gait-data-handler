// src/index.ts

import { Env } from './types';
import { handleIngestRequest } from './handlers/ingestHandler';
import { handleStartSession, handleEndSession, handleListSessions } from './handlers/sessionHandler'; // 导入会话处理器
import { handleQueryDataByExperimentName } from './handlers/queryHandler'; // 导入新的查询处理器

// 定义允许的前端源
const ALLOWED_ORIGIN = 'http://localhost:5173'; // 开发时
// const ALLOWED_ORIGIN_PROD = 'https://your-production-frontend-domain.com'; // 生产时

function addCorsHeaders(response: Response, requestOrigin: string | null): Response {
  // 创建一个新的 Headers 对象，基于原始响应的头部
  const newHeaders = new Headers(response.headers);

  // 动态设置 Access-Control-Allow-Origin
  // 在生产环境中，您应该只允许特定的前端域名
  // 为了开发方便，您可以暂时用 localhost，或者在部署时通过环境变量控制
  newHeaders.set('Access-Control-Allow-Origin', ALLOWED_ORIGIN); // 或者 requestOrigin 如果您想更动态但需谨慎
  // newHeaders.set('Access-Control-Allow-Origin', '*'); // 允许所有源，仅用于测试，不推荐生产

  newHeaders.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  newHeaders.set('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-API-Key'); // 按需添加您前端会发送的头部
  // 如果前端需要读取自定义的响应头，也需要在这里允许：
  // newHeaders.set('Access-Control-Expose-Headers', 'X-My-Custom-Header');

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: newHeaders,
  });
}

export default {
  async fetch(
    request: Request,
    env: Env,
    ctx: ExecutionContext
  ): Promise<Response> {

    const requestOrigin = request.headers.get('Origin');

    // 处理 OPTIONS 预检请求
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        headers: {
          'Access-Control-Allow-Origin': ALLOWED_ORIGIN, // 或者 requestOrigin
          'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-API-Key', // 确保包含前端实际发送的头部
          'Access-Control-Max-Age': '86400', // 预检请求结果的缓存时间（秒）
        },
      });
    }

    let originalResponse: Response;
    const url = new URL(request.url);
    const path = url.pathname;
    const method = request.method;

    console.log(`ROUTER: Received request: ${method} ${path}`);

    // 数据摄入路由
    if (method === 'POST' && path === '/api/ingest') {
      originalResponse = await handleIngestRequest(request, env);
    }
    // 开始会话路由
    else if (method === 'POST' && path === '/api/session/start') {
      originalResponse = await handleStartSession(request, env);
    }
    // 结束会话路由
    else if (method === 'POST' && path === '/api/session/end') { // 您也可以用 PUT 方法
      originalResponse = await handleEndSession(request, env);
    }
    // 列出会话路由
    else if (method === 'GET' && path === '/api/sessions') {
      originalResponse = await handleListSessions(request, env);
    }
  // 数据查询路由
    // 示例: GET /api/data/experiment?name=MyExperimentName 
    // (注意：这里的路径是 /api/data/experiment，与 queryHandler 中假设的略有不同，您可以统一)
    else if (method === 'GET' && path === '/api/data/experiment') { 
      originalResponse = await handleQueryDataByExperimentName(request, env);
    }
    
    // --- 如果没有匹配的路由 ---
    else {
      console.warn(`ROUTER: No route matched for ${method} ${path}`);
      const notFoundResponsePayload = { message: '请求的端点未找到。' };
      originalResponse = new Response(JSON.stringify(notFoundResponsePayload), {
        status: 404,
        headers: { 'Content-Type': 'application/json' }, // 内部处理器仍设置自己的Content-Type
      });
    }

    // 为所有来自路由处理器的响应添加CORS头部
    return addCorsHeaders(originalResponse, requestOrigin);
  },
};