// Nakameguro is a Japanese town: dates, seasons, public holidays and school breaks follow Japan.
// City day 1 is always a Monday, so a world's calendar starts on the Monday of the week it was created.

const DAY_MS = 86_400_000;

/** The Monday on or before `date`, as YYYY-MM-DD in Japan time. */
export function mondayOnOrBefore(date: Date) {
  const tokyo = new Date(date.getTime() + 9 * 3_600_000);
  const utc = Date.UTC(tokyo.getUTCFullYear(), tokyo.getUTCMonth(), tokyo.getUTCDate());
  const weekday = (new Date(utc).getUTCDay() + 6) % 7; // 0 = Monday
  return new Date(utc - weekday * DAY_MS).toISOString().slice(0, 10);
}

/** Calendar start for a world currently on `day`, so that today's real week lines up with it. */
export function calendarStartFor(day: number, now = new Date()) {
  const monday = Date.parse(`${mondayOnOrBefore(now)}T00:00:00Z`);
  const offset = Math.floor((day - 1) / 7) * 7;
  return new Date(monday - offset * DAY_MS).toISOString().slice(0, 10);
}

export type CalendarDay = {
  date: Date;
  year: number;
  month: number; // 1-12
  dayOfMonth: number;
  /** Day of the year, 1-366. */
  yearDay: number;
  season: "spring" | "summer" | "autumn" | "winter";
  holiday: string | null;
  schoolBreak: string | null;
};

export function calendarDay(start: string, day: number): CalendarDay {
  const date = new Date(Date.parse(`${start}T00:00:00Z`) + (day - 1) * DAY_MS);
  const year = date.getUTCFullYear(), month = date.getUTCMonth() + 1, dayOfMonth = date.getUTCDate();
  const yearDay = Math.floor((date.getTime() - Date.UTC(year, 0, 1)) / DAY_MS) + 1;
  const season = month >= 3 && month <= 5 ? "spring" : month >= 6 && month <= 8 ? "summer" : month >= 9 && month <= 11 ? "autumn" : "winter";
  return { date, year, month, dayOfMonth, yearDay, season, holiday: holidayOn(date), schoolBreak: schoolBreakOn(month, dayOfMonth) };
}

/** Nth weekday (0 = Monday) of a month, for "happy Monday" holidays. */
function nthMonday(year: number, month: number, n: number) {
  const first = new Date(Date.UTC(year, month - 1, 1));
  const shift = (7 - ((first.getUTCDay() + 6) % 7)) % 7;
  return 1 + shift + (n - 1) * 7;
}

export function holidayOn(date: Date): string | null {
  const y = date.getUTCFullYear(), m = date.getUTCMonth() + 1, d = date.getUTCDate();
  const fixed: Record<string, string> = {
    "1-1": "New Year's Day", "1-2": "New Year holiday", "1-3": "New Year holiday", "2-11": "National Foundation Day",
    "2-23": "Emperor's Birthday", "3-20": "Vernal Equinox Day", "4-29": "Showa Day", "5-3": "Constitution Day",
    "5-4": "Greenery Day", "5-5": "Children's Day", "8-11": "Mountain Day", "9-23": "Autumnal Equinox Day",
    "11-3": "Culture Day", "11-23": "Labour Thanksgiving Day",
  };
  if (fixed[`${m}-${d}`]) return fixed[`${m}-${d}`];
  if (m === 1 && d === nthMonday(y, 1, 2)) return "Coming of Age Day";
  if (m === 7 && d === nthMonday(y, 7, 3)) return "Marine Day";
  if (m === 9 && d === nthMonday(y, 9, 3)) return "Respect for the Aged Day";
  if (m === 10 && d === nthMonday(y, 10, 2)) return "Sports Day";
  return null;
}

export function schoolBreakOn(month: number, day: number): string | null {
  if ((month === 7 && day >= 20) || month === 8) return "Summer break";
  if ((month === 12 && day >= 25) || (month === 1 && day <= 7)) return "Winter break";
  if ((month === 3 && day >= 25) || (month === 4 && day <= 5)) return "Spring break";
  return null;
}

const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
export const formatDate = (c: CalendarDay) => `${c.dayOfMonth} ${monthNames[c.month - 1]} ${c.year}`;
export const seasonIcon = { spring: "🌸", summer: "🎐", autumn: "🍁", winter: "⛄" } as const;

/** Current wall-clock time in Tokyo. */
export function tokyoNow(now = new Date()) {
  const t = new Date(now.getTime() + 9 * 3_600_000);
  return { date: t.toISOString().slice(0, 10), minute: t.getUTCHours() * 60 + t.getUTCMinutes(), second: t.getUTCSeconds() };
}

/** The city day and minute that correspond to real Tokyo time for a calendar starting on `start`. */
export function realCityTime(start: string, now = new Date()) {
  const { date, minute, second } = tokyoNow(now);
  const day = Math.round((Date.parse(`${date}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) / DAY_MS) + 1;
  return { day, minute, second };
}
