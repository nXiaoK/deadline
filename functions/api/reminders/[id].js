export async function onRequest(context) {
    const { request, env } = context;

    // CORS 头
    const headers = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'DELETE, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Content-Type': 'application/json'
    };

    // 处理 OPTIONS 请求
    if (request.method === 'OPTIONS') {
        return new Response(null, { headers });
    }

    // 只处理 DELETE 请求
    if (request.method !== 'DELETE') {
        return new Response(JSON.stringify({ error: 'Method not allowed' }), { 
            status: 405, 
            headers 
        });
    }

    try {
        // 从URL中获取ID
        const url = new URL(request.url);
        const pathParts = url.pathname.split('/');
        const reminderId = pathParts[pathParts.length - 1];

        console.log('Deleting reminder:', reminderId);
        
        // 从请求体中获取cron job ID
        const body = await request.json();
        const cronJobId = body.cronJobId;
        console.log('Cron job ID:', cronJobId);

        // 删除数据库记录
        const result = await env.DB.prepare(
            'DELETE FROM reminders WHERE id = ?'
        ).bind(reminderId).run();

        console.log('Database delete result:', result);

        // 如果有cron job ID，也删除定时任务
        if (cronJobId) {
            try {
                console.log('Deleting cron job:', cronJobId);
                // 构造删除URL，使用与创建任务相同的认证方式
                const deleteUrl = `${url.origin}/api/notify?key=${env.CRON_SECRET}&id=${reminderId}`;
                const cronResponse = await fetch(deleteUrl, {
                    method: 'DELETE'
                });

                if (!cronResponse.ok) {
                    console.error('Failed to delete cron job:', await cronResponse.text());
                    throw new Error('Failed to delete cron job');
                }

                console.log('Successfully deleted cron job:', cronJobId);
            } catch (error) {
                console.error('Error deleting cron job:', error);
                return new Response(JSON.stringify({ 
                    success: false, 
                    error: `Failed to delete cron job: ${error.message}`
                }), { 
                    status: 500, 
                    headers 
                });
            }
        }

        return new Response(JSON.stringify({ 
            success: true,
            message: 'Reminder and cron job deleted successfully'
        }), { headers });
    } catch (error) {
        console.error('Error during deletion:', error);
        return new Response(JSON.stringify({ 
            success: false, 
            error: error.message 
        }), { 
            status: 500, 
            headers 
        });
    }
} 