const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');

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

module.exports = router;
