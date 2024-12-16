# 提醒事项管理系统

这是一个基于Cloudflare Pages的提醒事项管理系统，支持发送提醒到Telegram机器人和企业微信机器人。

## 功能特点

- 使用北京时间
- 支持无限添加提醒事项
- 按时间排序显示
- 精确到分钟的提醒
- 支持Telegram和企业微信机器人通知
- 使用Cloudflare D1数据库存储数据

## 部署步骤

1. Fork 此仓库到你的GitHub账号

2. 在Cloudflare Pages中创建新项目
   - 连接你的GitHub仓库
   - 选择main分支
   - 构建设置：
     - 构建命令：不需要
     - 输出目录：/

3. 在Cloudflare中设置环境变量
   - `TG_BOT_TOKEN`: Telegram机器人Token
   - `TG_CHAT_ID`: Telegram聊天ID
   - `WECOM_KEY`: 企业微信机器人Key

4. 创建D1数据库
   ```sql
   CREATE TABLE reminders (
       id TEXT PRIMARY KEY,
       title TEXT NOT NULL,
       content TEXT NOT NULL,
       remind_time DATETIME NOT NULL,
       created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
       status INTEGER DEFAULT 0
   );
   ```

5. 绑定数据库
   - 在Cloudflare Pages的设置中，找到"D1 Database"
   - 选择你创建的数据库并绑定

## 使用说明

1. 访问部署后的网站
2. 填写提醒事项信息：
   - 项目名称
   - 项目内容
   - 提醒时间
3. 点击"添加提醒"按钮保存
4. 系统会在指定时间通过配置的机器人发送提醒

## 注意事项

- 所有时间都使用北京时间（UTC+8）
- 提醒时间精确到分钟
- 确保所有环境变量都已正确配置
- 确保机器人权限正常

## 技术栈

- 前端：HTML + CSS + JavaScript
- 后端：Cloudflare Pages + D1 Database
- 通知：Telegram Bot API + 企业微信机器人API 