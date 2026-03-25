# Task Plan: Deploy travel-bird from GitHub

## Goal
从 GitHub 克隆 travel-bird 项目并部署到本平台（端口 8000）

## Phases

### Phase 1: Clone Project `complete`
- 通过 GitHub ZIP API 下载（绕过代理超时）
- 解压到 /workspace/o2u9swaadvlg/

### Phase 2: Analyze Project Structure `complete`
- Express.js + better-sqlite3 + 纯 HTML/CSS/JS 前端
- API 路由：records, diaries, settings, prompts, media, ai
- 媒体文件上传到 server/media/

### Phase 3: Adapt for Platform `complete`
- package.json dev 脚本添加 PORT=8000
- better-sqlite3 从 v12.8.0 降级到 v9.6.0（兼容 GLIBC 2.28）
- 使用 node-gyp@9.4.1 编译原生模块（兼容 Python 3.6）
- 创建 server/media/ 目录

### Phase 4: Install & Start `complete`
- pnpm install 安装依赖
- node-gyp rebuild 编译 better-sqlite3
- PORT=8000 启动服务，验证 HTTP 200

## Errors Encountered
| Error | Attempt | Resolution |
|-------|---------|------------|
| git clone timeout (proxy) | 1 | Try without proxy / use GitHub API |
