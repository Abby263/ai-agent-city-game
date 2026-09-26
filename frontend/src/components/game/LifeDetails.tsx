"use client";

import { CitizenPortrait } from "./CitizenPortrait";
import { ageInDays, daysUntilBirthday, gradeLetter, lifeStage, relationName, relatives } from "@/lib/life";
import { weekdayNames } from "@/lib/routine";
import type { CitizenAgent, CityState } from "@/lib/types";

const time = (minute: number) => `${String(Math.floor(minute / 60)).padStart(2, "0")}:${String(minute % 60).padStart(2, "0")}`;
const stageLabel = { baby: "Baby", child: "Child", teen: "Teenager", adult: "Adult", elder: "Senior" } as const;
const statusLabel = { single: "Single", dating: "Dating", partnered: "Partner", married: "Married", widowed: "Widowed" } as const;

function Bar({ icon, label, value, tone }: { icon: string; label: string; value: number; tone: string }) {
  return (
    <div className="life-bar">
      <span><i aria-hidden="true">{icon}</i>{label}<b>{Math.round(value)}</b></span>
      <meter className={tone} min={0} max={100} value={value} aria-label={label} />
    </div>
  );
}

export function LifeDetails({ citizen, city, onSelect }: { citizen: CitizenAgent; city: CityState; onSelect: (id: string) => void }) {
  const life = citizen.life;
  if (!life) return null;
  const day = city.clock.day;
  const birthdayIn = daysUntilBirthday(life, day);
  const days = ageInDays(life, day) % 365;
  const family = relatives(city, citizen).map((id) => city.citizens.find((c) => c.citizen_id === id)).filter((c) => c !== undefined);
  const partner = city.citizens.find((c) => c.citizen_id === life.partner_id);
  const bmi = life.weight_kg / (life.height_cm / 100) ** 2;
  const place = (id: string) => city.locations.find((l) => l.location_id === id)?.name ?? id;
  return (
    <section className="life-details" aria-label={`${citizen.name}'s life`}>
      <div className="life-chips">
        <span>{birthdayIn === 0 ? "🎉 Birthday today!" : `🎂 Birthday in ${birthdayIn} day${birthdayIn === 1 ? "" : "s"}`}</span>
        <span>{stageLabel[lifeStage(citizen.age)]} · {citizen.age < 2 ? `${Math.floor(ageInDays(life, day) / 30)} months` : `${citizen.age} y ${days} d`}</span>
        <span>📏 {Math.round(life.height_cm)} cm</span>
        <span>⚖️ {life.weight_kg.toFixed(1)} kg{citizen.age >= 18 ? ` · BMI ${bmi.toFixed(1)}` : ""}</span>
      </div>

      {(life.pregnancy || life.conditions.length > 0) && (
        <div className="life-health">
          {life.pregnancy && <p>🤰 Expecting a baby{life.pregnancy.due_day - day > 0 ? ` in ${life.pregnancy.due_day - day} days` : " any moment now"}</p>}
          {life.conditions.map((c) => (
            <p key={c.id}>
              {c.chronic ? "🫀" : "🤒"} <strong>{c.name}</strong> · {c.severity >= 60 ? "serious" : c.severity >= 35 ? "moderate" : "mild"}
              {c.chronic ? ((c.treated_until ?? 0) >= day ? " · on medication" : " · needs medicine") : c.treated ? " · treated, recovering" : " · not treated yet"}
            </p>
          ))}
        </div>
      )}

      <h4>How they feel</h4>
      <div className="life-bars">
        <Bar icon="😊" label="Joy" value={life.emotions.joy} tone="gold" />
        <Bar icon="😢" label="Sadness" value={life.emotions.sadness} tone="blue" />
        <Bar icon="😠" label="Anger" value={life.emotions.anger} tone="coral" />
        <Bar icon="😨" label="Worry" value={life.emotions.fear} tone="coral" />
        <Bar icon="😰" label="Stress" value={citizen.stress} tone="coral" />
        <Bar icon="🫂" label="Loneliness" value={life.loneliness} tone="blue" />
        <Bar icon="💪" label="Fitness" value={life.fitness} tone="mint" />
      </div>

      {life.job ? (
        <div className="life-card">
          <span aria-hidden="true">💼</span>
          <div>
            <strong>{life.job.title} at {place(life.job.location_id)}</strong>
            <small>${life.job.hourly_wage}/hour · {life.job.workdays.map((d) => weekdayNames[d].slice(0, 3)).join(", ")} · {time(life.job.start)}–{time(life.job.end)}</small>
          </div>
        </div>
      ) : life.grade !== undefined ? (
        <div className="life-card">
          <span aria-hidden="true">📚</span>
          <div><strong>School grade: {gradeLetter(life.grade)}</strong><small>{Math.round(life.grade)}/100 · goes up with focus in class and library time, down when tired or stressed</small></div>
        </div>
      ) : citizen.age >= 65 ? (
        <div className="life-card"><span aria-hidden="true">🌅</span><div><strong>Retired</strong><small>Weekly pension, slower mornings</small></div></div>
      ) : null}

      {life.ambition && (
        <div className="life-card">
          <span aria-hidden="true">{life.ambition.achieved_day ? "🏆" : "🌟"}</span>
          <div>
            <strong>{life.ambition.goal}</strong>
            <meter className="gold" min={0} max={100} value={life.ambition.progress} aria-label="Ambition progress" />
            <small>{life.ambition.achieved_day ? `Achieved on day ${life.ambition.achieved_day}` : `${Math.round(life.ambition.progress)}% of the way there`}</small>
          </div>
        </div>
      )}

      <h4>Family & love</h4>
      {citizen.age >= 18 && (
        <p className="life-status">💞 {statusLabel[life.relationship_status]}{partner ? ` · ${partner.name}` : ""}</p>
      )}
      {family.length ? (
        <div className="family-grid">
          {family.map((person) => (
            <button key={person.citizen_id} onClick={() => onSelect(person.citizen_id)} title={`Open ${person.name}`}>
              <CitizenPortrait citizen={person} size={36} />
              <span><strong>{person.name.split(" ")[0]}</strong><small>{relationName(city, citizen, person) ?? "family"}</small></span>
            </button>
          ))}
        </div>
      ) : (
        <p className="muted-copy">No family living in Nakameguro.</p>
      )}
    </section>
  );
}
