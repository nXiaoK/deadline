export async function onRequest(context) {
    const { env } = context;

    try {
        // 获取当前时间前后5分钟内需要提醒的事项
        const now = new Date();
        const fiveMinutesAgo = new Date(now.getTime() - 5 * 60000);
        const fiveMinutesLater = new Date(now.getTime() + 5 * 60000);

        const { results } = await env.DB.prepare(`
            SELECT * FROM reminders 
            WHERE status = 0 
            AND remind_time BETWEEN ? AND ?
        `).bind(
            fiveMinutesAgo.toISOString(),
            fiveMinutesLater.toISOString()
        ).all();

        // 如果没有需要提醒的事项，直接返回
        if (!results || results.length === 0) {
            return new Response('No reminders to process');
        }

        // 处理每个提醒
        for (const reminder of results) {
            // 发送到Telegram
            if (env.TG_BOT_TOKEN && env.TG_CHAT_ID) {
                const tgMessage = `🔔 提醒：${reminder.title}\n\n${reminder.content}\n\n⏰ 提醒时间：${new Date(reminder.remind_time).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })}`;
                await fetch(`https://api.telegram.org/bot${env.TG_BOT_TOKEN}/sendMessage`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        chat_id: env.TG_CHAT_ID,
                        text: tgMessage,
                        parse_mode: 'HTML'
                    })
                });
            }

            // 发送到企业微信
            if (env.WECOM_KEY) {
                const wecomMessage = {
                    msgtype: 'text',
                    text: {
                        content: `🔔 提醒：${reminder.title}\n\n${reminder.content}\n\n⏰ 提醒时间：${new Date(reminder.remind_time).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })}`
                    }
                };
                await fetch(`https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=${env.WECOM_KEY}`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(wecomMessage)
                });
            }

            // 更新提醒状态为已发送
            await env.DB.prepare(
                'UPDATE reminders SET status = 1 WHERE id = ?'
            ).bind(reminder.id).run();
        }

        return new Response(`Processed ${results.length} reminders`);
    } catch (error) {
        console.error('Error:', error);
        return new Response(error.message, { status: 500 });
    }
} 