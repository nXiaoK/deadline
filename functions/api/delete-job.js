export async function onRequest(context) {
    const { request, env } = context;
    const url = new URL(request.url);

    // 验证访问密钥
    const key = url.searchParams.get('key');
    const jobId = url.searchParams.get('jobId');
    
    if (!key || key !== env.CRON_SECRET || !jobId) {
        return new Response('Unauthorized', { status: 401 });
    }

    try {
        // 删除定时任务
        const deleteResponse = await fetch(`https://api.cron-job.org/jobs/${jobId}`, {
            method: 'DELETE',
            headers: {
                'Authorization': `Bearer ${env.CRONJOB_API_KEY}`
            }
        });

        if (!deleteResponse.ok) {
            console.error('Failed to delete cron job:', await deleteResponse.text());
            return new Response('Failed to delete job', { status: 500 });
        }

        return new Response(JSON.stringify({ success: true }), {
            headers: { 'Content-Type': 'application/json' }
        });
    } catch (error) {
        console.error('Error deleting job:', error);
        return new Response(error.message, { status: 500 });
    }
} 