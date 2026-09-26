# AgentCity Autonomy Model

AgentCity should feel like a city of people, not a dashboard of bots.

The current implementation uses LangGraph + Deep Agents as the agent workflow
layer and the configured Gemini or OpenAI model for citizen planning,
conversation, reflection, and memory writing. The local game engine does not
decide what a person should say or who they should talk to for a player task; it
advances city time, moves sprites, records memory, and validates that the AI
produced a real exchange before the task is marked complete.

The design borrows the useful ideas from Hermes Agent, LangGraph, and Deep Agents:

- persistent memory that compounds over time
- recall of past conversations and social history
- autonomous reflection and planning
- a planner/orchestrator step before a citizen acts
- worker-style citizen agents that report results back through the game state
- subagents as a scalable path for city-wide institutions

Hermes Agent reference: https://github.com/nousresearch/hermes-agent
Deep Agents reference: https://reference.langchain.com/python/deepagents/

## In-Game Loop

Every playable tick:

1. The engine advances city time, sprite movement, location state, and visible events.
2. The orchestrator creates observations for any active task or autonomous social moment.
3. The LLM task planner decides the citizen's target citizens, location, and visible plan.
4. LangGraph runs private exchange nodes: actor turn, target reply, actor follow-up.
5. Each node invokes the current citizen's cached Deep Agent graph with a structured private-turn response contract.
6. Each Deep Agent has turn tools for inspecting its own private memory, inspecting the exact active task, and choosing high-level city actions.
7. Each private turn receives only that citizen's private memory plus the public transcript so far.
8. The structured output contract returns the turn, spoken line, memory, reflection, and mood.
9. The engine validates required conversations before closing the task.
10. Conversations write separate memories for each participant.
11. Relationship scores evolve from stranger to acquaintance to friend to trusted friend.
12. The UI streams visible thoughts, conversations, memory updates, and relationship context.

## Memory Boundary

Each citizen has private runtime memory. A citizen can learn a fact only from:

- their own seed/persona memory
- memories written after their own actions
- words spoken to them in a conversation
- public city events visible to everyone

The orchestrator can route a task, but it must not leak one citizen's private
memory into another citizen's prompt. If Ava asks Mateo whether he was invited to
dinner, Mateo answers from Mateo's memory only. If Mateo has not heard about an
invitation, the correct human answer is uncertainty, not a hallucinated yes.

## Auto Mode

Auto Mode is the playable version of the autonomy loop. It starts the city and keeps ticks flowing while the player observes.

In Auto Mode, citizens do not need direct player commands to talk. In the default
browser world, one eligible resident considers a social opportunity, with decisions
spaced at least 45 city minutes apart. The resident's Deep Agent receives only
their own memories and nearby people's public activities. It chooses whom to
approach, why, and what to discuss, or chooses time alone. Familiarity is not
required, but shared history cannot be invented. The budget rotates who gets a
decision, never who they must befriend. Physical eligibility excludes travelers,
sleepers, exhausted residents, player control and active tasks.
An approach is saved first; dialogue only happens on a later tick after both
people are available together. Someone leaving can interrupt the encounter.
An autonomous exchange has up to four spoken turns, each with a bounded Deep Agent model-call budget.
Adding residents does not add a model call for every resident on every tick.

Residents can explicitly propose a future meeting during a conversation. Only
the other resident accepting the same time and public place creates a shared
appointment. Proposals alone, refusals and invalid or conflicting plans do not.
Accepted plans appear in **City > Plans between people**, enter both private
journals, and guide travel in Auto. Travel lead time depends on distance. Tasks,
urgent needs and player control take precedence; missed meetings are remembered
without inventing why the other person failed to attend. Meetings currently
support two residents, within the next city day, with a one-hour arrival window.

## Following Feelings

Select **Auto**, then **Bonds** in the right navigation. **Recent changes** shows
who feels differently toward whom, when, the numerical change, and the resident's
explanation. **Read the exchange** opens and highlights the conversation behind it.
**All bonds** shows current values and history; **Perspective** filters the owner
of the feelings. The arrow is directional: Ava's affection for Leo is not Leo's
affection for Ava. Turn off **Changes only** to include unchanged encounters.

The four tracked feelings are affection (platonic care), admiration, jealousy,
and resentment. These students are minors: there is no sexual content, forced
romance, or automatic "love" from greetings. Resentment tracks hurt and dislike
without declaring someone hateful based on one remark. Mixed feelings and repair
are possible. The values are fictional game state, not psychological measurements.

Each speaker's Deep Agent returns its own mood and evidence-backed feeling deltas.
Only that speaker receives their prior feelings in private memory context. The
observer can inspect both perspectives, but the other agent cannot read them.
No additional LLM request is used solely to populate this view.

Feeling changes are bounded to +/-8 per eligible exchange, clamped to 0-100, and
require a reason. A two-game-hour per-pair cooldown prevents repeated greetings
from farming scores. Values begin at zero (no recorded feeling), and old exchanges
are not retroactively assigned emotions. Nothing forces jealousy or conflict to occur.

This emotional ledger currently belongs to the default browser-local world, like
its journals and conversations; optional server-memory mode does not persist these
new feeling dimensions. Histories retain 40 entries per direction and the Talk feed
retains 80 conversations. Older evidence links are disabled when the transcript expires.
Refresh preserves the saved world and adds newly enabled YAML residents without
clearing existing citizens' memories. A world snapshot exports the emotional ledger too.

## Relationship Development

