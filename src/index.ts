// src/index.ts

/**
 * 定义 ESP32 发送过来的数据包结构。
 * 这就是 TypeScript 的 "interface" (接口)，它描述了一个对象的形状。
 * 当我们从请求中解析 JSON 时，告诉 TypeScript 我们期望得到这种结构的数据，
 * 这样 TypeScript 就能帮我们检查代码是否正确使用了这些数据。
 */
interface Esp32DataPayload {
	device: string; // 对应 gait_data 表的 device 列 (例如 "left_hip")
	timestamp: number; // 对应 gait_data 表的 timestamp 列 (秒级 Unix 时间戳)
	quaternions: Array<{ w: number; x: number; y: number; z: number }>; // 四元数样本数组
	note?: string; // '?' 表示这个字段是可选的，可能没有。对应 gait_data 表的 note 列
  }
  
  /**
   * 定义我们的 Worker 环境中绑定的资源。
   * `worker-configuration.d.ts` 文件会自动根据 wrangler.jsonc 中的绑定 (比如 D1)
   * 来增强这个 Env 类型，所以 TypeScript 知道 env.DB 是一个 D1Database 对象。
   */
  export interface Env {
	DB: D1Database; // 'DB' 必须和您在 wrangler.jsonc 中 "binding" 字段设置的名称一致
  }
  
  // 这是 Worker 的主入口，处理所有进来的 HTTP 请求
  // export default 定义了这个模块的默认导出对象
  export default {
	/**
	 * fetch 方法是必须的，当 Worker 收到 HTTP 请求时，这个方法会被调用。
	 * 参数：
	 * - request: Request 对象，包含了请求的所有信息 (URL, 方法, headers, body 等)
	 * - env: Env 对象，包含了您在 wrangler.jsonc 中配置的绑定 (比如 env.DB)
	 * - ctx: ExecutionContext 对象，用于在请求处理完毕后执行一些任务 (比如 ctx.waitUntil)
	 * 返回值：
	 * - Promise<Response>: 必须返回一个 Promise，它最终会解析为一个 Response 对象
	 */
	async fetch(
	  request: Request, // 'Request' 是 TypeScript 内置的类型，代表 HTTP 请求
	  env: Env, // 'Env' 是我们上面定义的接口，包含了 D1 数据库绑定
	  ctx: ExecutionContext // 'ExecutionContext' 是 Cloudflare Workers 提供的类型
	): Promise<Response> { // 'Promise<Response>' 表示这个函数异步返回一个 Response 对象
  
	  // 教学点：检查 HTTP 方法
	  // 我们只希望处理 ESP32 发送过来的 POST 请求
	  if (request.method !== 'POST') {
		return new Response('Expected POST request', { status: 405 }); // 405 Method Not Allowed
	  }
  
	  try {
		// 教学点：解析 JSON 数据 和 TypeScript 类型断言
		// request.json() 会读取请求体并尝试将其解析为 JSON。
		// <Esp32DataPayload> 告诉 TypeScript：“请把解析结果当做 Esp32DataPayload 类型处理”
		// 这样如果 JSON 结构不匹配，或者我们后续错误地使用了数据，TypeScript 会提示。
		const incomingData = await request.json<Esp32DataPayload>();
  
		// 教学点：数据校验 (基础)
		// 即使有 TypeScript 类型检查，运行时的数据校验仍然重要，因为外部数据不可信。
		if (!incomingData.device || typeof incomingData.timestamp !== 'number' || !incomingData.quaternions) {
		  return new Response('Missing required fields: device, timestamp, or quaternions', { status: 400 }); // 400 Bad Request
		}
  
		if (!Array.isArray(incomingData.quaternions) || incomingData.quaternions.length === 0) {
		  return new Response('Field "quaternions" must be a non-empty array and contain at least one sample for this second', { status: 400 });
		}
		// 您要求每秒包含50个样本，如果需要严格检查样本数量，可以在这里添加：
		// if (incomingData.quaternions.length !== 50) {
		//   return new Response(`Expected 50 quaternion samples, but received ${incomingData.quaternions.length}`, { status: 400 });
		// }
  
  
		// 教学点：数据转换
		// D1 数据库的 TEXT 类型适合存储 JSON 字符串。
		// 我们将四元数样本数组 (它是一个对象数组) 转换为 JSON 字符串。
		const quaternionsJsonString: string = JSON.stringify(incomingData.quaternions);
		// ': string' 是 TypeScript 的类型注解，明确表示这个变量是字符串类型。
  
		// 教学点：与 D1 数据库交互 (SQL 预处理语句)
		// 这是我们的 SQL INSERT 语句。问号 (?) 是占位符，后续会用实际值替换。
		// 这种方式叫“预处理语句”(Prepared Statement)，可以有效防止 SQL 注入攻击。
		const sqlQuery: string = 'INSERT INTO gait_data (device, timestamp, quaternions, note) VALUES (?, ?, ?, ?)';
  
		const stmt = env.DB.prepare(sqlQuery);
  
		// 教学点：绑定参数到 SQL 语句并执行
		// .bind() 方法的参数顺序必须与 SQL 语句中 ? 的顺序严格一致。
		const { success, error } = await stmt.bind(
		  incomingData.device,       // 第一个 ? 对应 device
		  incomingData.timestamp,    // 第二个 ? 对应 timestamp
		  quaternionsJsonString,     // 第三个 ? 对应 quaternions (JSON 字符串)
		  incomingData.note || null  // 第四个 ? 对应 note。如果 note 不存在，则插入 NULL
									 // '|| null' 确保如果 incomingData.note 是 undefined，我们传递 null 给数据库
		).run(); // .run() 执行不需要返回数据行的 SQL (INSERT, UPDATE, DELETE)
  
		// 教学点：处理数据库操作结果
		if (success) {
		  // 可以在 Worker 日志中看到这条信息 (通过 wrangler dev 或 Cloudflare Dashboard)
		  console.log(`Data inserted for device: ${incomingData.device} at timestamp: ${incomingData.timestamp}`);
		  return new Response('Data received and stored successfully!', { status: 201 }); // 201 Created
		} else {
		  console.error('D1 DB Error:', error); // 在 Worker 日志中记录详细错误
		  return new Response('Failed to store data in database.', { status: 500 }); // 500 Internal Server Error
		}
  
	  } catch (e: any) { // 'e: any' 捕获任何类型的错误，更精确的错误处理会更好
		console.error('Worker Error:', e);
		// 教学点：错误类型判断
		if (e instanceof SyntaxError) { // 如果是 JSON 解析错误
		  return new Response('Invalid JSON payload provided', { status: 400 }); // 400 Bad Request
		}
		// 其他未知错误
		return new Response(`Error processing request: ${e.message}`, { status: 500 });
	  }
	},
  };