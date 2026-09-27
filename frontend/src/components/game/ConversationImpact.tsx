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
    const felt = conversation.impacts.filter((impact) => impact.status !== "not_assessed" || Object.keys(bondMetrics).some((key) => impact.before[key as keyof BondSnapshot] !== impact.after[key as keyof BondSnapshot]));
    if (!felt.length) return null;
    return <details className="exchange-impact compact-impact">
      <summary>{felt.map((impact) => `${name(impact.citizen_id)}: ${impact.mood_after}`).join(" · ")}</summary>
      {felt.map((impact) => <div key={impact.citizen_id}>
        <strong>{name(impact.citizen_id)} → {name(impact.other_citizen_id)}</strong>
        <p>{impact.reason}</p>
        {(Object.keys(bondMetrics) as Array<keyof BondSnapshot>).filter((key) => impact.before[key] !== impact.after[key]).map((key) =>
          <p key={key}>{bondMetrics[key]}: {impact.before[key]} → {impact.after[key]}</p>)}
      </div>)}
    </details>;
  }
  return <section className="exchange-impact" aria-label="Conversation impact">
    <h4>After this exchange</h4>
    {conversation.impacts.map((impact) => {
      const changes = (Object.keys(bondMetrics) as Array<keyof BondSnapshot>)
        .filter((key) => impact.before[key] !== impact.after[key]);
      return <div className="impact-person" key={impact.citizen_id}>
        <strong>{name(impact.citizen_id)} → {name(impact.other_citizen_id)}</strong>
        {impact.status === "not_assessed" && <p>Private feelings not assessed</p>}
        <>
          <div className="impact-mood">{impact.mood_before === impact.mood_after
            ? impact.mood_after : `${impact.mood_before} → ${impact.mood_after}`}</div>
          <div className="feeling-deltas">
            {changes.map((key) => {
              const delta = impact.after[key] - impact.before[key];
              return <span key={key} className={`feeling-${key}`} title={`${impact.before[key]} → ${impact.after[key]} / 100`}>
                {bondMetrics[key]} {delta > 0 ? "+" : ""}{delta} <small>({impact.before[key]} → {impact.after[key]})</small>
              </span>;
            })}
            {!changes.length && <span>No net score change</span>}
          </div>
          <details><summary>Why {name(impact.citizen_id)} feels this way</summary>
            <p>{impact.reason}</p>
            {impact.action_after && <div>
              <p>Before → after action → after conversation</p>
              {(Object.keys(bondMetrics) as Array<keyof BondSnapshot>).filter((key) => impact.before[key] !== impact.action_after![key] || impact.action_after![key] !== impact.after[key]).map((key) =>
                <p key={key}>{bondMetrics[key]}: {impact.before[key]} → {impact.action_after![key]} → {impact.after[key]}</p>)}
            </div>}
            {impact.status === "cooldown" && <p>Positive trust growth is limited for two city hours. New emotional reactions still apply.</p>}
            {impact.status === "repeated" && <p>This repeats recent evidence; scores were not awarded twice.</p>}
          </details>
        </>
      </div>;
    })}
  </section>;
}
