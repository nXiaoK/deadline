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

        let cronJobDeleted = false;
        let cronJobError = null;

        // 如果有cron job ID，先尝试删除定时任务
        if (cronJobId) {
            try {
                console.log('Deleting cron job:', cronJobId);
                const cronResponse = await fetch(`https://api.cron-job.org/jobs/${cronJobId}`, {
                    method: 'DELETE',
                    headers: {
                        'Authorization': `Bearer ${env.CRONJOB_API_KEY}`
                    }
                });

                const responseText = await cronResponse.text();
                console.log('Cron job delete response:', responseText);

                if (!cronResponse.ok) {
                    throw new Error(`Failed to delete cron job. Status: ${cronResponse.status}, Response: ${responseText}`);
                }

                try {
                    const responseData = JSON.parse(responseText);
                    if (!responseData.success) {
                        throw new Error(responseData.error || 'Unknown error');
                    }
                    cronJobDeleted = true;
                    console.log('Successfully deleted cron job:', cronJobId);
                } catch (parseError) {
                    throw new Error(`Invalid response from cron-job.org: ${responseText}`);
                }
            } catch (error) {
                console.error('Error deleting cron job:', error);
                cronJobError = error.message;
                // 不立即返回错误，继续记录错误信息
            }
        }

        // 只有在成功删除定时任务后（或没有定时任务需要删除时），才删除数据库记录
        if (!cronJobId || cronJobDeleted) {
            // 删除数据库记录
            const result = await env.DB.prepare(
                'DELETE FROM reminders WHERE id = ?'
            ).bind(reminderId).run();

            console.log('Database delete result:', result);

            return new Response(JSON.stringify({ 
                success: true,
                message: 'Reminder and cron job deleted successfully'
            }), { headers });
        } else {
            // 如果定时任务删除失败，返回错误
            return new Response(JSON.stringify({ 
                success: false, 
                error: `Failed to delete cron job: ${cronJobError}`
            }), { 
                status: 500, 
                headers 
            });
        }
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