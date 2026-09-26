# Playable City Events

Student council is the first complete event with participation, competing agents,
private decisions, and a resolved outcome. The residents are students, so this is
a fictional school election, not a simulation of real-world political targeting.

## Play an Election

1. Open **Events** in the right navigation.
2. Choose the character to play, an opposing candidate, and write your platform.
3. Select **Enter & start campaigning**. The rival's Deep Agent drafts its own
   platform. You control your candidate's spoken words; the rival acts in Auto.
4. Use the voter list to meet residents. At the same location, open **Talk** and
   ask what matters to them, explain your ideas, answer questions, and make promises.
   Pause the clock whenever you need time to think or talk.
5. Campaigning lasts 32 ticks (eight city hours). **Open ballots early** ends it
   immediately and pauses the world for voting. Auto opens voting at the deadline.
6. Cast the ballot of the character you currently control. Other residents vote
   automatically while Auto is running, or one at a time with **Next AI ballot**.
7. Results appear only when every resident has voted or abstained. Inspect
   **Residents' decisions** for the agents' explanations. A tie has no winner.

You can switch characters or return to observer using Citizens. Switching changes
which character is player-controlled, not which ballots have already been cast.
Candidates can vote, including for themselves; one ballot per resident is enforced.
The player cannot overwrite a ballot after it is sealed.

## Agent Decisions and Game Rules

`POST /cognition/election` invokes a LangGraph Deep Agent with one of three purposes:

- `platform`: invent a candidate's own realistic proposal from their persona.
- `campaign`: choose an eligible resident and a conversational intention.
- `vote`: choose one registered candidate or abstain, and explain privately why.

The chosen Gemini/OpenAI provider is used. No provider key or model failure means
no fabricated platform, conversation, or vote. A failed ballot pauses the event and
can be retried without replacing earlier ballots. A pause, cancellation, or control
change invalidates an in-flight response using the saved world's revision.

Movement, phase deadlines, ballot validation, counting and ties are deterministic
game rules. Speech, emotions, campaign plans and voting decisions are agent outputs.
There is no `highest friendship score wins` rule. Conversations continue to update
the same private journals and directional feelings used elsewhere in the game.

An AI candidate physically approaches its chosen resident before conversing. When
it approaches a player-controlled character, the player retains their own voice.
The approach is recorded and the rival can continue campaigning instead of inventing
a reply. The player can speak with the rival through Talk when they meet.

## Privacy and Persistence

Platforms are public notices. Every voter receives its own persona, memories and
feelings plus the public platforms. Other ballots, other citizens' private memories,
and a running tally are never included in the decision prompt. Residents can be
uncertain and can change their mind; model explanations are fictional assessments,
not a guarantee of rational or perfectly grounded behavior.

Ballots are hidden in the UI until results. The observer can inspect them afterward;
other agents only receive the public winner or tie. This is an observer-mode game,
not a cryptographically secure voting system. State is browser-local, exportable
with the world snapshot, and not synchronized across devices. The last five events
are retained. Current event participation is available in browser-local mode only.

## Runtime and Extension Points

- `frontend/src/lib/elections.ts`: typed event state, public notices, ballot
  validation and pure tallying.
- `frontend/src/lib/session-simulation.ts`: transactional session integration,
  campaign travel, cognition scheduling, private memories and result publication.
- `backend/app/cognition/elections.py`: purpose-specific prompt boundary and
  structured response validation.
- `backend/app/cognition/deep_agents.py`: citizen-owned, provider-configured agents
  and private memory tools, also used by the dialogue system.
- `frontend/src/components/game/CityEventsPanel.tsx`: participation, campaign
  progress, voting and results.

One event decision OR one campaign conversation is scheduled per eligible tick,
not one call per resident. Conversations retain their existing bounded turn budget.
Voting resolves one resident per tick/request so failures are visible and retryable.
The game pauses after results. Vercel remains paused; no hosting change is required.

Exams and festivals still use the earlier simple event triggers. They are not yet
full participation quests. Further event types should add their own typed state,
agent decisions, public/private observations and outcome validation, rather than
reusing election ballots or pretending a single LLM summary completes an activity.
