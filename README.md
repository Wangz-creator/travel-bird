# Travel Bird（旅行的鸽子） 🐦

> 一个本地优先的旅行记录 Web 应用：用最轻量的方式记录当下，再通过 AI 把碎片整理成可分享内容或本地日记。

## 概览

Travel Bird 帮助用户轻松捕捉旅行和日常生活中的碎片记忆（文字、语音、照片），并利用 AI 将它们整理成适合小红书、朋友圈或私密日记的成品内容。

### 核心特性

- **多模态记录** — 支持文字输入、长按语音、上滑拍照，几秒完成一次记录
- **时间轴管理** — 日/周/月视图浏览记录，支持折叠、多选、编辑、删除
- **AI 智能生成** — 从碎片记录生成小红书文案、朋友圈文案或个人日记
- **照片 EXIF 解析** — 自动提取照片拍摄时间和位置信息，智能排入时间轴
- **地理位置回填** — 多策略定位获取 + 异步地址反向编码
- **本地优先存储** — SQLite 本地数据库，数据完全在本地，无需登录

---

## 技术栈

| 层级 | 技术 |
|------|------|
| **后端** | Express.js + SQLite (better-sqlite3) |
| **前端** | Vanilla JavaScript（模块化架构，无框架） |
| **媒体处理** | Multer（上传）+ FFmpeg（音频转码）+ exifr（EXIF 解析） |
| **实时通信** | WebSocket (ws) |
| **AI 集成** | 支持 Anthropic / OpenAI 兼容接口 |
| **语音转写** | 字节跳动 BigModel ASR WebSocket |

---

## 快速开始

### 前置要求

- Node.js >= 18
- npm 或 pnpm

### 安装与启动

```bash
# 克隆项目
git clone https://github.com/Wangz-creator/travel-bird.git
cd travel-bird

# 安装依赖
npm install

# 启动服务
npm start
```

启动后访问：**http://localhost:3000**

macOS 用户也可以直接双击 `start-travel-bird.command` 一键启动。

### 开发模式

```bash
npm run dev
```

开发模式下服务运行在 **http://localhost:8000**，支持文件监听自动重启。

---

## 项目结构

```
travel-bird/
├── server/                  # 后端
│   ├── index.js            # Express 入口，HTTP/HTTPS/WebSocket 启动
│   ├── db.js               # SQLite 数据库操作层
│   ├── tz.js               # 时区工具
│   ├── routes/
│   │   ├── records.js      # 记录 CRUD API
│   │   ├── media.js        # 媒体上传 & EXIF 解析 API
│   │   ├── ai.js           # AI 对话 & 内容生成 API
│   │   ├── diaries.js      # 日记 CRUD API
│   │   ├── settings.js     # 模型配置 API
│   │   └── prompts.js      # Prompt 模板 API
│   ├── certs/              # HTTPS 自签名证书（可选）
│   └── media/              # 用户上传的媒体文件（自动创建）
├── public/                  # 前端
│   ├── index.html          # 单页应用入口
│   ├── css/app.css         # 全局样式（移动端适配）
│   ├── js/
│   │   ├── app.js          # 应用初始化
│   │   ├── router.js       # 路由管理
│   │   ├── state.js        # 状态管理
│   │   ├── api.js          # API 请求封装
│   │   ├── ai.js           # AI 流式调用
│   │   ├── ui.js           # 通用 UI 组件（Toast, Swipe, 录音等）
│   │   ├── utils.js        # 工具函数（定位、时间格式化等）
│   │   ├── permissions.js  # 权限管理
│   │   └── pages/          # 页面模块
│   │       ├── home.js         # 首页（鸽子按钮交互）
│   │       ├── timeline.js     # 时间轴
│   │       ├── photo-preview.js# 照片预览
│   │       ├── photo-confirm.js# 照片确认（多选）
│   │       ├── assistant.js    # AI 鸽子助手
│   │       ├── result.js       # 生成结果页
│   │       ├── profile.js      # 个人中心
│   │       ├── diary-list.js   # 日记列表
│   │       ├── diary-detail.js # 日记详情
│   │       ├── model-settings.js # 模型配置
│   │       ├── prompt-list.js  # Prompt 列表
│   │       └── prompt-edit.js  # Prompt 编辑
│   ├── img/                # 静态图片资源
│   └── fonts/              # 自定义字体
├── package.json
├── start-travel-bird.command  # macOS 一键启动脚本
└── 旅行的鸽子_PRD.md          # 产品需求文档
```

---

## 功能详解

### 1. 多模态快速记录

| 操作 | 方式 | 说明 |
|------|------|------|
| 文字记录 | 单击鸽子按钮 | 弹出文字输入框，可附带最多 3 张图片 |
| 语音记录 | 长按鸽子按钮 | 实时录音，松手结束，自动转写为文本 |
| 拍照记录 | 上滑鸽子按钮 | 打开相机/相册，支持语音补充说明 |

### 2. 照片 EXIF 解析

