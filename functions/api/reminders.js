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
            if (!reminder.title || !reminder.content || !reminder.remind_time || !reminder.cycle_type) {
                return new Response('Missing required fields', {
                    status: 400,
                    headers
                });
            }

            // 插入数据
            await env.DB.prepare(
                'INSERT INTO reminders (id, title, content, remind_time, cycle_type, status) VALUES (?, ?, ?, ?, ?, ?)'
            ).bind(
                reminder.id,
                reminder.title,
                reminder.content,
                reminder.remind_time,
                reminder.cycle_type,
                0
            ).run();

            // 创建定时任务URL（包含认证信息）
            const notifyUrl = `${url.origin}/api/notify?key=${env.CRON_SECRET}&id=${reminder.id}`;
            
            // 计算定时任务时间
            const scheduleDate = new Date(reminder.remind_time);
            
            // 根据循环类型设置定时任务
            const schedule = {
                timezone: 'Asia/Shanghai',
                hours: [scheduleDate.getHours()],
                minutes: [scheduleDate.getMinutes()]
            };

            // 根据循环类型设置不同的日期参数
            switch (reminder.cycle_type) {
                case 'yearly':
                    // 每年循环：设置固定的月份和日期
                    schedule.mdays = [scheduleDate.getDate()];
                    schedule.months = [scheduleDate.getMonth() + 1];
                    break;
                case 'monthly':
                    // 每月循环：只设置固定的日期
                    schedule.mdays = [scheduleDate.getDate()];
                    // 所有月份
                    schedule.months = Array.from({length: 12}, (_, i) => i + 1);
                    break;
                default:
                    // 单次提醒：设置具体的日期和月份
                    schedule.mdays = [scheduleDate.getDate()];
                    schedule.months = [scheduleDate.getMonth() + 1];
                    // 设置过期时间为执行后1分钟
                    schedule.expiresAt = {
                        year: scheduleDate.getFullYear(),
                        month: scheduleDate.getMonth() + 1,
                        day: scheduleDate.getDate(),
                        hour: scheduleDate.getHours(),
                        minute: scheduleDate.getMinutes() + 1
                    };
            }

            // 创建cron-job.org定时任务
            try {
                console.log('Creating cron job for:', scheduleDate.toISOString(), 'with cycle type:', reminder.cycle_type);
                
                const cronResponse = await fetch('https://api.cron-job.org/jobs', {
                    method: 'PUT',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${env.CRONJOB_API_KEY}`
                    },
                    body: JSON.stringify({
                        job: {
                            url: notifyUrl,
                            title: `Reminder: ${reminder.title} (${reminder.cycle_type})`,
                            enabled: true,
                            saveResponses: true,
                            lastExecution: null,
                            notifications: {
                                onSuccess: true,
                                onFailure: true,
                                onDisable: true
                            },
                            schedule,
                            requestMethod: 0,
                            extendedData: {
                                headers: []
                            }
                        }
                    })
                });

                const cronResponseText = await cronResponse.text();
                console.log('Cron-job.org response:', cronResponseText);

                if (!cronResponse.ok) {
                    console.error('Cron-job.org API error:', cronResponseText);
                    throw new Error('Failed to create cron job');
                }

                const cronResult = JSON.parse(cronResponseText);
                console.log('Created cron job with ID:', cronResult.jobId);
                
                // 更新数据库中的定时任务ID
                await env.DB.prepare(
                    'UPDATE reminders SET cron_job_id = ? WHERE id = ?'
                ).bind(cronResult.jobId, reminder.id).run();

            } catch (error) {
                console.error('Error creating cron job:', error);
                // 即使创建定时任务失败，我们也保留提醒记录
            }

            return new Response(JSON.stringify({ success: true }), {
                headers: { ...headers, 'Content-Type': 'application/json' },
            });
        }

        return new Response('Method not allowed', { status: 405, headers });
    } catch (error) {
        console.error('Error:', error);
        return new Response(JSON.stringify({
            success: false,
            error: error.message
        }), { 
            status: 500, 
            headers: { ...headers, 'Content-Type': 'application/json' }
        });
    }
} 