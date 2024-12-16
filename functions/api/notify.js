export async function onRequest(context) {
    const { request, env } = context;
    const url = new URL(request.url);

    // 验证访问密钥
    const key = url.searchParams.get('key');
    const reminderId = url.searchParams.get('id');
    
    if (!key || key !== env.CRON_SECRET || !reminderId) {
        return new Response('Unauthorized', { status: 401 });
    }

    try {
        // 获取提醒详情
        const { results } = await env.DB.prepare(
            'SELECT * FROM reminders WHERE id = ? AND status = 0'
        ).bind(reminderId).all();

        if (!results || results.length === 0) {
            return new Response('Reminder not found or already processed', { status: 404 });
        }

        const reminder = results[0];

        // 发送到Telegram
        if (env.TG_BOT_TOKEN && env.TG_CHAT_ID) {
            try {
                const tgMessage = `🔔 提醒：${reminder.title}\n\n${reminder.content}\n\n⏰ 提醒时间：${new Date(reminder.remind_time).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })}`;
                const tgResponse = await fetch(`https://api.telegram.org/bot${env.TG_BOT_TOKEN}/sendMessage`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        chat_id: env.TG_CHAT_ID,
                        text: tgMessage
                    })
                });

                if (!tgResponse.ok) {
                    const error = await tgResponse.text();
                    console.error('Telegram API error:', error);
                }
            } catch (error) {
                console.error('Error sending Telegram message:', error);
            }
        }

        // 发送到企业微信
        if (env.WECOM_KEY) {
            try {
                const wecomMessage = {
                    msgtype: 'text',
                    text: {
                        content: `🔔 提醒：${reminder.title}\n\n${reminder.content}\n\n⏰ 提醒时间：${new Date(reminder.remind_time).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })}`
                    }
                };
                const wecomResponse = await fetch(`https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=${env.WECOM_KEY}`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(wecomMessage)
                });

                if (!wecomResponse.ok) {
                    const error = await wecomResponse.text();
                    console.error('WeCom API error:', error);
                }
            } catch (error) {
                console.error('Error sending WeCom message:', error);
            }
        }

        // 更新提醒状态为已发送
        await env.DB.prepare(
            'UPDATE reminders SET status = 1 WHERE id = ?'
        ).bind(reminderId).run();

        // 删除定时任务
        if (reminder.cron_job_id && env.CRONJOB_API_KEY) {
            try {
                const deleteResponse = await fetch(`https://api.cron-job.org/jobs/${reminder.cron_job_id}`, {
                    method: 'DELETE',
                    headers: {
                        'Authorization': `Bearer ${env.CRONJOB_API_KEY}`
                    }
                });

                if (!deleteResponse.ok) {
                    console.error('Failed to delete cron job:', await deleteResponse.text());
                }
            } catch (error) {
                console.error('Error deleting cron job:', error);
            }
        }

        return new Response(JSON.stringify({ success: true }), {
            headers: { 'Content-Type': 'application/json' }
        });
    } catch (error) {
        console.error('Notification error:', error);
        return new Response(error.message, { status: 500 });
    }
} 