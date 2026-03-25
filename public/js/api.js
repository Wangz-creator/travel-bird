// App.API — 替代原 App.DB + App.FileStore，通过 HTTP 与后端通信
App.API = {
  _settings: {},   // 本地缓存，避免每次都 fetch

  _withNoCache(url) {
    const sep = url.includes('?') ? '&' : '?';
    return `${url}${sep}_ts=${Date.now()}`;
  },

  async init() {
    this._settings = await this._fetchSettings();
  },

  async _fetchSettings() {
    try {
      const res = await fetch(this._withNoCache('/api/settings'), { cache: 'no-store' });
      return await res.json();
    } catch (e) {
      console.error('init settings failed:', e);
      return {};
    }
  },

  async _fetch(url, options) {
    try {
      const res = await fetch(url, options);
      if (!res.ok) {
        const text = await res.text();
        throw new Error(`HTTP ${res.status}: ${text}`);
      }
      return res;
    } catch (e) {
      console.error(`fetch ${url} failed:`, e);
      throw e;
    }
  },

  // ===== Settings =====
  Settings: {
    get(key) {
      return App.API._settings[key] ?? null;
    },
    async set(key, value) {
      App.API._settings[key] = value;
      await fetch(`/api/settings/${encodeURIComponent(key)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ value })
      });
    }
  },

  // ===== Records =====
  Records: {
    async create({ type, content, mediaFilename, mediaFilenames, caption, latitude, longitude, address, voiceMediaFilename }) {
      const res = await App.API._fetch('/api/records', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type, content, mediaFilename, mediaFilenames, caption, latitude, longitude, address, voiceMediaFilename })
      });
      const data = await res.json();
      return data.record_id;
    },

    async queryByDate(dateStr) {
      const tz = encodeURIComponent(App.Utils.getUserTimeZone());
      const res = await fetch(App.API._withNoCache(`/api/records?date=${encodeURIComponent(dateStr)}&tz=${tz}`), { cache: 'no-store' });
      return res.json();
    },

    async queryAllDates() {
      const tz = encodeURIComponent(App.Utils.getUserTimeZone());
      const res = await fetch(App.API._withNoCache(`/api/records/dates?tz=${tz}`), { cache: 'no-store' });
      return res.json();
    },

    async queryAllActive() {
      const res = await fetch(App.API._withNoCache('/api/records/all-active'), { cache: 'no-store' });
      if (!res.ok) return [];
      return res.json();
    },

    async queryByIds(ids) {
      if (!ids || ids.length === 0) return [];
      const res = await fetch(App.API._withNoCache(`/api/records/by-ids?ids=${ids.join(',')}`), { cache: 'no-store' });
      return res.json();
    },

    async update(recordId, fields) {
      const payload = { ...fields };
      if (Object.prototype.hasOwnProperty.call(payload, 'mediaFilenames')) {
        payload.mediaFilenames = Array.isArray(payload.mediaFilenames) ? payload.mediaFilenames.slice(0, 3) : [];
      }
      await fetch(`/api/records/${recordId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
    },

    async updateSupplement(recordId, supplement) {
      await fetch(`/api/records/${recordId}/supplement`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ supplement })
      });
    },

    async delete(recordId) {
      await fetch(`/api/records/${recordId}`, { method: 'DELETE' });
    }
  },

  // ===== Diaries =====
  Diaries: {
    async queryAll() {
      const res = await fetch(App.API._withNoCache('/api/diaries'), { cache: 'no-store' });
      return res.json();
    },
    async queryOne(diaryId) {
      const res = await fetch(App.API._withNoCache(`/api/diaries/${diaryId}`), { cache: 'no-store' });
      if (!res.ok) return null;
      return res.json();
    },
    async create({ title, content, recordIds, platform }) {
      const res = await fetch('/api/diaries', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, content, recordIds, platform })
      });
      const data = await res.json();
      return data.diary_id;
    },
    async update(diaryId, { title, content }) {
      await fetch(`/api/diaries/${diaryId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, content })
      });
    },
    /** @returns {Promise<{ ok: boolean, code?: string }>} */
    async delete(diaryId) {
      if (diaryId == null || diaryId === '') return { ok: false, code: 'bad_id' };
      const res = await fetch(`/api/diaries/${encodeURIComponent(String(diaryId))}`, { method: 'DELETE' });
      if (res.ok) return { ok: true };
      const text = await res.text().catch(() => '');
      // 旧版 Express 未注册 DELETE 时返回 HTML「Cannot DELETE …」
      if (text.includes('Cannot DELETE')) return { ok: false, code: 'route_missing' };
      return { ok: false, code: 'failed' };
    }
  },

  // ===== Prompts =====
  Prompts: {
    async get(promptKey) {
      const res = await fetch(App.API._withNoCache(`/api/prompts/${promptKey}`), { cache: 'no-store' });
      const data = await res.json();
      return data.content;
    },
    async set(promptKey, content) {
      await fetch(`/api/prompts/${promptKey}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content })
      });
    },
    async reset(promptKey) {
      await fetch(`/api/prompts/${promptKey}`, { method: 'DELETE' });
    }
  },

  // ===== Media / FileStore =====
  FileStore: {
    async saveFile(blob, filename) {
      // filename 仅用于获取扩展名，实际文件名由服务端生成，但我们允许指定
      const formData = new FormData();
      const ext = filename.split('.').pop();
      formData.append('file', blob, filename);
      const res = await fetch('/api/media/upload', { method: 'POST', body: formData });
      const data = await res.json();
      return data.filename;
    },

    getObjectURL(filename) {
      // 直接返回后端媒体 URL，不需要 async
      return `/api/media/${encodeURIComponent(filename)}`;
    },

    async getBase64(filename) {
      const res = await fetch(`/api/media/${encodeURIComponent(filename)}`);
      const blob = await res.blob();
      return new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result.split(',')[1]);
        reader.readAsDataURL(blob);
      });
    },

    async getImagePayload(filename) {
      const res = await fetch(`/api/media/${encodeURIComponent(filename)}`);
      const blob = await res.blob();
      return new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = () => {
          const dataUrl = String(reader.result || '');
          resolve({
            mimeType: blob.type || 'image/jpeg',
            dataUrl,
            base64: dataUrl.includes(',') ? dataUrl.split(',')[1] : ''
          });
        };
        reader.readAsDataURL(blob);
      });
    },

    generateFilename(ext) {
      return `${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${ext}`;
    }
  },

  // ===== Stats (for profile page) =====
  Stats: {
    async get() {
      const tz = encodeURIComponent(App.Utils.getUserTimeZone());
      const [dates, diaries] = await Promise.all([
        fetch(App.API._withNoCache(`/api/records/dates?tz=${tz}`), { cache: 'no-store' }).then(async (r) => (r.ok ? r.json() : [])),
        fetch(App.API._withNoCache('/api/diaries'), { cache: 'no-store' }).then((r) => (r.ok ? r.json() : [])),
      ]);
      const totalRecords = dates.reduce((sum, d) => sum + (d.count || 0), 0);
      return { recordCount: totalRecords, diaryCount: diaries.length, dayCount: dates.length };
    }
  }
};
