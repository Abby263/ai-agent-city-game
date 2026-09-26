import type { Conversation } from "./types";

export type PlaybackConversation = Conversation & { replay?: boolean };

// Saved history is a baseline, not a backlog to perform again on every reload.
export function newExchanges(known: Set<string>, incoming: Conversation[]) {
  const added: Conversation[] = [];
  for (const conversation of incoming) {
    if (known.has(conversation.conversation_id)) continue;
    known.add(conversation.conversation_id);
    // The player's own chats play inline in the Talk panel, without moving the camera.
    if (conversation.transcript.length && !conversation.player_chat) added.push(conversation);
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
  /** The line being spoken, so the speaker's body language fits the words. */
  line?: string;
  lineKey?: string;
};

/** A player's own chat: the two face each other and talk where they stand; the camera stays put. */
export type InlineTalk = { actorIds: string[]; speakerId: string | null; line: string; key: string };

/** Shows real characters for escapes like "\\u2014" that sometimes slip through from the model. */
export const displayText = (text: string) => text.replace(/\\u([0-9a-fA-F]{4})/g, (_, hex: string) => String.fromCharCode(parseInt(hex, 16)));
