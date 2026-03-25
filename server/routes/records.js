const express = require('express');
const router = express.Router();
const { Records } = require('../db');
const { isValidIanaTimeZone } = require('../tz');

function readTimeZone(req) {
  const tz = req.query.tz;
  if (tz == null || String(tz).trim() === '') {
    return { ok: false, error: 'tz 参数必填（IANA 时区，如 Asia/Shanghai）' };
  }
  const trimmed = String(tz).trim();
  if (!isValidIanaTimeZone(trimmed)) {
    return { ok: false, error: 'tz 不是有效的 IANA 时区名' };
  }
  return { ok: true, tz: trimmed };
}

function cleanAddressPart(value) {
  return String(value || '').trim();
}

function joinUnique(parts, sep = ' ') {
  const list = [];
  for (const part of parts) {
    const text = cleanAddressPart(part);
    if (!text || list.includes(text)) continue;
    list.push(text);
  }
  return list.join(sep).trim();
}

function formatReverseGeocodeResult(data) {
  const addr = data?.address || {};
  const city = cleanAddressPart(addr.city || addr.town || addr.municipality || addr.village);
  const district = cleanAddressPart(addr.county || addr.city_district || addr.district || addr.suburb || addr.borough);
  const neighborhood = cleanAddressPart(addr.neighbourhood || addr.quarter || addr.residential);
  const road = cleanAddressPart(addr.road || addr.pedestrian || addr.footway || addr.cycleway);
  const houseNumber = cleanAddressPart(addr.house_number);
  const roadPart = cleanAddressPart(`${road}${houseNumber}`);
  const poi = cleanAddressPart(
    data?.name ||
    addr.amenity ||
    addr.tourism ||
    addr.attraction ||
    addr.shop ||
    addr.building ||
    addr.leisure ||
    addr.aeroway ||
    addr.railway
  );

  if (poi) {
    const area = joinUnique([district, neighborhood, roadPart]);
    return cleanAddressPart(area ? `${poi} · ${area}` : poi);
  }

  const precise = joinUnique([district, neighborhood, roadPart]);
  if (precise) return precise;

  const normal = joinUnique([city, district, neighborhood, roadPart]);
  if (normal) return normal;

  return cleanAddressPart(addr.state || city || district);
}

async function reverseGeocode(lat, lon) {
  const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const timer = controller ? setTimeout(() => controller.abort(), 6000) : null;
  try {
    const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&addressdetails=1&lat=${encodeURIComponent(lat)}&lon=${encodeURIComponent(lon)}&accept-language=zh`, {
      headers: {
        'User-Agent': 'travel-bird/1.0 reverse-geocoder'
      },
      signal: controller?.signal
    });
    if (!res.ok) return null;
    const data = await res.json();
    return formatReverseGeocodeResult(data);
  } catch (e) {
    return null;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

// GET /api/records?date=YYYY-MM-DD&tz=Asia/Shanghai
router.get('/', (req, res) => {
  const { date } = req.query;
  if (!date) return res.status(400).json({ error: 'date 参数必填' });
  const tzr = readTimeZone(req);
  if (!tzr.ok) return res.status(400).json({ error: tzr.error });
  res.json(Records.queryByDate(date, tzr.tz));
});

// GET /api/records/dates?tz=Asia/Shanghai
router.get('/dates', (req, res) => {
  const tzr = readTimeZone(req);
  if (!tzr.ok) return res.status(400).json({ error: tzr.error });
  res.json(Records.queryAllDates(tzr.tz));
});

// GET /api/records/by-ids?ids=id1,id2,...
router.get('/by-ids', (req, res) => {
  const ids = req.query.ids ? req.query.ids.split(',') : [];
  res.json(Records.queryByIds(ids));
});

// GET /api/records/all-active — 时间轴用全量记录（须置于 /:id 类路由之前）
router.get('/all-active', (req, res) => {
  res.json(Records.queryAllActive());
});

// GET /api/records/reverse-geocode?lat=...&lon=...
router.get('/reverse-geocode', async (req, res) => {
  const lat = Number(req.query.lat);
  const lon = Number(req.query.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    return res.status(400).json({ error: 'lat/lon 参数无效' });
  }
  const address = await reverseGeocode(lat, lon);
  res.json({ address: address || null });
});

// POST /api/records
router.post('/', (req, res) => {
  const { type, content, mediaFilename, mediaFilenames, caption, latitude, longitude, address, voiceMediaFilename } = req.body;
  if (!type) return res.status(400).json({ error: 'type 必填' });
  const id = Records.create({ type, content, mediaFilename, mediaFilenames, caption, latitude, longitude, address, voiceMediaFilename });
  res.json({ record_id: id });
});

// PUT /api/records/:id
router.put('/:id', (req, res) => {
  const payload = { ...req.body };
  if (Object.prototype.hasOwnProperty.call(req.body, 'mediaFilenames')) {
    payload.media_filenames = req.body.mediaFilenames;
    delete payload.mediaFilenames;
  }
  Records.update(req.params.id, payload);
  res.json({ ok: true });
});

// PUT /api/records/:id/supplement
router.put('/:id/supplement', (req, res) => {
  const { supplement } = req.body;
  Records.updateSupplement(req.params.id, supplement);
  res.json({ ok: true });
});

// DELETE /api/records/:id
router.delete('/:id', (req, res) => {
  Records.softDelete(req.params.id);
  res.json({ ok: true });
});

module.exports = router;
