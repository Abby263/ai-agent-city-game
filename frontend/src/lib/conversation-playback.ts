import type { Conversation } from "./types";

export type PlaybackConversation = Conversation & { replay?: boolean };

// Saved history is a baseline, not a backlog to perform again on every reload.
export function newExchanges(known: Set<string>, incoming: Conversation[]) {
  const added: Conversation[] = [];
  for (const conversation of incoming) {
    if (known.has(conversation.conversation_id)) continue;
    known.add(conversation.conversation_id);
    if (conversation.transcript.length) added.push(conversation);
  }
  return added.sort((a, b) => a.game_day - b.game_day || a.game_minute - b.game_minute);
}

export function subtitleDuration(text: string) {
  return Math.max(4000, Math.min(18000, 1500 + text.trim().split(/\s+/u).length * 360));
}

export type ConversationFrame = {
  id: string;
  actorIds: string[];
  locationId: string | null;
  speakerId: string | null;
  paused: boolean;
  phase: "arrival" | "establishing" | "dialogue";
};
