# 任务计划：照片 EXIF 解析 → 时间轴排列

## 需求
解析上传的照片，获得拍摄时间、地点等 EXIF 信息，将记录排在时间轴合适的位置（按拍摄时间而非上传时间）。

---

## Phase 1: 后端 EXIF 解析 `complete`
- [x] 安装 `exifr` npm 包（轻量纯 JS EXIF 解析库）
- [x] 新增 `POST /api/media/exif` 接口，接收文件名，返回 EXIF 信息

## Phase 2: 数据库支持自定义时间 `complete`
- [x] 修改 `Records.create()` 支持传入 `createdAt` 参数
- [x] 修改 `POST /api/records` 路由接受 `createdAt` 字段

## Phase 3: 前端集成 EXIF → 时间轴 `complete`
- [x] 单张照片保存（photo-preview.js）
- [x] 多张照片批量上传（home.js _handlePhotos）
- [x] 文字记录附带照片的 GPS 提取（home.js _showTextInput）
- [x] 前端 API 模块支持 createdAt 和 parseExif（api.js）

## Phase 4: 验证 `complete`
- [x] 服务器正常启动（HTTP 200）
- [x] EXIF API 正常响应
- [x] 无编译错误
- [x] 无 RUM 运行时错误
