// src/index.ts

import { Env } from './types';
import { handleIngestRequest } from './handlers/ingestHandler';
import { handleStartSession, handleEndSession, handleListSessions } from './handlers/sessionHandler'; // 导入会话处理器
import { handleQueryDataByExperimentName } from './handlers/queryHandler'; // 导入新的查询处理器

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
  // 数据查询路由
    // 示例: GET /api/data/experiment?name=MyExperimentName 
    // (注意：这里的路径是 /api/data/experiment，与 queryHandler 中假设的略有不同，您可以统一)
    else if (method === 'GET' && path === '/api/data/experiment') { 
      return handleQueryDataByExperimentName(request, env);
    }
    
    // --- 如果没有匹配的路由 ---
    console.warn(`ROUTER: No route matched for ${method} ${path}`);
    return new Response(JSON.stringify({ message: 'Endpoint not found.' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' },
    });
  },
};