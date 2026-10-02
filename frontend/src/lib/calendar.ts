import { activeCity } from "./cities";

// Dates, seasons, public holidays and school breaks follow the city being played (Japan for Nakameguro, India for
// Lucknow). City day 1 is always a Monday, so a world's calendar starts on the Monday of the week it was created.

const DAY_MS = 86_400_000;

/** The Monday on or before `date`, as YYYY-MM-DD in the city's own time. */
export function mondayOnOrBefore(date: Date) {
  const tokyo = new Date(date.getTime() + activeCity().utcOffsetMinutes * 60_000);
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
  const season = activeCity().season(month);
  return { date, year, month, dayOfMonth, yearDay, season, holiday: holidayOn(date), schoolBreak: schoolBreakOn(month, dayOfMonth) };
}

export const holidayOn = (date: Date): string | null => activeCity().holiday(date);
export const schoolBreakOn = (month: number, day: number): string | null => activeCity().schoolBreak(month, day);

const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
export const formatDate = (c: CalendarDay) => `${c.dayOfMonth} ${monthNames[c.month - 1]} ${c.year}`;
/** The season's icon in the city being played. */
export const seasonIcon = new Proxy({} as Record<CalendarDay["season"], string>, { get: (_, season: string) => activeCity().seasonIcon[season as CalendarDay["season"]] });

/** Current wall-clock time in the city being played (the name is from when there was only Tokyo). */
export function tokyoNow(now = new Date()) {
  const t = new Date(now.getTime() + activeCity().utcOffsetMinutes * 60_000);
  return { date: t.toISOString().slice(0, 10), minute: t.getUTCHours() * 60 + t.getUTCMinutes(), second: t.getUTCSeconds() };
}

/** The city day and minute that correspond to real Tokyo time for a calendar starting on `start`. */
export function realCityTime(start: string, now = new Date()) {
  const { date, minute, second } = tokyoNow(now);
  const day = Math.round((Date.parse(`${date}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) / DAY_MS) + 1;
  return { day, minute, second };
}
