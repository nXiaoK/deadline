export async function onRequest(context) {
    const { request, env } = context;

    // 验证访问密钥
    const url = new URL(request.url);
    const key = url.searchParams.get('key');
    
    if (!key || key !== env.CRON_SECRET) {
        return new Response('Unauthorized', { status: 401 });
    }

    try {
        // 获取当前北京时间
        const now = new Date();
        // 调整为北京时间
        now.setHours(now.getHours() + 8);
        
        const fiveMinutesAgo = new Date(now.getTime() - 5 * 60000);
        const fiveMinutesLater = new Date(now.getTime() + 5 * 60000);

        console.log('Checking reminders between:', fiveMinutesAgo.toISOString(), 'and', fiveMinutesLater.toISOString());

        const { results } = await env.DB.prepare(`
            SELECT * FROM reminders 
            WHERE status = 0 
            AND remind_time BETWEEN ? AND ?
        `).bind(
            fiveMinutesAgo.toISOString(),
            fiveMinutesLater.toISOString()
        ).all();

        console.log('Found reminders:', results);

        // 如果没有需要提醒的事项，直接返回
        if (!results || results.length === 0) {
            return new Response(JSON.stringify({ message: 'No reminders to process' }), {
                headers: { 'Content-Type': 'application/json' }
            });
        }

        // 处理每个提醒
        for (const reminder of results) {
            console.log('Processing reminder:', reminder);

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
            ).bind(reminder.id).run();
        }

        return new Response(JSON.stringify({
            success: true,
            processed: results.length,
            message: `Processed ${results.length} reminders`
        }), {
            headers: { 'Content-Type': 'application/json' }
        });
    } catch (error) {
        console.error('Cron job error:', error);
        return new Response(JSON.stringify({
            success: false,
            error: error.message
        }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' }
        });
    }
} 