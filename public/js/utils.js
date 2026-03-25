App.Utils = {
  /** 浏览器/系统当前采用的 IANA 时区（作为「用户时区」上报服务端） */
  getUserTimeZone() {
    try {
      return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
    } catch (e) {
      return 'UTC';
    }
  },

  /** 指定 IANA 时区下的日历日 YYYY-MM-DD */
  calendarDateStringInZone(date, timeZone) {
    try {
      return new Intl.DateTimeFormat('en-CA', {
        timeZone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
      }).format(date);
    } catch (e) {
      const y = date.getFullYear();
      const m = String(date.getMonth() + 1).padStart(2, '0');
      const d = String(date.getDate()).padStart(2, '0');
      return `${y}-${m}-${d}`;
    }
  },

  /** 当前用户时区下的日历日（须与 API 使用的 tz 一致） */
  userCalendarDateString(date = new Date()) {
    return this.calendarDateStringInZone(date, this.getUserTimeZone());
  },

  /** 从地址串提取用于折叠摘要的行政地名（优先区/县） */
  roughPlaceName(address) {
    if (!address || typeof address !== 'string') return null;
    const s = address.trim();
    if (!s) return null;
    const normalized = s.replace(/\s+/g, ' ');
    const segments = normalized.split(/[·•]/).map((part) => part.trim()).filter(Boolean);
    const preferred = segments.length > 1 ? segments.slice(1).join(' ') : normalized;
    const adminPart = `${preferred} ${normalized}`;

    const districtMatches = adminPart.match(/[\u4e00-\u9fa5]{2,12}(?:自治县|新区|矿区|林区|特区|区|县|旗)/g);
    if (districtMatches?.length) return districtMatches[0];

    const cityMatches = adminPart.match(/[\u4e00-\u9fa5]{2,12}(?:自治州|地区|盟|州|市)/g);
    if (cityMatches?.length) return cityMatches[0];

    const first = preferred.split(/[,，]/)[0].trim();
    return first.length > 14 ? `${first.slice(0, 14)}…` : first;
  },

  placesFromRecords(records) {
    const set = new Set();
    for (const r of records || []) {
      const p = this.roughPlaceName(r.address);
      if (p) set.add(p);
    }
    return [...set];
  },

  /** variant: day（PRD 两日 &） | week（顿号） | month（和） */
  formatPlacesSummary(places, variant) {
    const u = [...new Set((places || []).filter(Boolean))];
    if (u.length === 0) return '';
    if (variant === 'month') {
      if (u.length === 1) return u[0];
      if (u.length === 2) return `${u[0]}和${u[1]}`;
      return `${u.slice(0, -1).join('、')}和${u[u.length - 1]}`;
    }
    if (variant === 'day') {
      if (u.length === 1) return u[0];
      if (u.length === 2) return `${u[0]} & ${u[1]}`;
      return `${u.slice(0, 4).join('、')}${u.length > 4 ? '等' : ''}`;
    }
    return `${u.slice(0, 5).join('、')}${u.length > 5 ? '等' : ''}`;
  },

  /** ISO 周（周一至周日），与 Luxon/常见日历一致；dayStr 为用户时区日历日 YYYY-MM-DD */
  isoWeekKeyFromDayString(dayStr) {
    const [Y, M, D] = dayStr.split('-').map(Number);
    const date = new Date(Y, M - 1, D, 12, 0, 0);
    date.setHours(0, 0, 0, 0);
    date.setDate(date.getDate() + 3 - (date.getDay() + 6) % 7);
    const isoYear = date.getFullYear();
    const week1 = new Date(isoYear, 0, 4);
    const week = 1 + Math.round(((date - week1) / 86400000 - 3 + (week1.getDay() + 6) % 7) / 7);
    return { isoYear, week, key: `${isoYear}-W${String(week).padStart(2, '0')}` };
  },

  monthKeyFromDayString(dayStr) {
    return dayStr.slice(0, 7);
  },

  compareWeekKeysDesc(a, b) {
    const ma = String(a).match(/^(\d+)-W(\d+)$/);
    const mb = String(b).match(/^(\d+)-W(\d+)$/);
    if (!ma || !mb) return String(b).localeCompare(String(a));
    const ya = +ma[1], wa = +ma[2], yb = +mb[1], wb = +mb[2];
    if (ya !== yb) return yb - ya;
    return wb - wa;
  },

  /** 时间轴日标题：今天 / M月D日 / 带年 */
  timelineDayHeading(dayStr, todayStr) {
    if (dayStr === todayStr) return '今天';
    const [y, m, d] = dayStr.split('-').map(Number);
    const ty = +todayStr.slice(0, 4);
    if (y === ty) return `${m}月${d}日`;
    return `${y}年${m}月${d}日`;
  },

  /** 周卡片主文案：第9周 / 2025年第52周 */
  timelineWeekHeading(isoYear, week) {
    const ty = +this.userCalendarDateString().slice(0, 4);
    if (isoYear === ty) return `第${week}周`;
    return `${isoYear}年第${week}周`;
  },

  /** 月卡片主文案：3月 / 2025年3月 */
  timelineMonthHeading(monthKey) {
    const [ys, ms] = monthKey.split('-');
    const y = +ys;
    const m = +ms;
    const ty = +this.userCalendarDateString().slice(0, 4);
    if (y === ty) return `${m}月`;
    return `${y}年${m}月`;
  },

  generateId() {
    return crypto.randomUUID ? crypto.randomUUID() :
      'xxxx-xxxx-xxxx'.replace(/x/g, () => ((Math.random() * 16) | 0).toString(16));
  },

  haversineDistance(lat1, lon1, lat2, lon2) {
    const R = 6371000;
    const toRad = d => d * Math.PI / 180;
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  },

  formatDate(isoString) {
    const d = new Date(isoString);
    const now = new Date();
    const diff = now - d;
    if (diff < 86400000) return '今天';
    if (diff < 172800000) return '昨天';
    return `${d.getMonth() + 1}月${d.getDate()}日`;
  },

  formatTime(isoString) {
    const d = new Date(isoString);
    return d.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
  },

  async getCurrentPosition() {
    return new Promise((resolve) => {
      if (!navigator.geolocation) { console.warn('[Geo] navigator.geolocation 不可用'); resolve(null); return; }
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          console.log('[Geo] 定位成功:', pos.coords.latitude, pos.coords.longitude);
          resolve({ latitude: pos.coords.latitude, longitude: pos.coords.longitude });
        },
        (err) => {
          console.warn('[Geo] 定位失败:', err.code, err.message);
          resolve(null);
        },
        { timeout: 10000, maximumAge: 120000, enableHighAccuracy: false }
      );
    });
  },

  _normalizePlaceText(text) {
    const s = String(text || '').trim();
    if (!s) return '';
    const map = {
      '國': '国', '臺': '台', '灣': '湾', '區': '区', '縣': '县', '鄉': '乡',
      '鎮': '镇', '陽': '阳', '東': '东', '門': '门', '廣': '广', '龍': '龙',
      '馬': '马', '麗': '丽', '島': '岛', '號': '号', '風': '风', '與': '与'
    };
    return s.replace(/[國臺灣區縣鄉鎮陽東門廣龍馬麗島號風與]/g, (ch) => map[ch] || ch);
  },

  async _reverseGeocodeViaNominatim(lat, lon) {
    const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const timer = controller ? setTimeout(() => controller.abort(), 5000) : null;
    try {
      const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&addressdetails=1&lat=${encodeURIComponent(lat)}&lon=${encodeURIComponent(lon)}&accept-language=zh`, {
        cache: 'no-store',
        signal: controller?.signal
      });
      if (!res.ok) return null;
      const data = await res.json();
      const addr = data.address || {};
      const clean = (value) => this._normalizePlaceText(value);
      const joinUnique = (parts, sep = ' ') => {
        const list = [];
        parts.forEach((part) => {
          const text = clean(part);
          if (!text || list.includes(text)) return;
          list.push(text);
        });
        return list.join(sep).trim();
      };

      const city = clean(addr.city || addr.town || addr.municipality || addr.village);
      const district = clean(addr.county || addr.city_district || addr.district || addr.suburb || addr.borough);
      const neighborhood = clean(addr.neighbourhood || addr.quarter || addr.residential);
      const road = clean(addr.road || addr.pedestrian || addr.footway || addr.cycleway);
      const houseNumber = clean(addr.house_number);
      const roadPart = clean(`${road}${houseNumber}`);
      const poi = clean(
        data.name ||
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
        return clean(area ? `${poi} · ${area}` : poi);
      }

      const precise = joinUnique([district, neighborhood, roadPart]);
      if (precise) return precise;

      const normal = joinUnique([city, district, neighborhood, roadPart]);
      if (normal) return normal;

      return clean(addr.state || city || district);
    } catch (e) {
      return null;
    } finally {
      if (timer) clearTimeout(timer);
    }
  },

  async _reverseGeocodeViaBigDataCloud(lat, lon) {
    const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const timer = controller ? setTimeout(() => controller.abort(), 5000) : null;
    try {
      const res = await fetch(`https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${encodeURIComponent(lat)}&longitude=${encodeURIComponent(lon)}&localityLanguage=default`, {
        cache: 'no-store',
        signal: controller?.signal
      });
      if (!res.ok) return null;
      const data = await res.json();
      const administrative = Array.isArray(data?.localityInfo?.administrative) ? data.localityInfo.administrative : [];
      const normalize = (value) => this._normalizePlaceText(value);
      const district = normalize(
        administrative.find((item) => item?.adminLevel === 6)?.name ||
        data.locality
      );
      const street = normalize(
        administrative.find((item) => item?.adminLevel === 8)?.name
      );
      const city = normalize(data.city || data.principalSubdivision);
      return [district, street].filter(Boolean).join(' ') || [city, district].filter(Boolean).join(' ') || null;
    } catch (e) {
      return null;
    } finally {
      if (timer) clearTimeout(timer);
    }
  },

  async reverseGeocode(lat, lon) {
    const fromNominatim = await this._reverseGeocodeViaNominatim(lat, lon);
    if (fromNominatim) return fromNominatim;
    return this._reverseGeocodeViaBigDataCloud(lat, lon);
  },

  _addressBackfillInFlight: new Set(),

  async ensureRecordAddress(record) {
    const recordId = String(record?.record_id || '').trim();
    if (!recordId || record?.address || record?.latitude == null || record?.longitude == null) return null;
    if (this._addressBackfillInFlight.has(recordId)) return null;
    this._addressBackfillInFlight.add(recordId);
    try {
      const address = await this.reverseGeocode(record.latitude, record.longitude);
      if (!address) return null;
      await App.API.Records.update(recordId, { address });
      return address;
    } catch (e) {
      return null;
    } finally {
      this._addressBackfillInFlight.delete(recordId);
    }
  },

  copyToClipboard(text) {
    if (navigator.clipboard) {
      navigator.clipboard.writeText(text).then(() => {
        App.UI.Toast.show('已复制到剪贴板', 'success');
      });
    } else {
      const ta = document.createElement('textarea');
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      ta.remove();
      App.UI.Toast.show('已复制到剪贴板', 'success');
    }
  }
};
