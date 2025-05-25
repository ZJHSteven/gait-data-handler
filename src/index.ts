// src/index.ts

import { Env } from './types';
import { handleIngestRequest } from './handlers/ingestHandler';
import { handleStartSession, handleEndSession, handleListSessions } from './handlers/sessionHandler'; // 导入会话处理器
// import { handleQueryRequest } from './handlers/queryHandler'; // 将来导入查询处理器

export default {
  async fetch(
    request: Request,
    env: Env,
    ctx: ExecutionContext
  ): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;
    const method = request.method;

    console.log(`ROUTER: Received request: ${method} ${path}`);

    // 数据摄入路由
    if (method === 'POST' && path === '/api/ingest') {
      return handleIngestRequest(request, env);
    }
    // 开始会话路由
    else if (method === 'POST' && path === '/api/session/start') {
      return handleStartSession(request, env);
    }
    // 结束会话路由
    else if (method === 'POST' && path === '/api/session/end') { // 您也可以用 PUT 方法
      return handleEndSession(request, env);
	}
	// 列出会话路由
	else if (method === 'GET' && path === '/api/sessions') {
		return handleListSessions(request, env);
	  }
    // 将来添加数据查询路由
    // else if (method === 'GET' && path.startsWith('/api/query')) {
    //   return handleQueryRequest(request, env);
    // }

    console.warn(`ROUTER: No route matched for ${method} ${path}`);
    return new Response(JSON.stringify({ message: 'Endpoint not found.' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' },
    });
  },
};