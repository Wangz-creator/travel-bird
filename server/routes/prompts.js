const express = require('express');
const router = express.Router();
const { Prompts } = require('../db');

// GET /api/prompts/:key
router.get('/:key', (req, res) => {
  const content = Prompts.get(req.params.key);
  res.json({ content });
});

// PUT /api/prompts/:key
router.put('/:key', (req, res) => {
  const { content } = req.body;
  Prompts.set(req.params.key, content);
  res.json({ ok: true });
});

// DELETE /api/prompts/:key
router.delete('/:key', (req, res) => {
  Prompts.reset(req.params.key);
  res.json({ ok: true });
});

module.exports = router;
