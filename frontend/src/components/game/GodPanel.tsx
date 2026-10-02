"use client";

import { activeCity } from "@/lib/cities";
import { useEffect, useState } from "react";
import { Play, Wand2 } from "lucide-react";
import { api } from "@/lib/api";
import { conditionFromWmo, type WeatherOverride } from "@/lib/weather";
import { liveElection } from "@/lib/elections";
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
export function GodPanel({ city, busy, act, onMessage, onStarted }: {
  city: CityState;
  busy: boolean;
  act: (action: () => Promise<CityState>) => Promise<unknown>;
  onMessage: (text: string) => void;
  /** Close the panel and fly the camera to where it's happening. */
  onStarted: (ids: string[], locationId?: string) => void;
}) {
  const [open, setOpen] = useState(false);
  // The opened election form can land below the fold; bring all of it into view.
  useEffect(() => {
    if (open) document.querySelector(".scenario-card[data-open='true']")?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [open]);
  const watching = city.simulation_mode === "autonomous" && city.clock.running;

  const sky = (condition: WeatherOverride["condition"] | null) => act(() => api.setWeather(condition));
  const place = activeCity();
  const tokyo = () => act(async () => {
    const response = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${place.coords.lat}&longitude=${place.coords.lon}&current=temperature_2m,weather_code,wind_speed_10m&timezone=${encodeURIComponent(place.timezone)}`, { signal: AbortSignal.timeout(10000) });
    if (!response.ok) throw new Error(`${place.metro}'s weather service did not answer. Try again later.`);
    const data = (await response.json()) as { current: { temperature_2m: number; weather_code: number; wind_speed_10m: number } };
    const condition = conditionFromWmo(data.current.weather_code, data.current.wind_speed_10m);
    onMessage(`Live from ${place.metro}: ${Math.round(data.current.temperature_2m)}°C, ${condition.replace("_", " ")}. ${place.name} has the same sky for the next six hours.`);
    return api.setWeather(condition, { temp_c: data.current.temperature_2m, source: "tokyo" });
  });
  const candidates = city.citizens;
  const [candidateA, setCandidateA] = useState(candidates[0]?.citizen_id ?? "");
  const [candidateB, setCandidateB] = useState(candidates[1]?.citizen_id ?? "");
  const validCandidates = candidateA !== candidateB && [candidateA, candidateB].every((id) => candidates.some((c) => c.citizen_id === id));
  const running = liveElection(city);
  const election = () => {
    if (!validCandidates) return;
    onStarted([candidateA, candidateB], "loc_city_hall");
    void act(async () => {
      const next = await api.startElection(candidateA, candidateB);
      onMessage("🗳️ The election has started. Watch the campaign in “Happening now”.");
      return next;
    });
  };
  // Anything at all, in the player's words: the game master decides who it happens to and where.
  const [idea, setIdea] = useState("");
  const anything = () => {
    const text = idea.trim();
    if (!text) return;
    setIdea("");
    void act(async () => {
      const { city: next, headline, talked, error, story_id } = await api.act(null, null, text);
      onMessage(`✨ ${headline} ${talked ? "Watch their reaction." : error ? `(${error})` : "Follow it in “Happening now”."}`);
      const story = next.stories?.find((s) => s.id === story_id);
      if (story) onStarted(story.focus_ids, story.location_id ?? undefined);
      return next;
    });
  };
  const watch = () => act(async () => {
    await api.setMode("autonomous");
    return api.start();
  });

  return (
    <div className="panel-scroll god-panel">
      <p className="god-intro">You control the world. Write anything that happens, change the sky or hold an election, then watch how everyone reacts, each in their own way.</p>
      <button className="primary-action full-width" disabled={busy || watching} onClick={() => void watch()}>
        <Play size={16} /> {watching ? "The city is live" : "Watch how they react"}
      </button>

      <h4>Make anything happen</h4>
      <form className="anything-form" onSubmit={(e) => { e.preventDefault(); anything(); }}>
        <textarea value={idea} maxLength={400} rows={3} onChange={(e) => setIdea(e.target.value)} aria-label="Describe anything that happens"
          placeholder="Anything at all. e.g. “Kenji finds Haruto's manga sketchbook”, “a water pipe bursts at the library”, “Yui gets a job offer in Osaka”" />
        <button className="primary-action full-width" type="submit" disabled={busy || !idea.trim()}><Wand2 size={15} /> Make it happen</button>
      </form>

      <h4>Weather & nature</h4>
      <div className="sky-grid">
        {skies.map((s) => (
          <button key={s.condition} disabled={busy} onClick={() => void sky(s.condition)} aria-pressed={city.weather_override?.condition === s.condition}>
            <span aria-hidden="true">{s.icon}</span>{s.label}
          </button>
        ))}
      </div>
      <div className="sky-extra">
        <button className="outline-action" disabled={busy} onClick={() => void tokyo()}>{place.emoji} Live {place.metro} weather</button>
        <button className="text-action" disabled={busy || !city.weather_override} onClick={() => void sky(null)}>Back to normal</button>
      </div>

      <h4>Hold an election</h4>
      <div className="scenario-card" data-open={open}>
        <button className="scenario-head" aria-expanded={open} onClick={() => setOpen(!open)}>
          <span aria-hidden="true">🗳️</span>
          <span><strong>Neighbourhood election</strong><small>Two residents campaign for the neighbourhood association. Everyone gets a secret ballot.</small></span>
        </button>
        {open && (
          <div className="scenario-form">
            {running ? <p className="muted-copy">An election is already running. Follow it in “Happening now”.</p> : <>
              <label>First candidate<select value={candidateA} onChange={(e) => setCandidateA(e.target.value)}>
                {candidates.map((c) => <option key={c.citizen_id} value={c.citizen_id}>{c.name} ({c.age})</option>)}
              </select></label>
              <label>Second candidate<select value={candidateB} onChange={(e) => setCandidateB(e.target.value)}>
                {candidates.map((c) => <option key={c.citizen_id} value={c.citizen_id}>{c.name} ({c.age})</option>)}
              </select></label>
              <button className="primary-action full-width" disabled={busy || !validCandidates} onClick={election}>🗳️ Start the election</button>
            </>}
          </div>
        )}
      </div>
      <p className="news-footnote">Reactions depend on each person&apos;s character, money, mood and friendships. Everything that follows is tracked in “Happening now”.</p>
    </div>
  );
}
