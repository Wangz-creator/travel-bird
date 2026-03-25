const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');
const { calendarDayInZone, utcRangeForCalendarDay } = require('./tz');

const DB_PATH = path.join(__dirname, 'pigeon.db');
const db = new Database(DB_PATH);

// 开启 WAL 模式，提升并发读写性能
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// ===== 建表 =====
db.exec(`
  CREATE TABLE IF NOT EXISTS records (
    record_id       TEXT PRIMARY KEY,
    type            TEXT NOT NULL CHECK(type IN ('text', 'voice', 'photo')),
    content         TEXT,
    media_filename  TEXT,
    media_filenames TEXT,
    caption         TEXT,
    created_at      TEXT NOT NULL,
    latitude        REAL,
    longitude       REAL,
    address         TEXT,
    group_id        TEXT,
    ai_supplement   TEXT,
    ai_supplement_at TEXT,
    updated_at      TEXT,
    is_deleted      INTEGER DEFAULT 0
  );
  CREATE INDEX IF NOT EXISTS idx_records_created_at ON records(created_at DESC);
  CREATE INDEX IF NOT EXISTS idx_records_group_id ON records(group_id);

  CREATE TABLE IF NOT EXISTS groups (
    group_id    TEXT PRIMARY KEY,
    created_at  TEXT NOT NULL,
    latitude    REAL,
    longitude   REAL,
    address     TEXT
  );

  CREATE TABLE IF NOT EXISTS diaries (
    diary_id    TEXT PRIMARY KEY,
    title       TEXT,
    content     TEXT NOT NULL,
    record_ids  TEXT,
    platform    TEXT DEFAULT 'diary',
    created_at  TEXT NOT NULL,
    updated_at  TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_diaries_created_at ON diaries(created_at DESC);

  CREATE TABLE IF NOT EXISTS generated_contents (
    content_id  TEXT PRIMARY KEY,
    platform    TEXT NOT NULL,
    title       TEXT,
    body        TEXT NOT NULL,
    tags        TEXT,
    record_ids  TEXT,
    created_at  TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS settings (
    key   TEXT PRIMARY KEY,
    value TEXT
  );

  CREATE TABLE IF NOT EXISTS prompts (
    prompt_key  TEXT PRIMARY KEY,
    content     TEXT,
    updated_at  TEXT
  );
`);

// 迁移：为 photo 记录增加语音附件列
try {
  db.exec(`ALTER TABLE records ADD COLUMN voice_media_filename TEXT`);
} catch (_) { /* 列已存在则忽略 */ }

// 注：media_filenames 列已包含在建表语句中，无需额外迁移

// ===== 工具函数 =====
function generateId() {
  return crypto.randomUUID();
}

function now() {
  return new Date().toISOString();
}

function normalizeMediaFilenames(mediaFilenames) {
  if (!Array.isArray(mediaFilenames)) return [];
  return mediaFilenames
    .map((name) => String(name || '').trim())
    .filter(Boolean)
    .slice(0, 3);
}

function parseMediaFilenames(raw, type, mediaFilename) {
  if (Array.isArray(raw)) return normalizeMediaFilenames(raw);
  if (typeof raw === 'string' && raw.trim()) {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return normalizeMediaFilenames(parsed);
    } catch (_) {}
  }
  if (type === 'photo' && mediaFilename) return [mediaFilename];
  return [];
}

function hydrateRecord(record) {
  if (!record) return record;
  return {
    ...record,
    media_filenames: parseMediaFilenames(record.media_filenames, record.type, record.media_filename)
  };
}

