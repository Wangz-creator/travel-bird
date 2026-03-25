const { DateTime } = require('luxon');

/**
 * 校验 IANA 时区名（如 Asia/Shanghai）。Luxon 无法识别的字符串返回 false。
 */
function isValidIanaTimeZone(tz) {
  if (!tz || typeof tz !== 'string') return false;
  const z = tz.trim();
  if (!z) return false;
  return DateTime.now().setZone(z).isValid;
}

/**
 * 将 UTC/ISO 时间戳格式化为某 IANA 时区下的日历日 YYYY-MM-DD（与前端 Intl en-CA 一致）
 */
function calendarDayInZone(isoString, timeZone) {
  const d = new Date(isoString);
  if (Number.isNaN(d.getTime())) return null;
  try {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    }).format(d);
  } catch (_) {
    return d.toISOString().slice(0, 10);
  }
}

/**
 * 某时区「日历日」00:00～次日 00:00 对应的 UTC 半开区间 [startIso, endIso)，用于 SQL 比较 created_at
 */
function utcRangeForCalendarDay(dateStr, timeZone) {
  const start = DateTime.fromFormat(String(dateStr).trim(), 'yyyy-MM-dd', { zone: timeZone });
  if (!start.isValid) return null;
  const dayStart = start.startOf('day');
  const dayEnd = dayStart.plus({ days: 1 });
  return {
    startIso: dayStart.toUTC().toISO(),
    endIso: dayEnd.toUTC().toISO()
  };
}

module.exports = {
  isValidIanaTimeZone,
  calendarDayInZone,
  utcRangeForCalendarDay
};
