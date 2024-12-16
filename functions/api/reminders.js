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
            
            // 解析时间字符串（格式：YYYY-MM-DDTHH:mm）
            const [datePart, timePart] = reminder.remind_time.split('T');
            const [hours, minutes] = timePart.split(':').map(Number);
            const [year, month, day] = datePart.split('-').map(Number);

            // 计算过期时间（执行时间后5分钟）
            let expiryMinutes = minutes + 5;
            let expiryHours = hours;
            let expiryDay = day;
            let expiryMonth = month;
            let expiryYear = year;

            // 处理分钟进位
            if (expiryMinutes >= 60) {
                expiryMinutes -= 60;
                expiryHours += 1;
            }
            // 处理小时进位
            if (expiryHours >= 24) {
                expiryHours -= 24;
                expiryDay += 1;
            }
            // 简单处理月份进位（假设每月30天）
            if (expiryDay > 30) {
                expiryDay = 1;
                expiryMonth += 1;
                if (expiryMonth > 12) {
                    expiryMonth = 1;
                    expiryYear += 1;
                }
            }
            
            // 创建cron-job.org定时任务
            try {
                console.log('Creating cron job for:', reminder.remind_time);
                console.log('Parsed time:', { hours, minutes, year, month, day });
                console.log('Expiry time:', { 
                    year: expiryYear, 
                    month: expiryMonth, 
                    day: expiryDay, 
                    hours: expiryHours, 
                    minutes: expiryMinutes 
                });
                
                const cronResponse = await fetch('https://api.cron-job.org/jobs', {
                    method: 'PUT',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${env.CRONJOB_API_KEY}`
                    },
                    body: JSON.stringify({
                        job: {
                            url: notifyUrl,
                            title: `Reminder: ${reminder.title}`,
                            enabled: true,
                            saveResponses: true,
                            lastExecution: null,
                            notifications: {
                                onSuccess: true,
                                onFailure: true,
                                onDisable: true
                            },
                            schedule: {
                                timezone: 'Asia/Shanghai',
                                hours: [hours],
                                minutes: [minutes],
                                mdays: [day],
                                months: [month],
                                wdays: [(new Date(year, month - 1, day)).getDay() || 7],
                                expiresAt: {
                                    year: expiryYear,
                                    month: expiryMonth,
                                    day: expiryDay,
                                    hour: expiryHours,
                                    minute: expiryMinutes
                                }
                            },
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