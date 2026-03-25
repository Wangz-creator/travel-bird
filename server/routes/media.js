const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const exifr = require('exifr');

const MEDIA_DIR = path.join(__dirname, '../media');

// 确保 media 目录存在，避免上传时因目录不存在而报错
if (!fs.existsSync(MEDIA_DIR)) {
  fs.mkdirSync(MEDIA_DIR, { recursive: true });
}

const storage = multer.diskStorage({
  destination: MEDIA_DIR,
  filename(req, file, cb) {
    const ext = path.extname(file.originalname) || '.bin';
    cb(null, `${Date.now()}_${Math.random().toString(36).slice(2, 8)}${ext}`);
  }
});
const upload = multer({ storage, limits: { fileSize: 50 * 1024 * 1024 } });

// POST /api/media/upload
router.post('/upload', upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: '未收到文件' });
  res.json({ filename: req.file.filename });
});

// GET /api/media/:filename
router.get('/:filename', (req, res) => {
  const filePath = path.join(MEDIA_DIR, path.basename(req.params.filename));
  if (!fs.existsSync(filePath)) return res.status(404).json({ error: '文件不存在' });
  res.sendFile(filePath);
});

// DELETE /api/media/:filename
router.delete('/:filename', (req, res) => {
  const filePath = path.join(MEDIA_DIR, path.basename(req.params.filename));
  try { fs.unlinkSync(filePath); } catch (_) {}
  res.json({ ok: true });
});

// POST /api/media/exif — 解析已上传照片的 EXIF 信息（拍摄时间、GPS 等）
router.post('/exif', express.json(), async (req, res) => {
  const { filename } = req.body;
  if (!filename) return res.status(400).json({ error: 'filename 必填' });

  const filePath = path.join(MEDIA_DIR, path.basename(filename));
  if (!fs.existsSync(filePath)) return res.status(404).json({ error: '文件不存在' });

  try {
    const exif = await exifr.parse(filePath, {
      // 只解析需要的字段，提升性能
      pick: ['DateTimeOriginal', 'CreateDate', 'GPSLatitude', 'GPSLongitude', 'GPSLatitudeRef', 'GPSLongitudeRef'],
      gps: true,  // 自动转换 GPS 为十进制度数
    });

    if (!exif) {
      return res.json({ dateTime: null, latitude: null, longitude: null });
    }

    // 拍摄时间：优先 DateTimeOriginal，其次 CreateDate
    let dateTime = null;
    const rawDate = exif.DateTimeOriginal || exif.CreateDate;
    if (rawDate instanceof Date && !isNaN(rawDate.getTime())) {
      dateTime = rawDate.toISOString();
    }

    // GPS 坐标：exifr 的 gps:true 选项会自动将 GPS 转换为十进制 latitude/longitude
    const latitude = (typeof exif.latitude === 'number' && isFinite(exif.latitude)) ? exif.latitude : null;
    const longitude = (typeof exif.longitude === 'number' && isFinite(exif.longitude)) ? exif.longitude : null;

    res.json({ dateTime, latitude, longitude });
  } catch (e) {
    // EXIF 解析失败不算错误，可能是非图片文件或无 EXIF
    console.warn('EXIF parse warning:', e.message);
    res.json({ dateTime: null, latitude: null, longitude: null });
  }
});

module.exports = router;
