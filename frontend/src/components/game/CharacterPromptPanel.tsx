"use client";

import { useState } from "react";
import { RotateCcw, Save } from "lucide-react";
import { api, cognitionRules } from "@/lib/api";
import { characterPrompt, defaultCharacterPrompt, MAX_PROMPT, promptEdited } from "@/lib/character-prompt";
import { checkPlayerText } from "@/lib/safety";
import type { CitizenAgent, CityState } from "@/lib/types";

/** The resident's character prompt: exactly what their AI follows, readable and editable by the player. */
export function CharacterPromptPanel({ citizen, busy, act, onMessage }: {
  citizen: CitizenAgent;
  busy: boolean;
  act: (action: () => Promise<CityState>) => Promise<unknown>;
  onMessage: (text: string) => void;
}) {
  const current = characterPrompt(citizen);
  const edited = promptEdited(citizen);
  const [draft, setDraft] = useState(current);
  const [rules, setRules] = useState<string | null>(null);
  const first = citizen.name.split(" ")[0];
  const changed = draft.trim() !== current.trim();

  const save = () => {
    const text = draft.trim();
    if (!text) return;
    const safety = checkPlayerText(text);
    if (!safety.ok) { onMessage(safety.message); return; }
    void act(() => api.setCharacterPrompt(citizen.citizen_id, text)).then(() => onMessage(`${first}'s prompt is saved. It takes effect from their next conversation or decision.`));
  };
  const reset = () => void act(() => api.setCharacterPrompt(citizen.citizen_id, null)).then(() => {
    setDraft(defaultCharacterPrompt(citizen));
    onMessage(`${first}'s prompt is back to their profile.`);
  });
  const loadRules = () => {
    if (rules !== null) return;
    cognitionRules().then((r) => setRules(`${r.game_rules}\n\n${r.safety_rules}`)).catch(() => setRules("The rules could not be loaded right now."));
  };

  return (
    <div className="prompt-panel">
      <p className="muted-copy">
        This is {first}&apos;s character prompt: how they think, talk and decide. Their AI follows it in every conversation, choice and vote.
        Rewrite anything; it takes effect from their next conversation.
      </p>
      <label className="prompt-label">
        <span>{edited ? "Your version" : "Written from their profile"}{edited && <em>Edited</em>}</span>
        <textarea value={draft} maxLength={MAX_PROMPT} rows={12} onChange={(e) => setDraft(e.target.value)} aria-label={`${first}'s character prompt`} />
        <small>{draft.length} / {MAX_PROMPT}</small>
      </label>
      <div className="prompt-actions">
        <button className="primary-action" disabled={busy || !changed || !draft.trim()} onClick={save}><Save size={15} /> Save prompt</button>
        {edited && <button className="outline-action" disabled={busy} onClick={reset}><RotateCcw size={15} /> Reset to profile</button>}
        {changed && <button className="text-action" onClick={() => setDraft(current)}>Undo changes</button>}
      </div>
      <details className="prompt-rules" onToggle={(e) => (e.currentTarget as HTMLDetailsElement).open && loadRules()}>
        <summary>Rules every resident also follows</summary>
        <p>{rules ?? "Loading…"}</p>
      </details>
    </div>
  );
}
