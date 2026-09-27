"use client";

import { useState } from "react";
import { Wand2 } from "lucide-react";
import { CitizenPortrait } from "./CitizenPortrait";
import { api } from "@/lib/api";
import type { CitizenAgent, CityState } from "@/lib/types";

/** Make a resident do anything, in your own words: to someone, or on their own. Then watch the reaction. */
export function ActionPanel({ city, actor, initialTargetId, busy, act, onMessage }: {
  city: CityState;
  actor: CitizenAgent;
  /** Who the action is aimed at when the panel opens (e.g. the person you just tapped). */
  initialTargetId?: string;
  busy: boolean;
  act: (action: () => Promise<CityState>) => Promise<unknown>;
  onMessage: (text: string) => void;
}) {
  const others = city.citizens.filter((c) => c.citizen_id !== actor.citizen_id);
  const nearby = others.filter((c) => c.current_location_id === actor.current_location_id);
  const [targetId, setTargetId] = useState(others.some((c) => c.citizen_id === initialTargetId) ? initialTargetId! : (nearby[0] ?? others[0])?.citizen_id ?? "");
  const [text, setText] = useState("");
  const [result, setResult] = useState("");
  const target = others.find((c) => c.citizen_id === targetId);
  const place = (id: string) => city.locations.find((l) => l.location_id === id)?.name ?? "town";
  const first = actor.name.split(" ")[0];

  const run = () => {
    const words = text.trim();
    if (!words) return;
    void act(async () => {
      const { city: next, headline, talked, error } = await api.act(actor.citizen_id, target?.citizen_id ?? null, words);
      setText("");
      setResult(headline);
      onMessage(error ? `${headline} (${error})` : talked ? `${headline} Watch how they react.` : headline);
      return next;
    });
  };

  return (
    <div className="action-panel">
      <h4>What should {first} do?</h4>
      <label className="action-target">
        <span>With</span>
        <select value={targetId} onChange={(e) => setTargetId(e.target.value)}>
          <option value="">Nobody in particular</option>
          {nearby.length > 0 && <optgroup label={`Here at ${place(actor.current_location_id)}`}>
            {nearby.map((c) => <option key={c.citizen_id} value={c.citizen_id}>{c.name} ({c.age})</option>)}
          </optgroup>}
          <optgroup label="Elsewhere (they'll go to them)">
            {others.filter((c) => !nearby.includes(c)).map((c) => <option key={c.citizen_id} value={c.citizen_id}>{c.name} ({c.age}) · {place(c.current_location_id)}</option>)}
          </optgroup>
        </select>
      </label>
      {target && (
        <div className="action-pair">
          <CitizenPortrait citizen={actor} size={36} /><span aria-hidden="true">→</span><CitizenPortrait citizen={target} size={36} />
          <small>{target.name.split(" ")[0]} is {target.current_activity.toLowerCase()} at {place(target.current_location_id)}</small>
        </div>
      )}
      <form onSubmit={(e) => { e.preventDefault(); run(); }}>
        <textarea className="action-note" value={text} maxLength={400} rows={3} onChange={(e) => setText(e.target.value)} aria-label={`What ${first} does`}
          placeholder={target ? `Anything at all. e.g. "${first} admits they read ${target.name.split(" ")[0]}'s diary" or "${first} asks to borrow $200"` : `e.g. "${first} quits their job on the spot"`} />
        <button className="primary-action full-width" type="submit" disabled={busy || !text.trim()}><Wand2 size={15} /> Make it happen</button>
      </form>
      {result && <p className="action-result" role="status">{result}</p>}
      <p className="news-footnote">Anything goes: the game reads your words, feelings and relationships change, onlookers judge, and everyone remembers. A date, engagement or moving in only happens if the other person says yes.</p>
    </div>
  );
}
