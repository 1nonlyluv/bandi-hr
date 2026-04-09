const DATE_FORMATTER = new Intl.DateTimeFormat("ko-KR", {
  year: "numeric",
  month: "long",
  day: "numeric",
  weekday: "long",
});

const WEEKDAY_FORMATTER = new Intl.DateTimeFormat("ko-KR", {
  weekday: "short",
});

const LONG_WEEKDAY_FORMATTER = new Intl.DateTimeFormat("ko-KR", {
  weekday: "long",
});

export function toIsoDate(date: Date) {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function parseIsoDate(iso: string) {
  const [year, month, day] = iso.split("-").map(Number);
  return new Date(year, month - 1, day);
}

export function shiftIsoDate(iso: string, deltaDays: number) {
  const date = parseIsoDate(iso);
  date.setDate(date.getDate() + deltaDays);
  return toIsoDate(date);
}

export function formatDateLabel(iso: string) {
  return DATE_FORMATTER.format(parseIsoDate(iso));
}

export function formatHeroDate(iso: string) {
  const date = parseIsoDate(iso);
  return `${date.getMonth() + 1}월 ${date.getDate()}일 ${LONG_WEEKDAY_FORMATTER.format(date)}`;
}

export function formatYearLabel(iso: string) {
  return `${parseIsoDate(iso).getFullYear()}`;
}

export function formatWeekdayLabel(iso: string) {
  return WEEKDAY_FORMATTER.format(parseIsoDate(iso));
}

export function isSaturdayIso(iso: string) {
  return parseIsoDate(iso).getDay() === 6;
}

export function formatMetric(value: number) {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}
