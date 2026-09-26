"use client";

import { useId, useState } from "react";
import { bondClusters, bondValue, overviewBonds, type BondMetric } from "@/lib/bond-network";
import { bondLabel, bondMetrics } from "@/lib/social";
import type { CitizenAgent, Relationship } from "@/lib/types";
import { CitizenPortrait } from "./CitizenPortrait";

const clusterColors = ["#18837e", "#b25780", "#597ab1", "#9e782a"];

export function BondNetwork({ citizens, relationships, initialFocus = "" }: {
  citizens: CitizenAgent[]; relationships: Relationship[]; initialFocus?: string;
}) {
  const [focus, setFocus] = useState(initialFocus);
  const [metric, setMetric] = useState<BondMetric>("trust");
  const [targetId, setTargetId] = useState("");
  const uid = useId();
  const groups = bondClusters(citizens, relationships);
  const ordered = groups.flat().map((id) => citizens.find((c) => c.citizen_id === id)!);
  const perimeter = focus ? ordered.filter((c) => c.citizen_id !== focus) : ordered;
  const nodes = ordered.map((citizen) => {
    if (citizen.citizen_id === focus) return { citizen, x: 200, y: 200 };
    const angle = (perimeter.indexOf(citizen) / perimeter.length) * Math.PI * 2 - Math.PI / 2;
    return { citizen, x: 200 + Math.cos(angle) * 151, y: 200 + Math.sin(angle) * 151 };
  });
  const groupIndex = (id: string) => groups.findIndex((g) => g.length > 1 && g.includes(id));
  const color = (id: string) => groupIndex(id) < 0 ? "#929d99" : clusterColors[groupIndex(id) % clusterColors.length];
  const focused = citizens.find((c) => c.citizen_id === focus);
  const edges = focus ? relationships.filter((r) => r.citizen_id === focus) : overviewBonds(relationships, metric);
  const selected = relationships.find((r) => r.citizen_id === focus && r.other_citizen_id === targetId);
  const reverse = relationships.find((r) => r.citizen_id === targetId && r.other_citizen_id === focus);
  const target = citizens.find((c) => c.citizen_id === targetId);
  return <section className="bond-network" aria-label="Relationship network">
    <div className="network-controls">
      <label>Perspective<select aria-label="Network perspective" value={focus} onChange={(e) => { setFocus(e.target.value); setTargetId(""); }}>
        <option value="">Friendship circles</option>
        {citizens.map((c) => <option key={c.citizen_id} value={c.citizen_id}>{c.name}</option>)}
      </select></label>
      <label>Feeling<select aria-label="Network feeling" value={metric} onChange={(e) => setMetric(e.target.value as BondMetric)}>
        {Object.entries(bondMetrics).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
      </select></label>
    </div>
    <div className="network-stage">
      <svg viewBox="0 0 400 400" role="img" aria-label={focused ? `${focused.name}'s ${bondMetrics[metric].toLowerCase()} toward residents, out of 100` : "Strongest shared connections; numbers show the average of both directions"}>
        <defs><marker id={uid} markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto"><path d="M0 0 L6 3 L0 6" fill="context-stroke" /></marker></defs>
        <circle cx="200" cy="200" r="151" className="network-orbit" />
        {edges.map((r) => {
          const a = nodes.find((n) => n.citizen.citizen_id === r.citizen_id);
          const b = nodes.find((n) => n.citizen.citizen_id === r.other_citizen_id);
          if (!a || !b) return null;
          const back = relationships.find((v) => v.citizen_id === r.other_citizen_id && v.other_citizen_id === r.citizen_id);
          const mutual = ["Friends", "Close friends"].includes(bondLabel(r)) && back && ["Friends", "Close friends"].includes(bondLabel(back));
          const value = focus ? bondValue(r, metric) : Math.round((bondValue(r, metric) + (back ? bondValue(back, metric) : 0)) / 2);
          const dx = b.x - a.x, dy = b.y - a.y, length = Math.hypot(dx, dy);
          const start = { x: a.x + dx / length * 28, y: a.y + dy / length * 28 };
          const end = { x: b.x - dx / length * 28, y: b.y - dy / length * 28 };
          const ratio = 0.5;
          const x = start.x + (end.x - start.x) * ratio, y = start.y + (end.y - start.y) * ratio;
          return <g key={r.relationship_id}>
            <line x1={start.x} y1={start.y} x2={end.x} y2={end.y} stroke={focus ? "#427d78" : color(r.citizen_id)}
              strokeWidth={1 + value / 35} strokeDasharray={!focus && !mutual ? "4 5" : undefined}
              opacity={selected && selected !== r ? 0.25 : 0.8} markerEnd={focus ? `url(#${uid})` : undefined} />
            <rect x={x - 13} y={y - 10} width="26" height="20" rx="5" className="network-score-bg" />
            <text x={x} y={y + 4} textAnchor="middle" className="network-score">{value}</text>
          </g>;
        })}
      </svg>
      {nodes.map(({ citizen, x, y }) => <button key={citizen.citizen_id}
        className={`network-person ${focus === citizen.citizen_id ? "selected" : ""} ${targetId === citizen.citizen_id ? "target" : ""}`}
        style={{ left: `${x / 4}%`, top: `${y / 4}%`, borderColor: color(citizen.citizen_id) }}
        aria-label={`${citizen.name}${focus && focus !== citizen.citizen_id ? ", inspect bond" : ", show feelings"}`}
        aria-pressed={focus === citizen.citizen_id || targetId === citizen.citizen_id}
        onClick={() => { if (focus && focus !== citizen.citizen_id) setTargetId(citizen.citizen_id); else { setFocus(citizen.citizen_id); setTargetId(""); } }}>
        <CitizenPortrait citizen={citizen} size={40} /><span>{citizen.name.split(" ")[0]}</span>
      </button>)}
    </div>
    <div className="network-legend">
      <strong>{focused ? `${focused.name.split(" ")[0]} → others` : "Strongest shared connections"}</strong>
      <span>{bondMetrics[metric]} / 100{!focused && " · two-way average"}</span>
      {!focused && <span>Color: friendship circle · Dashes: still getting acquainted</span>}
    </div>
    {!focus && <div className="network-clusters">{groups.filter((g) => g.length > 1).map((g, i) =>
      <span key={g[0]} style={{ borderColor: clusterColors[i % clusterColors.length] }}>{g.map((id) => citizens.find((c) => c.citizen_id === id)?.name.split(" ")[0]).join(" · ")}</span>
    )}{groups.every((g) => g.length === 1) && <p>No mutual friendships yet.</p>}</div>}
    {selected && reverse && focused && target && <div className="network-detail">
      <div><strong>{focused.name.split(" ")[0]} → {target.name.split(" ")[0]}</strong><b>{bondValue(selected, metric)}/100</b></div>
      <div><strong>{target.name.split(" ")[0]} → {focused.name.split(" ")[0]}</strong><b>{bondValue(reverse, metric)}/100</b></div>
      <small>{bondLabel(selected)} · {focused.mood}</small>
      <p>{selected.history?.at(-1)?.reason ?? selected.notes}</p>
    </div>}
  </section>;
}
