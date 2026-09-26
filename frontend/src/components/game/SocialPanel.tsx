"use client";

import { useState } from "react";
import { ArrowRight, Heart, MessageCircle } from "lucide-react";
import { CitizenPortrait } from "./CitizenPortrait";
import { emptyFeelings, feelingNames } from "@/lib/social";
import { BondNetwork } from "./BondNetwork";
import type { CityState, Conversation, Feelings, Relationship } from "@/lib/types";

const clock = (minute: number) => `${String(Math.floor(minute / 60)).padStart(2, "0")}:${String(minute % 60).padStart(2, "0")}`;

export function FeelingMeters({ relationship }: { relationship: Relationship }) {
  const feelings = { ...emptyFeelings(), ...relationship.feelings };
  return <div className="feeling-meters">
    {(Object.keys(feelingNames) as Array<keyof Feelings>).map((key) => <div key={key} className={`feeling-meter feeling-${key}`}>
      <label><span>{feelingNames[key]}</span><strong>{feelings[key]}/100</strong></label>
      <meter min={0} max={100} value={feelings[key]} aria-label={feelingNames[key]} />
    </div>)}
  </div>;
}

export function SocialPanel({ city, relationships, conversations, onConversation }: {
  city: CityState;
  relationships: Relationship[];
  conversations: Conversation[];
  onConversation: (id: string) => void;
}) {
  const [view, setView] = useState<"changes" | "bonds">("bonds");
  const [filter, setFilter] = useState("all");
  const [onlyChanges, setOnlyChanges] = useState(true);
  const names = new Map(city.citizens.map((c) => [c.citizen_id, c]));
  const available = new Set(conversations.map((c) => c.conversation_id));
  const visible = relationships.filter((r) => filter === "all" || r.citizen_id === filter);
  const changes = visible.flatMap((r) => (r.history ?? []).map((entry, index) => ({ r, entry, index })))
    .filter(({ entry }) => !onlyChanges || Object.keys(entry.changes ?? {}).length > 0 || entry.effect !== "neutral")
    .sort((a, b) => b.entry.day - a.entry.day || b.entry.minute - a.entry.minute);
  function pair(r: Relationship) {
    const from = names.get(r.citizen_id), to = names.get(r.other_citizen_id);
    if (!from || !to) return null;
    return <div className="social-pair">
      <CitizenPortrait citizen={from} size={32} />
      <strong>{from.name.split(" ")[0]}</strong><ArrowRight size={14} aria-label="feels toward" />
      <CitizenPortrait citizen={to} size={32} /><strong>{to.name.split(" ")[0]}</strong>
    </div>;
  }
  return <>
    {view === "changes" && <div className="conversation-filter">
      <label htmlFor="feeling-owner">Perspective</label>
      <select id="feeling-owner" value={filter} onChange={(e) => setFilter(e.target.value)}>
        <option value="all">Everyone</option>
        {city.citizens.map((c) => <option key={c.citizen_id} value={c.citizen_id}>{c.name}</option>)}
      </select>
    </div>}
    <div className="social-tabs" role="tablist" aria-label="Relationship views">
      <button role="tab" aria-selected={view === "bonds"} onClick={() => setView("bonds")}>Social map</button>
      <button role="tab" aria-selected={view === "changes"} onClick={() => setView("changes")}>Recent changes</button>
    </div>
    <div className="panel-scroll social-scroll" role="tabpanel">
      {view === "changes" ? <>
        <label className="change-filter"><input type="checkbox" checked={onlyChanges} onChange={(e) => setOnlyChanges(e.target.checked)} />Changes only</label>
        {changes.length === 0 && <div className="social-empty"><Heart size={28} /><h3>No emotional changes yet</h3><p>Shared experiences are still unfolding.</p></div>}
        {changes.map(({ r, entry, index }) => <article className="social-change" key={`${r.relationship_id}-${index}`}>
          <time>Day {entry.day} · {clock(entry.minute)}</time>
          {pair(r)}
          <div className="feeling-deltas">
            {Object.entries(entry.changes ?? {}).map(([key, value]) => <span className={`feeling-${key}`} key={key}>{feelingNames[key as keyof Feelings]} {value! > 0 ? "+" : ""}{value}</span>)}
            {!Object.keys(entry.changes ?? {}).length && <span>{entry.effect === "positive" ? "Trust grew" : entry.effect === "negative" ? "Trust fell" : "Feelings unchanged"}</span>}
          </div>
          {entry.mood && <small className="social-mood">{entry.mood}</small>}
          <p>{entry.reason}</p>
          {entry.conversation_id && <button className="text-action" disabled={!available.has(entry.conversation_id)} onClick={() => onConversation(entry.conversation_id!)}><MessageCircle size={14} />{available.has(entry.conversation_id) ? "Read the exchange" : "Exchange no longer in recent history"}</button>}
        </article>)}
      </> : <BondNetwork citizens={city.citizens} relationships={relationships} />}
    </div>
  </>;
}