### Seeing Conversation Impact

Selecting **Auto** starts the world and leaves the city in view; it does not require a
second press of Play. The play/pause icon then pauses or resumes the running
world. Hidden tabs pause to avoid unattended model usage.

Auto checks for its first eligible encounter on the next tick, then spaces
attempts at least 45 city minutes apart. While the request is pending, Talk
shows the participants and elapsed generation time. Autonomous exchanges
allow up to four independently generated turns, including follow-ups, without
player-task keyword retries. Task-driven exchanges retain their six-turn cap.
Provider errors or timeouts appear in Talk and pause Auto instead of silently
retrying. **Resume Auto** acknowledges the failure; no failed reply is fabricated.

### On-Map Conversation Playback

Newly completed exchanges enter a transient playback queue. The 3D residents
walk to a shared, walkable meeting spot and face one another before subtitles
begin. The camera frames the pair; a mint nameplate and gesture identify the
current speaker. During dialogue, only the two participants are rendered; other
residents remain in game state and return when the scene ends. A closer camera,
subtle depth blur, place/time title and full-width subtitle strip frame the scene.
New Auto encounters first show why they met, distinguishing chance encounters
from kept appointments. Old conversations without that evidence are not backfilled.
Each original transcript line is shown in order with bounded
reading time, independent of city speed. Pause, next, skip, and refocus controls
are available in the subtitle panel. Opening another panel is still possible;
new scenes initially close it to keep the speakers visible on mobile.

Simulation ticks wait while a scene is queued or playing, so Auto cannot run
ahead or spend more model calls while the player is reading. Hiding the page
pauses subtitle playback and the city. Skipping removes only the presentation;
the transcript and memories remain in Talk. Existing history is not replayed
when a page loads. Camera position is restored at the end of the scene.

This is paced playback of committed LLM dialogue, not token streaming.
The speaker button in a scene enables browser-provided speech for the actual
transcript. Voice identity, pitch and pace are stable per resident on that device;
local English voices are preferred when available. Availability and quality vary
by browser and operating system. These are synthetic voices, not cloned people.
Speech adds no AgentCity server requests or model calls. Some browser-provided
voices may use their vendor's online speech service.

Subtitles wait until the complete line finishes speaking. Mute returns to timed
subtitles. Pause cancels speech; resume restarts the interrupted line, avoiding
unreliable suspended speech queues on mobile. Next, skip, scene teardown and
hiding the tab cancel outstanding speech. Voice failures visibly fall back to
subtitles rather than blocking the city. A fresh page load requires an explicit
speaker-button opt-in; later scenes in the same page keep the setting. Volume
changes are applied to the active utterance and subsequent speech chunks (some
engines apply changes only to the next chunk).

Memory and emotional assessments commit with the full exchange, not
with each subtitle. Playback changes no character decisions and adds no LLM
calls. Talk remains the chronological historical record.
Its play icon explicitly replays a saved exchange in the city, labelled Replay,
without creating another conversation, memory, or relationship change.

New completed exchanges in **Talk** include an **After this exchange** section.
Each direction has an immutable before/after snapshot of trust, warmth,
familiarity, affection, admiration, jealousy and resentment, plus the speaker's
mood and their own explanation. Only actual applied deltas are displayed:
clamping and the two-city-hour cooldown may leave scores unchanged even when
the agent reports an emotional reaction. These updates appear when the full
exchange commits, not as token-level or per-line streaming.

The player controls their own voice. No AI feeling is invented for the
player-controlled speaker; that direction is marked unassessed. Older exchanges
without snapshots are not backfilled from today's scores. These views add no
LLM calls.

**Bonds > Social map** groups residents by connected mutual friendships.
Colors represent those circles, not personality categories. An overview shows
a strongest-connection spanning forest to avoid overlapping all possible links;
its numbers are two-way averages. Dashed edges represent witnessed connections
that are not mutual friendships. Selecting a resident shows all their outgoing
scores with arrows; selecting another shows both directions separately. The
feeling selector changes the displayed metric. Recent changes remain available
as a separate chronological view.

### Individual Nature

Each active citizen YAML has a `personality.nature` section containing traits,
values, voice, sensitivities and a conflict-repair style. Their **Life** view
shows these under **At heart**. Conversation and election prompts receive only
the acting resident's own nature and private experience. Nature guides the LLM,
but does not mechanically dictate emotions, speech or votes.

On load, profile-owned nature updates merge into existing browser saves without
resetting learned memories, tasks, current mood, relationships or time.
The browser-local mode retains private perspectives at prompt boundaries, not
encrypted storage: a player inspecting their own browser can see the save.

A new bond starts without recorded shared experiences. Encounters can increase:

- familiarity
- warmth
- trust

When those values pass thresholds, the relationship becomes:

- Acquaintance
- Friend
- Trusted friend

Trust and warmth only grow when a speaker reports a supported positive exchange;
routine greetings are neutral. Hurt can reduce trust. Each participant's transcript
memory and emotional history are saved separately in browser-local storage, allowing
later conversations to draw on their own experience. Browser data is not a cross-device database.

## Future Hermes-Style Extensions

Good next steps:

- Deep Agents subagents for school, hospital, bank, mayor office, and emergency response
- citizen self-improvement journals that become retrievable memories
- profession-specific learned skills and tools
- nightly memory consolidation from session memory into durable storage
- autonomous city institutions, such as hospital, school, bank, and mayor agents
- background scheduled simulation jobs
- subagent delegation for major city crises
