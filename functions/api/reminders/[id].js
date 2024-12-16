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
                // 根据API文档，需要在URL中添加jobId参数
                const cronResponse = await fetch('https://api.cron-job.org/jobs', {
                    method: 'DELETE',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${env.CRONJOB_API_KEY}`
                    },
                    body: JSON.stringify({
                        jobId: parseInt(cronJobId)  // 确保jobId是数字
                    })
                });

                const cronResponseText = await cronResponse.text();
                console.log('Cron job delete response:', cronResponseText);

                if (!cronResponse.ok) {
                    const errorData = JSON.parse(cronResponseText);
                    console.error('Failed to delete cron job:', errorData);
                    throw new Error(`Failed to delete cron job: ${errorData.error || 'Unknown error'}`);
                }

                const responseData = JSON.parse(cronResponseText);
                if (!responseData.success) {
                    throw new Error(`Failed to delete cron job: ${responseData.error || 'Unknown error'}`);
                }
            } catch (error) {
                console.error('Error deleting cron job:', error);
                // 即使删除定时任务失败，我们也继续返回成功
                // 因为数据库记录已经删除了
            }
        }

        return new Response(JSON.stringify({ success: true }), { headers });
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