上传照片时自动解析 EXIF 元数据：
- 提取拍摄时间（`DateTimeOriginal`），用于在时间轴中精确排序
- 提取 GPS 坐标，自动反向编码为地址信息
- 即使照片是过去拍摄的，也能还原到正确的时间位置

### 3. 智能定位回填

多策略定位获取机制：
- **策略 1**：快速缓存定位（3 秒超时）
- **策略 2**：低精度新定位（15 秒超时）
- **策略 3**：高精度定位（适配部分设备）
- **策略 4**：watchPosition 监听（兜底）
- **延迟回填**：记录创建时定位失败，3 秒后重试并回填

### 4. AI 内容生成

```
碎片记录 → AI 追问补充 → 选择平台 → 生成内容 → 编辑优化
```

- **AI 追问**：主动提问帮助补全细节和感受
- **平台适配**：小红书（标题+正文+标签）、朋友圈、个人日记
- **内容优化**：生成后支持 AI 二次优化、撤销、重新生成
- **信息回写**：AI 对话中抽取的补充信息自动回写到原始记录

### 5. 时间轴浏览

- **日视图**：按天分组，支持展开/折叠
- **周视图**：按周汇总
- **月视图**：按月汇总
- 每条记录展示时间、地点、内容、缩略图
- 支持多选后批量生成内容

---

## 数据库设计

### records 表

| 字段 | 类型 | 说明 |
|------|------|------|
| record_id | TEXT | 记录唯一 ID |
| type | TEXT | `text` / `voice` / `photo` |
| content | TEXT | 文字内容或语音转写 |
| media_filename | TEXT | 单个媒体文件名 |
| media_filenames | TEXT | 多图文件名 (JSON) |
| caption | TEXT | 照片说明 |
| voice_media_filename | TEXT | 照片附带语音 |
| latitude / longitude | REAL | GPS 坐标 |
| address | TEXT | 地址文本 |
| ai_supplement | TEXT | AI 补充摘要 |
| created_at | TEXT | 创建时间 |
| group_id | TEXT | 分组 ID |
| is_deleted | INTEGER | 软删除标记 |

### diaries 表

| 字段 | 类型 | 说明 |
|------|------|------|
| diary_id | TEXT | 日记唯一 ID |
| title | TEXT | 标题 |
| content | TEXT | 正文 |
| record_ids | TEXT | 关联记录 ID (JSON) |
| platform | TEXT | 平台类型 |
| created_at / updated_at | TEXT | 时间戳 |

### settings 表 & prompts 表

存储模型配置（API Key、endpoint、model 等）和 6 个可自定义的 Prompt 模板。

---

## API 接口

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/records` | 获取记录列表 |
| POST | `/api/records` | 创建记录 |
| PUT | `/api/records/:id` | 更新记录 |
| DELETE | `/api/records/:id` | 删除记录 |
| POST | `/api/media/upload` | 上传媒体文件 |
| GET | `/api/media/:filename` | 获取媒体文件 |
| POST | `/api/ai/chat` | AI 对话 |
| POST | `/api/ai/generate` | AI 内容生成 |
| POST | `/api/ai/optimize` | AI 内容优化 |
| GET/POST | `/api/diaries` | 日记 CRUD |
| GET/PUT | `/api/settings` | 模型配置 |
| GET/PUT | `/api/prompts` | Prompt 模板 |

---

## 配置说明

### AI 功能配置

在应用内进入 **我的 → 语音转文字模型** 进行配置：

| 配置项 | 说明 |
|--------|------|
| `assistant_provider` | AI 提供商（如 `anthropic`、`openai`） |
| `assistant_endpoint` | API 端点地址 |
| `assistant_api_key` | API 密钥 |
| `assistant_model` | 模型名称 |
| `assistant_temperature` | 生成温度 |
| `assistant_max_tokens` | 最大 Token 数 |
| `voice_api_key` | 语音转写 API Key |

### HTTPS 配置（手机端录音需要）

```bash
cd server/certs
openssl req -x509 -newkey rsa:2048 -keyout key.pem -out cert.pem -days 365 -nodes -subj "/CN=localhost"
```

重启后使用 `https://localhost:3443` 或局域网 HTTPS 地址访问。

---

## 演示路径

1. 打开首页，**单击鸽子** → 输入文字并保存
2. **长按鸽子** → 录一段语音，松手后等待转写
3. **上滑鸽子** → 拍照或选图，补充说明后保存
4. 切换到 **时间轴**，确认记录已出现
5. **多选记录** → 点击"生成内容"
6. 进入 **鸽子助手**，回答 AI 追问
7. 选择平台（小红书/朋友圈/日记）→ 查看生成结果
8. 在 **我的 → 我的日记** 中查看已保存的日记

---

## 团队信息

- **作品名称**：Travel Bird（旅行的鸽子）
- **团队编号**：kbzh
- **团队成员**：王小平
- **分工**：产品设计、前端开发、后端开发、AI 设计与调试均由本人完成

---

## License

MIT
