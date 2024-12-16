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

            // 创建定时任务URL（包含认证信息）
            const notifyUrl = `${url.origin}/api/notify?key=${env.CRON_SECRET}&id=${reminder.id}`;
            
            // 计算定时任务时间
            const scheduleDate = new Date(reminder.remind_time);
            
            // 创建cron-job.org定时任务
            try {
                console.log('Creating cron job for:', scheduleDate.toISOString());
                
                // 确保时间在当前时间之后
                const now = new Date();
                const startDate = new Date(Math.max(now.getTime(), scheduleDate.getTime() - 60000)); // 提前1分钟开始
                const endDate = new Date(scheduleDate.getTime() + 120000); // 结束时间设为提醒时间后2分钟

                const jobData = {
                    job: {
                        url: notifyUrl,
                        title: `Reminder: ${reminder.title}`,
                        enabled: true,
                        saveResponses: true,
                        schedule: {
                            timezone: 'Asia/Shanghai',
                            hours: [scheduleDate.getHours()],
                            minutes: [scheduleDate.getMinutes()],
                            mdays: [scheduleDate.getDate()],
                            months: [scheduleDate.getMonth() + 1],
                            wdays: [scheduleDate.getDay() === 0 ? 7 : scheduleDate.getDay()],
                            startsAt: {
                                year: startDate.getFullYear(),
                                month: startDate.getMonth() + 1,
                                day: startDate.getDate(),
                                hour: startDate.getHours(),
                                minute: startDate.getMinutes()
                            },
                            expiresAt: {
                                year: endDate.getFullYear(),
                                month: endDate.getMonth() + 1,
                                day: endDate.getDate(),
                                hour: endDate.getHours(),
                                minute: endDate.getMinutes()
                            }
                        },
                        requestMethod: 0,
                        extendedData: {
                            headers: []
                        }
                    }
                };

                console.log('Creating job with data:', JSON.stringify(jobData, null, 2));

                const cronResponse = await fetch('https://api.cron-job.org/jobs', {
                    method: 'PUT',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${env.CRONJOB_API_KEY}`
                    },
                    body: JSON.stringify(jobData)
                });

                const cronResponseText = await cronResponse.text();
                console.log('Cron-job.org response:', cronResponseText);

                if (!cronResponse.ok) {
                    console.error('Cron-job.org API error:', cronResponseText);
                    throw new Error('Failed to create cron job');
                }

                const cronResult = JSON.parse(cronResponseText);
                
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