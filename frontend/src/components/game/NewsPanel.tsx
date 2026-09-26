"use client";

import { CitizenPortrait } from "./CitizenPortrait";
import { weekday } from "@/lib/routine";
import type { CityState, LifeLogEntry } from "@/lib/types";

const time = (minute: number) => `${String(Math.floor(minute / 60)).padStart(2, "0")}:${String(minute % 60).padStart(2, "0")}`;

/** The town newspaper: births, birthdays, illness, love, jobs, report cards and goodbyes. */
export function NewsPanel({ city, onSelect }: { city: CityState; onSelect: (id: string) => void }) {
  const byDay = new Map<number, LifeLogEntry[]>();
  for (const entry of [...(city.life_log ?? [])].reverse()) byDay.set(entry.day, [...(byDay.get(entry.day) ?? []), entry]);
  const upcoming = (city.gatherings ?? []).filter((g) => g.day >= city.clock.day).sort((a, b) => a.day - b.day || a.start - b.start);
  const expecting = city.citizens.filter((c) => c.life?.pregnancy);
  return (
    <div className="panel-scroll news-panel">
      <div className="news-masthead">
        <strong>The Nakameguro Daily</strong>
        <span>{weekday(city.clock.day)}, day {city.clock.day} · population {city.citizens.length}</span>
      </div>
      {(upcoming.length > 0 || expecting.length > 0) && (
        <>
          <h4>Coming up</h4>
          {upcoming.map((g) => (
            <p className="news-upcoming" key={g.id}>
              {g.kind === "birthday" ? "🎈" : g.kind === "wedding" ? "💒" : "🕯️"} <strong>{g.title}</strong> · {g.day === city.clock.day ? "today" : `day ${g.day}`} {time(g.start)} · {city.locations.find((l) => l.location_id === g.location_id)?.name}
            </p>
          ))}
          {expecting.map((c) => (
            <p className="news-upcoming" key={c.citizen_id}>🤰 <strong>{c.name}</strong> is expecting · due {c.life!.pregnancy!.due_day - city.clock.day > 0 ? `in ${c.life!.pregnancy!.due_day - city.clock.day} days` : "any moment"}</p>
          ))}
        </>
      )}
      {byDay.size === 0 ? (
        <p className="muted-copy">No news yet. Press play and let life happen: birthdays, colds, new jobs, new friends, new babies.</p>
      ) : (
        [...byDay.entries()].map(([day, entries]) => (
          <section key={day} className="news-day">
            <h4>{weekday(day)}, day {day}</h4>
            {entries.map((entry) => (
              <article key={entry.id} className="news-item" data-kind={entry.kind}>
                <span aria-hidden="true">{entry.icon}</span>
                <div>
                  <p>{entry.headline}</p>
                  <small>{time(entry.minute)}</small>
                </div>
              </article>
            ))}
          </section>
        ))
      )}
      {(city.departed ?? []).length > 0 && (
        <>
          <h4>In loving memory</h4>
          {city.departed!.map((person) => (
            <div className="memorial" key={person.citizen_id}>
              <CitizenPortrait citizen={person} size={40} />
              <div><strong>{person.name}</strong><small>{person.age} years · died on day {person.died_day} ({person.cause})</small></div>
            </div>
          ))}
        </>
      )}
      <p className="news-footnote">Tap a resident on the map or in the portrait strip to see how they are doing.</p>
      <button className="outline-action full-width" onClick={() => city.citizens[0] && onSelect(city.citizens[0].citizen_id)}>Meet the residents</button>
    </div>
  );
}
