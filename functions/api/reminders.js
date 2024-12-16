export async function onRequest(context) {
    const { request, env } = context;
    const url = new URL(request.url);

    // CORS 头
    const headers = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
    };

    // 处理 OPTIONS 请求
    if (request.method === 'OPTIONS') {
        return new Response(null, { headers });
    }

    try {
        // GET 请求 - 获取所有提醒
        if (request.method === 'GET') {
            const { results } = await env.DB.prepare(
                'SELECT * FROM reminders ORDER BY remind_time ASC'
            ).all();
            return new Response(JSON.stringify(results), {
                headers: { ...headers, 'Content-Type': 'application/json' },
            });
        }

        // POST 请求 - 添加新提醒
        if (request.method === 'POST') {
            const reminder = await request.json();
            
            // 验证必要字段
            if (!reminder.title || !reminder.content || !reminder.remind_time) {
                return new Response('Missing required fields', {
                    status: 400,
                    headers
                });
            }

            // 插入数据
            await env.DB.prepare(
                'INSERT INTO reminders (id, title, content, remind_time, status) VALUES (?, ?, ?, ?, ?)'
            ).bind(
                reminder.id,
                reminder.title,
                reminder.content,
                reminder.remind_time,
                0
            ).run();

            return new Response(JSON.stringify({ success: true }), {
                headers: { ...headers, 'Content-Type': 'application/json' },
            });
        }

        return new Response('Method not allowed', { status: 405, headers });
    } catch (error) {
        console.error('Error:', error);
        return new Response(error.message, { status: 500, headers });
    }
} 