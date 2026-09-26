import type { BondSnapshot, CitizenAgent, Conversation } from "@/lib/types";
import { bondMetrics } from "@/lib/social";

export function ConversationImpact({ conversation, citizens }: {
  conversation: Conversation;
  citizens: CitizenAgent[];
}) {
  if (!conversation.impacts?.length) return null;
  const name = (id: string) => citizens.find((c) => c.citizen_id === id)?.name.split(" ")[0] ?? "Resident";
  if (conversation.player_chat) {
    // In a live chat, a one-line feeling summary tucked away keeps the thread readable.
    const felt = conversation.impacts.filter((impact) => impact.status !== "not_assessed");
    if (!felt.length) return null;
    return <details className="exchange-impact compact-impact">
      <summary>{felt.map((impact) => `${name(impact.citizen_id)}: ${impact.mood_after}`).join(" · ")}</summary>
      {felt.map((impact) => <p key={impact.citizen_id}>{impact.reason}</p>)}
    </details>;
  }
  return <section className="exchange-impact" aria-label="Conversation impact">
    <h4>After this exchange</h4>
    {conversation.impacts.map((impact) => {
      const changes = (Object.keys(bondMetrics) as Array<keyof BondSnapshot>)
        .filter((key) => impact.before[key] !== impact.after[key]);
      return <div className="impact-person" key={impact.citizen_id}>
        <strong>{name(impact.citizen_id)} → {name(impact.other_citizen_id)}</strong>
        {impact.status === "not_assessed" ? <p>Feelings not assessed</p> : <>
          <div className="impact-mood">{impact.mood_before === impact.mood_after
            ? impact.mood_after : `${impact.mood_before} → ${impact.mood_after}`}</div>
          <div className="feeling-deltas">
            {changes.map((key) => {
              const delta = impact.after[key] - impact.before[key];
              return <span key={key} className={`feeling-${key}`} title={`${impact.before[key]} → ${impact.after[key]} / 100`}>
                {bondMetrics[key]} {delta > 0 ? "+" : ""}{delta} <small>({impact.before[key]} → {impact.after[key]})</small>
              </span>;
            })}
            {!changes.length && <span>Bonds unchanged</span>}
          </div>
          <details><summary>Why {name(impact.citizen_id)} feels this way</summary>
            <p>{impact.reason}</p>
            {impact.status === "cooldown" && <p>Bond scores held steady: changed within the last two city hours.</p>}
          </details>
        </>}
      </div>;
    })}
  </section>;
}
