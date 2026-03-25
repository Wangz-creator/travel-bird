const express = require('express');
const router = express.Router();
const { Settings } = require('../db');

// GET /api/settings
router.get('/', (req, res) => {
  res.json(Settings.getAll());
});

// PUT /api/settings/:key
router.put('/:key', (req, res) => {
  const { value } = req.body;
  Settings.set(req.params.key, value);
  res.json({ ok: true });
});

// DELETE /api/settings/:key
router.delete('/:key', (req, res) => {
  Settings.delete(req.params.key);
  res.json({ ok: true });
});

module.exports = router;
