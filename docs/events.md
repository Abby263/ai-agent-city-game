# Playable City Events

Student council is the first complete event with participation, competing agents,
private decisions, and a resolved outcome. The residents are students, so this is
a fictional school election, not a simulation of real-world political targeting.

## Follow What You Start: "Happening Now"

Anything you set in motion from **Create** or **Act** starts a *story*
(`frontend/src/lib/stories.ts`). The Create panel closes, the camera flies to the
people involved and their first reaction conversation plays immediately, without
waiting for Auto. The **Happening now** card on the map then collects each beat:

- the situation itself ("Kenji found $100 near Kokashita Arcade and kept it"),
- who goes to whom and why,
- every later conversation between the people in the story, quoted, with **Replay talk**,
- life news about them (an injury healing, a new couple, a police warning, an election result).

**Watch** moves the camera back to them. **All stories** (the News panel) lists every
running story with its full timeline. Stories stay open for 36 city hours (24 for
actions, 48 for elections); switch on **Auto** to see how the rest of town reacts.

## Run an Election

There is no separate Vote tab: an election is a situation like any other.

1. Open **Create** and pick two students under **Student-council election**.
2. Each candidate's Deep Agent writes its own platform; they appear in the story.
3. Each candidate walks to a resident of their choice and campaigns in a real
   conversation (two campaign talks, played as cutscenes).
4. Every student then votes privately and in parallel. A failed ballot counts as an
   abstention; a tie has no winner.
5. The winner (or tie) and the count appear in the story and in News. The clock is
   not stopped, so the town carries on.

Candidates can vote, including for themselves; one ballot per resident is enforced.
You can still talk to candidates yourself while they campaign by playing as a resident.

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
- `frontend/src/lib/stories.ts` and `frontend/src/components/game/StoryTracker.tsx`:
  the story timeline and the Happening now card; Create and News start and show them.

One event decision OR one campaign conversation is scheduled per eligible tick,
not one call per resident. Conversations retain their existing bounded turn budget.
The shell advances an election one step at a time, pausing while a cutscene plays;
all ballots are then decided in parallel. Vercel remains paused; no hosting change is required.

Exams and festivals still use the earlier simple event triggers. They are not yet
full participation quests. Further event types should add their own typed state,
agent decisions, public/private observations and outcome validation, rather than
reusing election ballots or pretending a single LLM summary completes an activity.
