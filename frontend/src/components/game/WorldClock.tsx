"use client";

import { useEffect, useState } from "react";
import { calendarDay, calendarStartFor, formatDate, seasonIcon, tokyoNow } from "@/lib/calendar";
import { weatherAt } from "@/lib/weather";
import { weekday } from "@/lib/routine";
import type { CityState } from "@/lib/types";
import { activeCity } from "@/lib/cities";

const hhmm = (minute: number) => `${String(Math.floor(minute / 60) % 24).padStart(2, "0")}:${String(minute % 60).padStart(2, "0")}`;

/** Date, time, season and weather. In live mode the time is real Tokyo time, updated every second. */
export function WorldClock({ city }: { city: CityState | null }) {
  const live = city?.policy.time_mode === "live";
  const [now, setNow] = useState<ReturnType<typeof tokyoNow> | null>(null);
  useEffect(() => {
    if (!live) return;
    const update = () => setNow(tokyoNow());
    const first = window.setTimeout(update, 0);
    const timer = window.setInterval(update, 1000);
    return () => { window.clearTimeout(first); window.clearInterval(timer); };
  }, [live]);
  if (!city) return <div className="world-clock"><strong>--:--</strong></div>;
  const start = city.calendar_start ?? calendarStartFor(city.clock.day);
  const day = calendarDay(start, city.clock.day);
  const minute = live && now ? now.minute : city.clock.minute_of_day;
  const weather = city.weather ?? weatherAt(start, city.clock.day, city.clock.minute_of_day);
  return (
    <div className="world-clock" title={`${weather.label}, high ${Math.round(weather.high)}°C / low ${Math.round(weather.low)}°C${day.holiday ? ` · ${day.holiday}` : ""}`}>
      <span className="clock-date">
        <span aria-hidden="true">{seasonIcon[day.season]}</span>
        {weekday(city.clock.day).slice(0, 3)}, {formatDate(day)}
        {day.holiday && <em>{day.holiday}</em>}
      </span>
      <strong>
        {hhmm(minute)}
        {live && now && <small>:{String(now.second).padStart(2, "0")}</small>}
      </strong>
      <span className="clock-weather">
        <span aria-hidden="true">{weather.icon}</span>
        {Math.round(weather.temp_c)}°C
      </span>
      <span className={`clock-mode ${live ? "live" : ""}`}>{live ? `LIVE · ${activeCity().metro}` : "Fast-forward"}</span>
    </div>
  );
}
