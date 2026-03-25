App.Pages.timeline = {
  _isSelectMode: false,
  _selectedIds: new Set(),
  _expandedDays: new Set(),
  _expandedWeeks: new Set(),
  _expandedMonths: new Set(),
  _manuallyCollapsed: new Set(),   // 用户手动收起的日期key，防止自动展开覆盖
  _viewMode: 'day',
  _container: null,
  _selectBar: null,

  _icon(name, className, options) {
    return App.UI.Icons.render(name, className || '', options || {});
  },

  render(container) {
    this._container = container;
    this._isSelectMode = false;
    this._selectedIds = new Set();
    this._expandedDays = new Set();
    this._expandedWeeks = new Set();
    this._expandedMonths = new Set();
    this._manuallyCollapsed = new Set();
    this._viewMode = 'day';

    container.innerHTML = `
      <div class="timeline-page">
        <div class="timeline-header">
          <div class="timeline-header-top">
            <span class="title">时间轴</span>
            <button type="button" class="select-btn" id="tl-select-btn">选择</button>
          </div>
          <div class="timeline-header-subtitle">把每一次路过、停留与心情，整理成一条温柔的旅程线。</div>
          <div class="timeline-segment" id="tl-segment">
            <button type="button" class="active" data-mode="day">日</button>
            <button type="button" data-mode="week">周</button>
            <button type="button" data-mode="month">月</button>
          </div>
        </div>
        <div class="timeline-list" id="tl-list"></div>
      </div>
    `;

    const seg = container.querySelector('#tl-segment');
    seg.querySelectorAll('button').forEach(btn => {
      btn.addEventListener('click', () => {
        seg.querySelectorAll('button').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this._setViewMode(btn.dataset.mode || 'day');
      });
    });
    container.querySelector('#tl-select-btn').addEventListener('click', () => this._toggleSelectMode());

    this._renderList();
    return {
      destroy: () => {
        if (this._selectBar) { this._selectBar.remove(); this._selectBar = null; }
      }
    };
  },

  _setViewMode(mode) {
    if (this._viewMode === mode) return;
    this._viewMode = mode;
    if (mode === 'day') {
      this._expandedWeeks.clear();
      this._expandedMonths.clear();
      this._expandedDays.clear();
    } else if (mode === 'week') {
      this._expandedDays.clear();
      this._expandedMonths.clear();
      this._expandedWeeks.clear();
    } else {
      this._expandedDays.clear();
      this._expandedWeeks.clear();
      this._expandedMonths.clear();
    }
    this._renderList();
  },

  _groupRecordsByDay(records) {
    const tz = App.Utils.getUserTimeZone();
    const byDay = new Map();
    for (const r of records) {
      const day = App.Utils.calendarDateStringInZone(new Date(r.created_at), tz);
      if (!byDay.has(day)) byDay.set(day, []);
      byDay.get(day).push(r);
    }
    for (const list of byDay.values()) {
      list.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    }
    const sortedDays = [...byDay.keys()].sort((a, b) => b.localeCompare(a));
    return { byDay, sortedDays };
  },

  _orderedDaysForDayView(sortedDays, today) {
    const rest = sortedDays.filter(d => d !== today);
    return sortedDays.includes(today) ? [today, ...rest] : [...rest];
  },

  _backfillMissingAddresses(records) {
    const targets = (records || []).filter((record) => (
      !record.address &&
      record.latitude != null &&
      record.longitude != null
    ));
    if (!targets.length) return;
    Promise.allSettled(targets.map((record) => App.Utils.ensureRecordAddress(record)))
      .then((results) => {
        if (results.some((item) => item.status === 'fulfilled' && item.value)) {
          this._renderList();
        }
      })
      .catch(() => {});
  },

  async _renderList() {
    const listEl = document.getElementById('tl-list');
    if (!listEl) return;

    const records = await App.API.Records.queryAllActive();
    this._backfillMissingAddresses(records);
    if (!records.length) {
      listEl.innerHTML = '<div class="tl-timeline-track"><div class="timeline-empty">暂无记录，去首页开始记录吧</div></div>';
      return;
    }

    const { byDay, sortedDays } = this._groupRecordsByDay(records);
    const today = App.Utils.userCalendarDateString();

    // 今日默认展开（日视图下），但用户手动收起后不再自动展开
    if (this._viewMode === 'day' && sortedDays.includes(today) && !this._manuallyCollapsed.has(today)) {
      this._expandedDays.add(today);
    }

    let html = '';
    if (this._viewMode === 'day') html = this._htmlDayView(byDay, sortedDays, today);
    else if (this._viewMode === 'week') html = this._htmlWeekView(byDay, sortedDays);
    else html = this._htmlMonthView(byDay, sortedDays);

    listEl.innerHTML = `<div class="tl-timeline-track">${html}</div>`;
    if (this._isSelectMode) listEl.classList.add('select-mode');
    else listEl.classList.remove('select-mode');

    listEl.querySelectorAll('img[data-photo]').forEach(img => {
      const filename = img.dataset.photo;
      if (filename) img.src = App.API.FileStore.getObjectURL(filename);
    });

    this._bindListEvents(listEl);
  },

  /** 展开态分组顶栏：点击收起 */
  _htmlOpenSectionHeader(headingHtml, count, places, collapseAttr) {
    const placesRow = places
      ? `<span class="tl-section-places">${this._escapeHtml(places)}</span>`
      : '';
    return `
      <button type="button" class="tl-section-header tl-section-header--open" ${collapseAttr}>
        <div class="tl-section-header-text">
          <span class="tl-section-heading">${headingHtml} <span class="badge">${count} 条记录</span></span>
          ${placesRow}
        </div>
        <span class="tl-section-chevron" aria-hidden="true">${this._icon('chevronRight', 'tl-chevron-icon', { size: 18, strokeWidth: 2 })}</span>
      </button>
    `;
  },

  _timeRangeSummary(records) {
    if (!records.length) return '';
    const times = records.map(r => new Date(r.created_at).getTime()).sort((a, b) => a - b);
    const earliest = App.Utils.formatTime(new Date(times[0]).toISOString());
    if (records.length === 1) return earliest;
    const latest = App.Utils.formatTime(new Date(times[times.length - 1]).toISOString());
    return earliest === latest ? earliest : `${earliest} - ${latest}`;
  },

  _htmlDayView(byDay, sortedDays, today) {
    let html = '';
    const ordered = this._orderedDaysForDayView(sortedDays, today);
    for (const day of ordered) {
      const list = byDay.get(day) || [];
      const count = list.length;
      const places = App.Utils.formatPlacesSummary(App.Utils.placesFromRecords(list), 'day');
      const heading = App.Utils.timelineDayHeading(day, today);
      const headingHtml = this._escapeHtml(heading);

      if (this._expandedDays.has(day)) {
        html += `<div class="tl-day-section" data-day="${day}">`;
        html += this._htmlOpenSectionHeader(headingHtml, count, places, `data-collapse-day="${day}"`);
        html += `<div class="tl-section-body">`;
        for (const r of list) html += this._renderRecord(r);
        html += `</div></div>`;
      } else {
        const timeRange = this._timeRangeSummary(list);
        const detailParts = [timeRange, places].filter(Boolean);
        const detail = detailParts.length ? ` · ${detailParts.join(' · ')}` : '';
        html += `
          <div class="tl-collapsed-card" data-expand-day="${day}">
            <div class="tl-collapsed-left">
              <div class="tl-collapsed-date">${this._escapeHtml(heading)}${detail ? `<span class="tl-collapsed-detail">${this._escapeHtml(detail)}</span>` : ''}</div>
              <div class="tl-collapsed-summary">${count} 条记录</div>
            </div>
            <span class="tl-collapsed-arrow">${this._icon('chevronRight', 'tl-chevron-icon', { size: 18, strokeWidth: 2 })}</span>
          </div>
        `;
      }
    }
    return html;
  },

  _buildWeekBuckets(byDay, sortedDays) {
    const map = new Map();
    for (const day of sortedDays) {
      const { isoYear, week, key } = App.Utils.isoWeekKeyFromDayString(day);
      if (!map.has(key)) map.set(key, { isoYear, week, days: [], records: [] });
      const b = map.get(key);
      b.days.push(day);
      b.records.push(...(byDay.get(day) || []));
    }
    for (const b of map.values()) {
      b.days.sort((a, c) => c.localeCompare(a));
    }
    return map;
  },

  _htmlWeekView(byDay, sortedDays) {
    const buckets = this._buildWeekBuckets(byDay, sortedDays);
    const keys = [...buckets.keys()].sort(App.Utils.compareWeekKeysDesc);
    let html = '';
    for (const key of keys) {
      const b = buckets.get(key);
      const places = App.Utils.formatPlacesSummary(App.Utils.placesFromRecords(b.records), 'week');
      const whead = App.Utils.timelineWeekHeading(b.isoYear, b.week);
      const count = b.records.length;
      const main = places ? `${whead} · ${places}` : whead;

      if (this._expandedWeeks.has(key)) {
        html += `<div class="tl-bucket-section" data-week="${key}">`;
        html += this._htmlOpenSectionHeader(this._escapeHtml(whead), count, places, `data-collapse-week="${key}"`);
        html += `<div class="tl-section-body">`;
        for (const day of b.days) {
          const list = byDay.get(day) || [];
          if (!list.length) continue;
          const dh = App.Utils.timelineDayHeading(day, App.Utils.userCalendarDateString());
          html += `<div class="tl-subday-title">${this._escapeHtml(dh)}</div>`;
          for (const r of list) html += this._renderRecord(r);
        }
        html += `</div></div>`;
      } else {
        const detailParts = [places].filter(Boolean);
        const detail = detailParts.length ? ` · ${detailParts.join(' · ')}` : '';
        html += `
          <div class="tl-collapsed-card" data-expand-week="${key}">
            <div class="tl-collapsed-left">
              <div class="tl-collapsed-date">${this._escapeHtml(whead)}${detail ? `<span class="tl-collapsed-detail">${this._escapeHtml(detail)}</span>` : ''}</div>
              <div class="tl-collapsed-summary">${count} 条记录</div>
            </div>
            <span class="tl-collapsed-arrow">${this._icon('chevronRight', 'tl-chevron-icon', { size: 18, strokeWidth: 2 })}</span>
          </div>
        `;
      }
    }
    return html;
  },

  _buildMonthBuckets(byDay, sortedDays) {
    const map = new Map();
    for (const day of sortedDays) {
      const mk = App.Utils.monthKeyFromDayString(day);
      if (!map.has(mk)) map.set(mk, { days: [], records: [] });
      const b = map.get(mk);
      b.days.push(day);
      b.records.push(...(byDay.get(day) || []));
    }
    for (const b of map.values()) {
      b.days.sort((a, c) => c.localeCompare(a));
    }
    return map;
  },

  _htmlMonthView(byDay, sortedDays) {
    const buckets = this._buildMonthBuckets(byDay, sortedDays);
    const keys = [...buckets.keys()].sort((a, c) => c.localeCompare(a));
    let html = '';
    for (const key of keys) {
      const b = buckets.get(key);
      const places = App.Utils.formatPlacesSummary(App.Utils.placesFromRecords(b.records), 'month');
      const mhead = App.Utils.timelineMonthHeading(key);
      const count = b.records.length;
      const main = places ? `${mhead} · ${places}` : mhead;

      if (this._expandedMonths.has(key)) {
        html += `<div class="tl-bucket-section" data-month="${key}">`;
        html += this._htmlOpenSectionHeader(this._escapeHtml(mhead), count, places, `data-collapse-month="${key}"`);
        html += `<div class="tl-section-body">`;
        for (const day of b.days) {
          const list = byDay.get(day) || [];
          if (!list.length) continue;
          const dh = App.Utils.timelineDayHeading(day, App.Utils.userCalendarDateString());
          html += `<div class="tl-subday-title">${this._escapeHtml(dh)}</div>`;
          for (const r of list) html += this._renderRecord(r);
        }
        html += `</div></div>`;
      } else {
        const detailParts = [places].filter(Boolean);
        const detail = detailParts.length ? ` · ${detailParts.join(' · ')}` : '';
        html += `
          <div class="tl-collapsed-card" data-expand-month="${key}">
            <div class="tl-collapsed-left">
              <div class="tl-collapsed-date">${this._escapeHtml(mhead)}${detail ? `<span class="tl-collapsed-detail">${this._escapeHtml(detail)}</span>` : ''}</div>
              <div class="tl-collapsed-summary">${count} 条记录</div>
            </div>
            <span class="tl-collapsed-arrow">${this._icon('chevronRight', 'tl-chevron-icon', { size: 18, strokeWidth: 2 })}</span>
          </div>
        `;
      }
    }
    return html;
  },

  _renderRecord(r) {
    const time = App.Utils.formatTime(r.created_at);
    const typeIcons = {
      text: '<img src="/img/pigeon-writing-1.svg" alt="文字" class="tl-type-icon-img tl-type-icon-pigeon">',
      voice: '<img src="/img/icon-voice.png" alt="语音" class="tl-type-icon-img">',
      photo: '<img src="/img/icon-photo.png" alt="照片" class="tl-type-icon-img">'
    };
    const checked = this._selectedIds.has(r.record_id) ? 'checked' : '';
    const attachedPhotos = Array.isArray(r.media_filenames) ? r.media_filenames : [];
    let contentHtml = '';
    if (r.type === 'text') {
      contentHtml = `<div class="tl-record-content">${this._escapeHtml(r.content || '')}</div>`;
      if (attachedPhotos.length) contentHtml += this._renderPhotoGrid(attachedPhotos);
    } else if (r.type === 'voice') {
      contentHtml = `
        <div class="tl-voice-card">
          <span class="tl-voice-icon">${this._icon('mic', 'tl-voice-icon-svg', { size: 16, strokeWidth: 2 })}</span>
          <div class="tl-record-content voice-content">${this._escapeHtml(r.content || '[语音记录]')}</div>
        </div>
      `;
      if (attachedPhotos.length) contentHtml += this._renderPhotoGrid(attachedPhotos);
    } else if (r.type === 'photo') {
      if (r.caption) contentHtml += `<div class="tl-record-content">${this._escapeHtml(r.caption)}</div>`;
      contentHtml += this._renderPhotoGrid(attachedPhotos);
    }
    let supplementHtml = '';
    if (r.ai_supplement) supplementHtml = `<div class="tl-supplement">✦ 鸽子GUGU说：${this._escapeHtml(r.ai_supplement)}</div>`;
    const addrHtml = r.address
      ? `<span class="tl-record-location">${this._icon('location', 'tl-location-icon', { size: 12, strokeWidth: 2 })}<span>${this._escapeHtml(r.address)}</span></span>`
      : (r.latitude != null && r.longitude != null)
        ? `<span class="tl-record-location tl-location-loading">${this._icon('location', 'tl-location-icon', { size: 12, strokeWidth: 2 })}<span>定位解析中…</span></span>`
        : `<span class="tl-record-location tl-location-none">${this._icon('location', 'tl-location-icon', { size: 12, strokeWidth: 2 })}<span>未获取定位</span></span>`;
    return `
      <div class="tl-record" data-record-id="${r.record_id}" data-type="${r.type}">
        <div class="tl-record-top">
          <div class="tl-record-checkbox"><input type="checkbox" ${checked} data-rid="${r.record_id}"></div>
          <div class="tl-record-body">
            <div class="tl-record-meta">
              <span class="type-icon">${typeIcons[r.type] || ''}</span>
              <span>${time}</span>
              ${addrHtml}
            </div>
            ${contentHtml}
            ${supplementHtml}
          </div>
        </div>
        <div class="tl-record-actions">
          <button type="button" class="edit-btn" data-rid="${r.record_id}" data-type="${r.type}">编辑</button>
          <button type="button" class="delete-btn" data-rid="${r.record_id}">删除</button>
        </div>
      </div>
    `;
  },

  _renderPhotoGrid(filenames) {
    const photos = Array.isArray(filenames) ? filenames.filter(Boolean).slice(0, 3) : [];
    if (!photos.length) return '';
    const gridClass = photos.length === 1 ? 'grid-1' : photos.length === 2 ? 'grid-2' : 'grid-3';
    return `
      <div class="tl-photo-grid ${gridClass}">
        ${photos.map((filename, index) => `
          <div class="tl-photo-cell">
            <img data-photo="${filename}" src="" alt="照片 ${index + 1}">
          </div>
        `).join('')}
      </div>
    `;
  },

  _bindListEvents(listEl) {
    listEl.querySelectorAll('[data-expand-day]').forEach(card => {
      card.addEventListener('click', () => {
        const day = card.dataset.expandDay;
        this._expandedDays.add(day);
        this._manuallyCollapsed.delete(day);  // 用户主动展开，清除手动收起标记
        this._renderList();
      });
    });
    listEl.querySelectorAll('[data-expand-week]').forEach(card => {
      card.addEventListener('click', () => {
        this._expandedWeeks.add(card.dataset.expandWeek);
        this._renderList();
      });
    });
    listEl.querySelectorAll('[data-expand-month]').forEach(card => {
      card.addEventListener('click', () => {
        this._expandedMonths.add(card.dataset.expandMonth);
        this._renderList();
      });
    });
    listEl.querySelectorAll('[data-collapse-day]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const day = btn.dataset.collapseDay;
        this._expandedDays.delete(day);
        this._manuallyCollapsed.add(day);   // 标记为手动收起，阻止自动展开
        this._renderList();
      });
    });
    listEl.querySelectorAll('[data-collapse-week]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        this._expandedWeeks.delete(btn.dataset.collapseWeek);
        this._renderList();
      });
    });
    listEl.querySelectorAll('[data-collapse-month]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        this._expandedMonths.delete(btn.dataset.collapseMonth);
        this._renderList();
      });
    });
    listEl.querySelectorAll('.tl-record-checkbox input').forEach(cb => {
      cb.addEventListener('change', () => {
        if (cb.checked) this._selectedIds.add(cb.dataset.rid);
        else this._selectedIds.delete(cb.dataset.rid);
        this._updateSelectBar();
      });
    });
    listEl.querySelectorAll('.edit-btn').forEach(btn => {
      btn.addEventListener('click', (e) => { e.stopPropagation(); this._editRecord(btn.dataset.rid, btn.dataset.type); });
    });
    listEl.querySelectorAll('.delete-btn').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const ok = await App.UI.Modal.confirm('删除记录', '确定删除这条记录吗？删除后无法恢复');
        if (ok) { await App.API.Records.delete(btn.dataset.rid); App.UI.Toast.show('已删除', 'success'); this._renderList(); }
      });
    });
    listEl.querySelectorAll('.tl-record').forEach(card => {
      card.addEventListener('click', (e) => {
        if (e.target.closest('.tl-record-actions') || e.target.closest('.tl-record-checkbox')) return;
        if (this._isSelectMode) {
          const cb = card.querySelector('.tl-record-checkbox input');
          if (cb) { cb.checked = !cb.checked; cb.dispatchEvent(new Event('change')); }
        }
      });
    });
  },

  _toggleSelectMode() {
    this._isSelectMode = !this._isSelectMode;
    this._selectedIds.clear();
    const btn = document.getElementById('tl-select-btn');
    if (btn) btn.textContent = this._isSelectMode ? '取消' : '选择';
    const listEl = document.getElementById('tl-list');
    if (listEl) {
      if (this._isSelectMode) listEl.classList.add('select-mode');
      else listEl.classList.remove('select-mode');
    }
    if (!this._isSelectMode && this._selectBar) { this._selectBar.remove(); this._selectBar = null; }
    if (this._isSelectMode) this._updateSelectBar();
  },

  _updateSelectBar() {
    const count = this._selectedIds.size;
    if (!this._isSelectMode || count === 0) {
      if (this._selectBar) { this._selectBar.remove(); this._selectBar = null; }
      return;
    }
    if (!this._selectBar) {
      this._selectBar = document.createElement('div');
      this._selectBar.className = 'tl-select-bar';
      document.body.appendChild(this._selectBar);
    }
    this._selectBar.innerHTML = `
      <span class="count">已选 ${count} 条</span>
      <button type="button" class="gen-btn">生成内容 →</button>
      <button type="button" class="delete-sel">删除</button>
    `;
    this._selectBar.querySelector('.gen-btn').onclick = async () => {
      const ids = [...this._selectedIds];
      const records = await App.API.Records.queryByIds(ids);
      this._toggleSelectMode();
      const photos = records.filter(r => r.type === 'photo');
      if (photos.length > 1) {
        App.Router.pushPage('photoConfirm', { records });
      } else {
        App.Router.pushPage('assistant', { records });
      }
    };
    this._selectBar.querySelector('.delete-sel').onclick = async () => {
      const ok = await App.UI.Modal.confirm('批量删除', `确定删除选中的 ${count} 条记录吗？`);
      if (ok) {
        for (const id of this._selectedIds) await App.API.Records.delete(id);
        this._selectedIds.clear();
        this._toggleSelectMode();
        this._renderList();
        App.UI.Toast.show('已删除', 'success');
      }
    };
  },

  async _editRecord(recordId, type) {
    const records = await App.API.Records.queryByIds([recordId]);
    const record = records[0];
    if (!record) return;
    if (type === 'photo') {
      this._showEditModal({
        title: '编辑文字说明',
        initialValue: record.caption || '',
        onSave: async (val) => {
        await App.API.Records.update(recordId, { caption: val || null });
        App.UI.Toast.show('已更新', 'success');
        this._renderList();
        }
      });
    } else {
      this._showEditModal({
        title: '编辑内容',
        initialValue: record.content || '',
        photoFilenames: Array.isArray(record.media_filenames) ? record.media_filenames : [],
        enablePhotoUpload: true,
        onSave: async (val, photoItems) => {
          const existingFilenames = photoItems
            .filter((item) => item.kind === 'existing' && item.filename)
            .map((item) => item.filename);
          const uploadedFilenames = await Promise.all(
            photoItems
              .filter((item) => item.kind === 'new' && item.file)
              .map(async (item) => {
                const ext = item.file.name.split('.').pop().toLowerCase() || 'jpg';
                const tmpFilename = App.API.FileStore.generateFilename(ext);
                return App.API.FileStore.saveFile(item.file, tmpFilename);
              })
          );
          await App.API.Records.update(recordId, {
            content: val,
            mediaFilenames: [...existingFilenames, ...uploadedFilenames].slice(0, 3)
          });
        App.UI.Toast.show('已更新', 'success');
        this._renderList();
        }
      });
    }
  },

  _showEditModal({ title, initialValue, onSave, photoFilenames, enablePhotoUpload }) {
    const overlay = document.createElement('div');
    overlay.className = 'edit-record-overlay';
    const photoItems = (photoFilenames || []).map((filename) => ({
      kind: 'existing',
      filename,
      src: App.API.FileStore.getObjectURL(filename)
    }));
    overlay.innerHTML = `
      <div class="edit-record-box">
        <div class="edit-title">${title}</div>
        <textarea>${this._escapeHtml(initialValue)}</textarea>
        ${enablePhotoUpload ? `
          <input type="file" class="edit-record-photo-picker" accept="image/*" multiple hidden>
          <div class="record-photo-preview"${photoItems.length ? '' : ' hidden'}></div>
        ` : ''}
        <div class="edit-record-actions">
          ${enablePhotoUpload ? '<button type="button" class="record-photo-btn">照片上传</button>' : ''}
          <div class="text-input-action-group">
            <button type="button" class="text-input-cancel">取消</button>
            <button type="button" class="text-input-send">保存</button>
          </div>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);
    const textarea = overlay.querySelector('textarea');
    const cancelBtn = overlay.querySelector('.text-input-cancel');
    const saveBtn = overlay.querySelector('.text-input-send');
    const picker = overlay.querySelector('.edit-record-photo-picker');
    const uploadBtn = overlay.querySelector('.record-photo-btn');
    const preview = overlay.querySelector('.record-photo-preview');

    const cleanup = () => {
      photoItems.forEach((item) => {
        if (item.previewUrl) URL.revokeObjectURL(item.previewUrl);
      });
    };

    const closeOverlay = () => {
      cleanup();
      overlay.remove();
    };

    const renderPhotoItems = () => {
      if (!preview) return;
      if (!photoItems.length) {
        preview.hidden = true;
        preview.innerHTML = '';
        return;
      }
      preview.hidden = false;
      preview.innerHTML = photoItems.map((item, index) => `
        <div class="record-photo-item">
          <img src="${item.src}" alt="记录照片 ${index + 1}">
          <button type="button" class="record-photo-remove" data-index="${index}" aria-label="删除照片">×</button>
        </div>
      `).join('');
      preview.querySelectorAll('.record-photo-remove').forEach((btn) => {
        btn.addEventListener('click', () => {
          const index = Number(btn.dataset.index);
          const [removed] = photoItems.splice(index, 1);
          if (removed?.previewUrl) URL.revokeObjectURL(removed.previewUrl);
          renderPhotoItems();
        });
      });
    };

    const appendPhotos = (files) => {
      const normalizedFiles = Array.from(files || []);
      if (!normalizedFiles.length) return;
      const remaining = 3 - photoItems.length;
      if (remaining <= 0) {
        App.UI.Toast.show('最多上传 3 张照片', 'info');
        return;
      }
      if (normalizedFiles.length > remaining) {
        App.UI.Toast.show('最多上传 3 张照片，已为你截取前几张', 'info');
      }
      normalizedFiles.slice(0, remaining).forEach((file) => {
        const previewUrl = URL.createObjectURL(file);
        photoItems.push({
          kind: 'new',
          file,
          src: previewUrl,
          previewUrl
        });
      });
      renderPhotoItems();
    };

    if (enablePhotoUpload) {
      renderPhotoItems();
      uploadBtn.onclick = () => {
        picker.value = '';
        picker.click();
      };
      picker.onchange = (e) => {
        appendPhotos(e.target.files);
        picker.value = '';
      };
    }

    cancelBtn.onclick = closeOverlay;
    saveBtn.onclick = async () => {
      saveBtn.disabled = true;
      cancelBtn.disabled = true;
      if (uploadBtn) uploadBtn.disabled = true;
      try {
        await onSave(textarea.value.trim(), photoItems);
        closeOverlay();
      } catch (e) {
        App.UI.Toast.show('保存失败：' + e.message, 'error');
        saveBtn.disabled = false;
        cancelBtn.disabled = false;
        if (uploadBtn) uploadBtn.disabled = false;
      }
    };
    overlay.addEventListener('click', (e) => { if (e.target === overlay) closeOverlay(); });
    setTimeout(() => textarea.focus(), 100);
  },

  _escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }
};
