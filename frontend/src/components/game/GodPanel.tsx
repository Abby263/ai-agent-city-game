"use client";

import { useState } from "react";
import { Play } from "lucide-react";
import { api } from "@/lib/api";
import { scenarioCatalog, type ScenarioKind } from "@/lib/scenarios";
import { conditionFromWmo, type WeatherOverride } from "@/lib/weather";
import type { CityState } from "@/lib/types";

const skies: Array<{ condition: WeatherOverride["condition"]; icon: string; label: string }> = [
  { condition: "clear", icon: "☀️", label: "Sunny" },
  { condition: "rain", icon: "🌧️", label: "Rain" },
  { condition: "thunderstorm", icon: "⛈️", label: "Thunder" },
  { condition: "snow", icon: "❄️", label: "Snow" },
  { condition: "fog", icon: "🌫️", label: "Fog" },
  { condition: "heatwave", icon: "🥵", label: "Heatwave" },
  { condition: "typhoon", icon: "🌀", label: "Typhoon" },
  { condition: "earthquake", icon: "🫨", label: "Earthquake" },
];

/** Play god: change the weather or set up a situation, then watch the residents react. */
export function GodPanel({ city, busy, act, onMessage, onFocus }: {
  city: CityState;
  busy: boolean;
  act: (action: () => Promise<CityState>) => Promise<void>;
  onMessage: (text: string) => void;
  onFocus: (citizenId: string) => void;
}) {
  const [open, setOpen] = useState<ScenarioKind | null>(null);
  const [place, setPlace] = useState("loc_park");
  const [first, setFirst] = useState(city.citizens[0]?.citizen_id ?? "");
  const [second, setSecond] = useState(city.citizens[1]?.citizen_id ?? "");
  const [amount, setAmount] = useState(100);
  const people = city.citizens.filter((c) => c.age >= 5);
  const watching = city.simulation_mode === "autonomous" && city.clock.running;

  const sky = (condition: WeatherOverride["condition"] | null) => act(() => api.setWeather(condition));
  const tokyo = () => act(async () => {
    const response = await fetch("https://api.open-meteo.com/v1/forecast?latitude=35.6895&longitude=139.6917&current=temperature_2m,weather_code,wind_speed_10m&timezone=Asia%2FTokyo", { signal: AbortSignal.timeout(10000) });
    if (!response.ok) throw new Error("Tokyo's weather service did not answer. Try again later.");
    const data = (await response.json()) as { current: { temperature_2m: number; weather_code: number; wind_speed_10m: number } };
    const condition = conditionFromWmo(data.current.weather_code, data.current.wind_speed_10m);
    onMessage(`Live from Tokyo: ${Math.round(data.current.temperature_2m)}°C, ${condition.replace("_", " ")}. Nakameguro has the same sky for the next six hours.`);
    return api.setWeather(condition, { temp_c: data.current.temperature_2m, source: "tokyo" });
  });
  const create = (kind: ScenarioKind) => act(async () => {
    const { city: next, result } = await api.createSituation({ kind, location_id: place, citizen_ids: [first, second], amount });
    onMessage(`${result.headline} ${watching ? "Watch what happens next." : "Press “Watch how they react” to see them talk it through."}`);
    if (result.focus_id) onFocus(result.focus_id);
    setOpen(null);
    return next;
  });
  const watch = () => act(async () => {
    await api.setMode("autonomous");
    return api.start();
  });

  return (
    <div className="panel-scroll god-panel">
      <p className="god-intro">You control the world. Change the sky or set up a situation, then watch how everyone reacts, each in their own way.</p>
      <button className="primary-action full-width" disabled={busy || watching} onClick={() => void watch()}>
        <Play size={16} /> {watching ? "The city is live" : "Watch how they react"}
      </button>

      <h4>Weather & nature</h4>
      <div className="sky-grid">
        {skies.map((s) => (
          <button key={s.condition} disabled={busy} onClick={() => void sky(s.condition)} aria-pressed={city.weather_override?.condition === s.condition}>
            <span aria-hidden="true">{s.icon}</span>{s.label}
          </button>
        ))}
      </div>
      <div className="sky-extra">
        <button className="outline-action" disabled={busy} onClick={() => void tokyo()}>🗾 Live Tokyo weather</button>
        <button className="text-action" disabled={busy || !city.weather_override} onClick={() => void sky(null)}>Back to normal</button>
      </div>

      <h4>Create a situation</h4>
      <div className="scenario-list">
        {scenarioCatalog.map((s) => (
          <div key={s.kind} className="scenario-card" data-open={open === s.kind}>
            <button className="scenario-head" onClick={() => setOpen(open === s.kind ? null : s.kind)} aria-expanded={open === s.kind}>
              <span aria-hidden="true">{s.icon}</span>
              <span><strong>{s.title}</strong><small>{s.blurb}</small></span>
            </button>
            {open === s.kind && (
              <div className="scenario-form">
                {s.needs.includes("place") && (
                  <label>Where<select value={place} onChange={(e) => setPlace(e.target.value)}>
                    {city.locations.map((l) => <option key={l.location_id} value={l.location_id}>{l.name} ({city.citizens.filter((c) => c.current_location_id === l.location_id).length} here)</option>)}
                  </select></label>
                )}
                {(s.needs.includes("person") || s.needs.includes("pair")) && (
                  <label>{s.needs.includes("pair") ? "First person" : "Who"}<select value={first} onChange={(e) => setFirst(e.target.value)}>
                    {people.map((c) => <option key={c.citizen_id} value={c.citizen_id}>{c.name} ({c.age})</option>)}
                  </select></label>
                )}
                {s.needs.includes("pair") && (
                  <label>Second person<select value={second} onChange={(e) => setSecond(e.target.value)}>
                    {people.map((c) => <option key={c.citizen_id} value={c.citizen_id}>{c.name} ({c.age})</option>)}
                  </select></label>
                )}
                {s.needs.includes("amount") && (
                  <label>Amount (${amount})<input type="range" min={10} max={2000} step={10} value={amount} onChange={(e) => setAmount(Number(e.target.value))} /></label>
                )}
                <button className="primary-action full-width" disabled={busy} onClick={() => void create(s.kind)}>{s.icon} Make it happen</button>
              </div>
            )}
          </div>
        ))}
      </div>
      <p className="news-footnote">Reactions depend on each person&apos;s character, money, mood and friendships. Follow what happens in News and Talk.</p>
    </div>
  );
}
