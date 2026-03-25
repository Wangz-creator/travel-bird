# 研究发现

## EXIF 解析技术方案

### 库选择：exifr
- 纯 JavaScript，支持 Node.js
- 可提取 DateTimeOriginal（拍摄时间）和 GPS 经纬度
- 支持 JPEG、HEIC、TIFF 等

### 数据流设计
1. 前端上传照片 → 服务器保存文件
2. 前端请求 `POST /api/media/exif` → 服务器解析返回 `{ dateTime, latitude, longitude }`
3. 前端用 EXIF 数据创建记录：createdAt = EXIF 时间, GPS 坐标覆盖实时定位
4. 时间轴按 created_at 排序，自动归入正确日期分组

### 优先级规则
- 拍摄时间：EXIF DateTimeOriginal > 当前时间
- 位置信息：EXIF GPS > 浏览器实时定位 > 无位置
