"use client";

import { useSyncExternalStore } from "react";
import { CITY_LIST, activeCity, cityChosen, setActiveCity, type CityId } from "@/lib/cities";
import { AgentCityShell } from "./AgentCityShell";

const never = () => () => {};

/** Picks a city for this browser. The town, its people and its stories are loaded for that city, so a change reloads. */
export function chooseCity(id: CityId) {
  const changed = id !== activeCity().id || !cityChosen();
  setActiveCity(id, true);
  if (changed) {
    // A link like ?city=lucknow would otherwise win over the choice just made.
    const url = new URL(window.location.href);
    url.searchParams.delete("city");
    window.location.replace(url.toString());
  }
}

export function CityPicker({ onClose }: { onClose?: () => void }) {
  const current = cityChosen() ? activeCity().id : null;
  return (
    <div className="city-picker" role="dialog" aria-modal="true" aria-labelledby="city-picker-title">
      <div className="city-picker-inner">
        <small>AGENTCITY</small>
        <h1 id="city-picker-title">Where do you want to play?</h1>
        <p>Each city has its own people, secrets and cases. You can switch at any time; each keeps its own saved world.</p>
        <div className="city-cards">
          {CITY_LIST.map((city) => (
            <button key={city.id} className="city-card" data-city={city.id} aria-pressed={current === city.id}
              onClick={() => (current === city.id && onClose ? onClose() : chooseCity(city.id))}>
              <span className="city-card-art" aria-hidden="true">{city.emoji}</span>
              <strong>{city.name}</strong>
              <em>{city.region}, {city.country}</em>
              <span>{city.blurb}</span>
              <b>{current === city.id ? "Keep playing" : "Play here"}</b>
            </button>
          ))}
        </div>
        {onClose && <button className="text-action city-picker-close" onClick={onClose}>Cancel</button>}
      </div>
    </div>
  );
}

/** First visit: choose a city before anything loads. After that, straight into the game. */
export function CityGate() {
  // The server render can't know the choice; the browser decides once it has mounted.
  const chosen = useSyncExternalStore(never, cityChosen, () => null);
  if (chosen === null) return <main className="city-game" aria-busy="true" />;
  return chosen ? <AgentCityShell /> : <CityPicker />;
}
