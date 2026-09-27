"use client";

import { achievements, type Unlocked } from "@/lib/achievements";
import { weekday } from "@/lib/routine";

const time = (minute: number) =>
  `${String(Math.floor(minute / 60)).padStart(2, "0")}:${String(minute % 60).padStart(2, "0")}`;

export function BadgesPanel({ unlocked }: { unlocked: Unlocked }) {
  const earned = achievements.filter((a) => unlocked[a.id]).length;
  return (
    <div className="panel-scroll">
      <div className="badge-progress">
        <strong>{earned} / {achievements.length}</strong>
        <span>badges earned</span>
        <meter min={0} max={achievements.length} value={earned} aria-label="Badges earned" />
      </div>
      <ul className="badge-grid">
        {[...achievements].sort((a, b) => Number(Boolean(unlocked[b.id])) - Number(Boolean(unlocked[a.id]))).map((a) => {
          const when = unlocked[a.id];
          return (
            <li key={a.id} className="badge-card" data-earned={Boolean(when)}>
              <span className="badge-icon" aria-hidden="true">{when ? a.icon : "🔒"}</span>
              <div>
                <strong>{a.title}</strong>
                <p>{a.hint}</p>
                {when && <small>Earned {weekday(when.day)}, day {when.day} · {time(when.minute)}</small>}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
