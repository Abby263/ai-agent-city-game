"use client";

import { useState } from "react";
import { CitizenPortrait } from "./CitizenPortrait";
import { actionBlocked, actions, type ActionGroup, type ActionId } from "@/lib/actions";
import { api } from "@/lib/api";
import type { CitizenAgent, CityState } from "@/lib/types";

const groups: Array<{ id: ActionGroup; label: string }> = [
  { id: "talk", label: "Talk" },
  { id: "kind", label: "Be kind" },
  { id: "love", label: "Love (grown-ups)" },
  { id: "conflict", label: "Conflict" },
];

/** Make any resident do something to any other, then watch both of them react. */
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
  const [note, setNote] = useState("");
  const [result, setResult] = useState("");
  const target = others.find((c) => c.citizen_id === targetId);
  const place = (id: string) => city.locations.find((l) => l.location_id === id)?.name ?? "town";
  const first = actor.name.split(" ")[0];

  const run = (id: ActionId) => {
    if (!target) return;
    void act(async () => {
      const { city: next, outcome, talked, error } = await api.performAction(actor.citizen_id, target.citizen_id, id, note);
      setNote("");
      setResult(outcome.headline);
      onMessage(talked ? `${outcome.headline} Watch how they react.` : error ? `${outcome.headline} (${error})` : outcome.headline);
      return next;
    });
  };

  return (
    <div className="action-panel">
      <h4>What should {first} do?</h4>
      <label className="action-target">
        <span>To</span>
        <select value={targetId} onChange={(e) => setTargetId(e.target.value)}>
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
      <input className="action-note" value={note} maxLength={300} onChange={(e) => setNote(e.target.value)}
        placeholder={`Optional: what ${first} says (e.g. "Want to study together?")`} aria-label="What they say" />
      {groups.map((group) => (
        <section key={group.id} className="action-group" data-group={group.id}>
          <small>{group.label}</small>
          <div>
            {actions.filter((a) => a.group === group.id).map((a) => {
              const blocked = target ? actionBlocked(city, actor, target, a.id) : "Choose someone.";
              return (
                <button key={a.id} disabled={busy || Boolean(blocked)} title={blocked ?? a.label} onClick={() => run(a.id)}>
                  <span aria-hidden="true">{a.icon}</span>{a.label}
                </button>
              );
            })}
          </div>
        </section>
      ))}
      {result && <p className="action-result" role="status">{result}</p>}
      <p className="news-footnote">Actions have real consequences: feelings change, onlookers judge, and they will remember it. In Auto or when you play as someone, they talk it through.</p>
    </div>
  );
}
