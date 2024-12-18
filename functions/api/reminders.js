export async function onRequest(context) {
    const { request, env } = context;
    const url = new URL(request.url);

    // CORS 头
    const headers = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Content-Type': 'application/json'
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
            return new Response(JSON.stringify(results), { headers });
        }

        // POST 请求 - 添加新提醒
        if (request.method === 'POST') {
            const reminder = await request.json();
            
            // 验证必要字段
            if (!reminder.title || !reminder.content || !reminder.remind_time || !reminder.cycle_type) {
                return new Response(JSON.stringify({ error: 'Missing required fields' }), {
                    status: 400,
                    headers
                });
            }

            // 插入数据
            await env.DB.prepare(
                'INSERT INTO reminders (id, title, content, remind_time, cycle_type, status, link, amount, currency, monthly_amount, yearly_amount) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
            )
            .bind(
                reminder.id,
                reminder.title,
                reminder.content,
                reminder.remind_time,
                reminder.cycle_type,
                0, // status 默认为 0
                reminder.link,
                reminder.amount,
                reminder.currency,
                reminder.monthly_amount,
                reminder.yearly_amount
            )
            .run();


            // 创建定时任务URL（包含认证信息）
            const notifyUrl = `${url.origin}/api/notify?key=${env.CRON_SECRET}&id=${reminder.id}`;
            
            // 计算定时任务时间
            const scheduleDate = new Date(reminder.remind_time);
            
            // 创建定时任务的配置
            const jobConfig = {
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
                requestMethod: 0,
                extendedData: {
                    headers: []
                }
            };

            // 根据循环类型设置不同的日期参数
            if (reminder.cycle_type === 'once') {
                // 单次执行：设置具体的执行时间
                const dayOfWeek = scheduleDate.getDay();
                // 计算过期时间（执行时间后1分钟）
                const expiryDate = new Date(scheduleDate.getTime() + 60000);
                // 格式化为YYYYMMDDhhmmss
                const expiresAt = expiryDate.getFullYear().toString() +
                    String(expiryDate.getMonth() + 1).padStart(2, '0') +
                    String(expiryDate.getDate()).padStart(2, '0') +
                    String(expiryDate.getHours()).padStart(2, '0') +
                    String(expiryDate.getMinutes()).padStart(2, '0') +
                    String(expiryDate.getSeconds()).padStart(2, '0');

                jobConfig.schedule = {
                    timezone: 'Asia/Shanghai',
                    hours: [scheduleDate.getHours()],
                    minutes: [scheduleDate.getMinutes()],
                    mdays: [scheduleDate.getDate()],
                    months: [scheduleDate.getMonth() + 1],
                    wdays: [dayOfWeek],  // 直接使用 getDay() 返回的值，0 表示周日
                    expiresAt: parseInt(expiresAt)
                };
                jobConfig.enabled = true;
                jobConfig.stopOnError = false;
                jobConfig.save_responses = true;
            } else if (reminder.cycle_type === 'weekly') {
                // 每周循环：设置星期几和时间，以及所有可能的月份和日期
                const dayOfWeek = scheduleDate.getDay();
                jobConfig.schedule = {
                    timezone: 'Asia/Shanghai',
                    hours: [scheduleDate.getHours()],
                    minutes: [scheduleDate.getMinutes()],
                    wdays: [dayOfWeek],  // 直接使用 getDay() 返回的值，0 表示周日
                    mdays: Array.from({length: 31}, (_, i) => i + 1), // 1-31日
                    months: Array.from({length: 12}, (_, i) => i + 1)  // 1-12月
                };
            } else if (reminder.cycle_type === 'yearly') {
                // 每年循环：设置固定的月份和日期
                jobConfig.schedule = {
                    timezone: 'Asia/Shanghai',
                    hours: [scheduleDate.getHours()],
                    minutes: [scheduleDate.getMinutes()],
                    mdays: [scheduleDate.getDate()],
                    months: [scheduleDate.getMonth() + 1],
                    wdays: [0, 1, 2, 3, 4, 5, 6]  // 修改为包含0(周日)而不是7
                };
            } else {
                // 每月循环：只设置固定的日期
                jobConfig.schedule = {
                    timezone: 'Asia/Shanghai',
                    hours: [scheduleDate.getHours()],
                    minutes: [scheduleDate.getMinutes()],
                    mdays: [scheduleDate.getDate()],
                    months: Array.from({length: 12}, (_, i) => i + 1),  // 所有月份
                    wdays: [0, 1, 2, 3, 4, 5, 6]  // 修改为包含0(周日)而不是7
                };
            }

            // 创建cron-job.org定时任务
            try {
                console.log('Creating cron job for:', scheduleDate.toISOString(), 'with cycle type:', reminder.cycle_type);
                console.log('Job config:', JSON.stringify(jobConfig, null, 2));
                
                const cronResponse = await fetch('https://api.cron-job.org/jobs', {
                    method: 'PUT',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${env.CRONJOB_API_KEY}`
                    },
                    body: JSON.stringify({ job: jobConfig })
                });

                const cronResponseText = await cronResponse.text();
                console.log('Cron-job.org response:', cronResponseText);

                if (!cronResponse.ok) {
                    console.error('Cron-job.org API error:', cronResponseText);
                    throw new Error('Failed to create cron job');
                }

                const cronResult = JSON.parse(cronResponseText);
                console.log('Created cron job with ID:', cronResult.jobId);
                
                // 更新数据库中的定时任务ID（确保是整数）
                const jobId = parseInt(cronResult.jobId);
                if (isNaN(jobId)) {
                    throw new Error('Invalid job ID returned from cron-job.org');
                }
                await env.DB.prepare(
                    'UPDATE reminders SET cron_job_id = ? WHERE id = ?'
                ).bind(jobId, reminder.id).run();

            } catch (error) {
                console.error('Error creating cron job:', error);
                // 即使创建定时任务失败，我们也保留提醒记录
            }

            return new Response(JSON.stringify({ success: true }), { headers });
        }

        return new Response(JSON.stringify({ error: 'Method not allowed' }), { 
            status: 405, 
            headers 
        });
    } catch (error) {
        console.error('Error:', error);
        return new Response(JSON.stringify({
            success: false,
            error: error.message
        }), { 
            status: 500, 
            headers 
        });
    }
} 