function haversineDistance(lat1, lon1, lat2, lon2) {
  const R = 6371000;
  const toRad = d => d * Math.PI / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ===== Records =====
const Records = {
  create({ type, content, mediaFilename, mediaFilenames, caption, latitude, longitude, address, voiceMediaFilename }) {
    const id = generateId();
    const ts = now();
    const normalizedMediaFilenames = normalizeMediaFilenames(mediaFilenames);
    db.prepare(
      `INSERT INTO records (record_id, type, content, media_filename, media_filenames, caption, created_at, latitude, longitude, address, voice_media_filename)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      id,
      type,
      content ?? null,
      mediaFilename ?? null,
      normalizedMediaFilenames.length ? JSON.stringify(normalizedMediaFilenames) : null,
      caption ?? null,
      ts,
      latitude ?? null,
      longitude ?? null,
      address ?? null,
      voiceMediaFilename ?? null
    );
    Groups.assignGroup(id);
    return id;
  },

  /** @param {string} dateStr YYYY-MM-DD（用户时区下的日历日） @param {string} timeZone IANA */
  queryByDate(dateStr, timeZone) {
    const range = utcRangeForCalendarDay(dateStr, timeZone);
    if (!range) return [];
    return db.prepare(
      `SELECT * FROM records WHERE created_at >= ? AND created_at < ? AND is_deleted = 0 ORDER BY created_at DESC`
    ).all(range.startIso, range.endIso).map(hydrateRecord);
  },

  queryByDateRange(startDate, endDate) {
    return db.prepare(
      `SELECT * FROM records WHERE created_at >= ? AND created_at < ? AND is_deleted = 0 ORDER BY created_at DESC`
    ).all(startDate, endDate).map(hydrateRecord);
  },

  /** @param {string} timeZone IANA，与前端上报一致 */
  queryAllDates(timeZone) {
    const rows = db.prepare(`SELECT created_at FROM records WHERE is_deleted = 0`).all();
    const counts = new Map();
    for (const { created_at } of rows) {
      const day = calendarDayInZone(created_at, timeZone);
      if (!day) continue;
      counts.set(day, (counts.get(day) || 0) + 1);
    }
    return Array.from(counts.entries())
      .map(([day, count]) => ({ day, count }))
      .sort((a, b) => (a.day < b.day ? 1 : a.day > b.day ? -1 : 0));
  },

  queryByIds(ids) {
    if (!ids || ids.length === 0) return [];
    const placeholders = ids.map(() => '?').join(',');
    return db.prepare(
      `SELECT * FROM records WHERE record_id IN (${placeholders}) AND is_deleted = 0`
    ).all(...ids).map(hydrateRecord);
  },

  /** 时间轴一次拉全量（前端按用户时区分组）；已按 created_at 新→旧 */
  queryAllActive() {
    return db.prepare(
      `SELECT * FROM records WHERE is_deleted = 0 ORDER BY created_at DESC`
    ).all().map(hydrateRecord);
  },

  update(recordId, fields) {
    const allowed = ['content', 'caption', 'address', 'ai_supplement', 'ai_supplement_at', 'voice_media_filename', 'media_filenames'];
    const normalizedFields = { ...fields };
    if (Object.prototype.hasOwnProperty.call(normalizedFields, 'media_filenames')) {
      const normalizedMediaFilenames = normalizeMediaFilenames(normalizedFields.media_filenames);
      normalizedFields.media_filenames = normalizedMediaFilenames.length ? JSON.stringify(normalizedMediaFilenames) : null;
    }
    const keys = Object.keys(normalizedFields).filter(k => allowed.includes(k));
    if (keys.length === 0) return;
    const sets = keys.map(k => `${k} = ?`).join(', ');
    const values = keys.map(k => normalizedFields[k]);
    db.prepare(`UPDATE records SET ${sets}, updated_at = ? WHERE record_id = ?`)
      .run(...values, now(), recordId);
  },

  softDelete(recordId) {
    db.prepare(`UPDATE records SET is_deleted = 1 WHERE record_id = ?`).run(recordId);
  },

  deleteByGroup(groupId) {
    db.prepare(`UPDATE records SET is_deleted = 1 WHERE group_id = ?`).run(groupId);
  },

  updateSupplement(recordId, supplement) {
    db.prepare(
      `UPDATE records SET ai_supplement = ?, ai_supplement_at = ?, updated_at = ? WHERE record_id = ?`
    ).run(supplement, now(), now(), recordId);
  }
};

// ===== Groups =====
const Groups = {
  assignGroup(newRecordId) {
    const record = db.prepare(`SELECT * FROM records WHERE record_id = ?`).get(newRecordId);
    if (!record) return;

    const thirtyMinAgo = new Date(new Date(record.created_at).getTime() - 30 * 60 * 1000).toISOString();
    const candidates = db.prepare(
      `SELECT r.*, g.latitude as g_lat, g.longitude as g_lng, g.group_id as gid
       FROM records r LEFT JOIN groups g ON r.group_id = g.group_id
       WHERE r.created_at >= ? AND r.record_id != ? AND r.is_deleted = 0 AND r.group_id IS NOT NULL
       ORDER BY r.created_at DESC`
    ).all(thirtyMinAgo, newRecordId);

    for (const c of candidates) {
      if (record.latitude && record.longitude && c.g_lat && c.g_lng) {
        const dist = haversineDistance(record.latitude, record.longitude, c.g_lat, c.g_lng);
        if (dist <= 500) {
          db.prepare(`UPDATE records SET group_id = ? WHERE record_id = ?`).run(c.gid, newRecordId);
          return;
        }
      }
    }

    const ungrouped = db.prepare(
      `SELECT * FROM records WHERE created_at >= ? AND record_id != ? AND is_deleted = 0 AND group_id IS NULL
       ORDER BY created_at DESC`
    ).all(thirtyMinAgo, newRecordId);

    for (const u of ungrouped) {
      if (record.latitude && record.longitude && u.latitude && u.longitude) {
        const dist = haversineDistance(record.latitude, record.longitude, u.latitude, u.longitude);
        if (dist <= 500) {
          const groupId = generateId();
          db.prepare(
            `INSERT INTO groups (group_id, created_at, latitude, longitude, address) VALUES (?, ?, ?, ?, ?)`
          ).run(groupId, now(), record.latitude, record.longitude, record.address);
          db.prepare(`UPDATE records SET group_id = ? WHERE record_id IN (?, ?)`)
            .run(groupId, newRecordId, u.record_id);
          return;
        }
      }
    }
  }
};

// ===== Diaries =====
const Diaries = {
  create({ title, content, recordIds, platform }) {
    const id = generateId();
    db.prepare(
      `INSERT INTO diaries (diary_id, title, content, record_ids, platform, created_at) VALUES (?, ?, ?, ?, ?, ?)`
    ).run(id, title ?? null, content, JSON.stringify(recordIds ?? []), platform ?? 'diary', now());
    return id;
  },

  queryAll() {
    return db.prepare(`SELECT * FROM diaries ORDER BY created_at DESC`).all();
  },

  queryOne(diaryId) {
    return db.prepare(`SELECT * FROM diaries WHERE diary_id = ?`).get(diaryId) ?? null;
  },

  update(diaryId, { title, content }) {
    const existing = db.prepare(`SELECT * FROM diaries WHERE diary_id = ?`).get(diaryId);
    if (!existing) return false;
    db.prepare(`UPDATE diaries SET title = ?, content = ?, updated_at = ? WHERE diary_id = ?`)
      .run(title ?? existing.title, content ?? existing.content, now(), diaryId);
    return true;
  },

  delete(diaryId) {
    const r = db.prepare(`DELETE FROM diaries WHERE diary_id = ?`).run(diaryId);
    return r.changes > 0;
  }
};

// ===== Settings =====
const Settings = {
  get(key) {
    const row = db.prepare(`SELECT value FROM settings WHERE key = ?`).get(key);
    if (!row) return null;
    try { return JSON.parse(row.value); } catch (_) { return row.value; }
  },

  getAll() {
    const rows = db.prepare(`SELECT key, value FROM settings`).all();
    const result = {};
    for (const row of rows) {
      try { result[row.key] = JSON.parse(row.value); } catch (_) { result[row.key] = row.value; }
    }
    return result;
  },

  set(key, value) {
    db.prepare(`INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)`)
      .run(key, JSON.stringify(value));
  },

  delete(key) {
    db.prepare(`DELETE FROM settings WHERE key = ?`).run(key);
  }
};

// ===== Prompts =====
const Prompts = {
  get(promptKey) {
    const row = db.prepare(`SELECT content FROM prompts WHERE prompt_key = ?`).get(promptKey);
    return row?.content ?? null;
  },

  set(promptKey, content) {
    db.prepare(
      `INSERT OR REPLACE INTO prompts (prompt_key, content, updated_at) VALUES (?, ?, ?)`
    ).run(promptKey, content, now());
  },

  reset(promptKey) {
    db.prepare(`DELETE FROM prompts WHERE prompt_key = ?`).run(promptKey);
  }
};

module.exports = { db, Records, Groups, Diaries, Settings, Prompts };
