const express = require('express');
const router = express.Router();
const { Diaries } = require('../db');

// GET /api/diaries
router.get('/', (req, res) => {
  res.json(Diaries.queryAll());
});

// GET /api/diaries/:id
router.get('/:id', (req, res) => {
  const diary = Diaries.queryOne(req.params.id);
  if (!diary) return res.status(404).json({ error: '日记不存在' });
  res.json(diary);
});

// POST /api/diaries
router.post('/', (req, res) => {
  const { title, content, recordIds, platform } = req.body;
  if (!content) return res.status(400).json({ error: 'content 必填' });
  const id = Diaries.create({ title, content, recordIds, platform });
  res.json({ diary_id: id });
});

// PUT /api/diaries/:id
router.put('/:id', (req, res) => {
  const { title, content } = req.body;
  const ok = Diaries.update(req.params.id, { title, content });
  if (!ok) return res.status(404).json({ error: '日记不存在' });
  res.json({ ok: true });
});

// DELETE /api/diaries/:id
router.delete('/:id', (req, res) => {
  const ok = Diaries.delete(req.params.id);
  if (!ok) return res.status(404).json({ error: '日记不存在' });
  res.json({ ok: true });
});

module.exports = router;
