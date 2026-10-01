# Player Control: Prompts, Free-Text Actions and What Happens Next

The player controls everything in Nakameguro. There is no fixed list of actions or choices:
every resident follows a prompt the player can rewrite, and anything the player writes can happen.

## Every resident's prompt

Open anyone's profile (or **Prompt** on their quick bar) to see their **character prompt**: the
exact description their AI follows in every conversation, social choice and vote. Until edited it
is written from their profile (`frontend/src/lib/character-prompt.ts`) and keeps up with their life.
Rewrite it and **Save**; from their next AI call they follow your version. **Reset to profile**
goes back. Edited prompts get the same safety checks as anything else the player types, in the
browser and again on the server.

On the server (`backend/app/cognition/deep_agents.py`) the prompt opens the resident's system
prompt (`system_prompt_for`), ahead of the fixed game and safety rules, which stay in force and
can be read under **Rules every resident also follows** (`GET /cognition/rules`). Each prompt
builds its own cached agent, so an edit takes effect immediately.

## Anything happens, in your words

- **Quick bar:** while playing as someone, tap anyone and write what you do ("ask for a loan",
  "slam my sketchbook on the counter").
- **Act** (on a profile): make anyone do anything, to someone or on their own.
- **Create → Make anything happen:** a situation nobody chose ("a water pipe bursts at the library").
- **What happens next:** after a scene, pick what a character wants to do, or write your own.

All four go through `sessionAct`. The game master (`POST /cognition/act`,
`backend/app/cognition/actions.py`) reads the words against the scene and returns who is involved,
where, the tone and intensity, any harm, money or relationship step, and whether a place must close.
Anything outside the scene is dropped rather than invented. `frontend/src/lib/acts.ts` applies
**capped** effects: feelings between the two, onlookers' judgement, injuries, money (only if the
giver has it), closures, memories and news. Then the people involved react in their own words.

A relationship step (a date, an engagement or marriage, moving in) happens only if the person asked
says yes in that reaction; a breakup needs no one's permission. Romance between relatives is refused.
The person asked is told a question is waiting for them (`proposal` on `/cognition/session`), so an
action like "*takes his hand and asks him to be her boyfriend*" gets a real yes or no, and the game
reads their answer from `invitation_response`. The answer is still theirs: a stranger says no.

The resident you play has two sides to every bond too. The AI never judges how you feel, but a
conversation that went well for the other person raises your trust and warmth with them as well
(and a hostile one lowers them), so friendships and romances can grow both ways while your feelings
(affection, admiration and the rest) stay yours.
The game master only refuses sexually explicit content, graphic gore, real-world harm or hate.

## Livelier residents

- **Real reasons to talk.** When a resident decides whether to approach someone, they see who each
  nearby person is to them ("your mother, close friends"), what they remember of them, and what is
  on their mind. Small talk about the weather is not a reason; they keep to themselves instead, and
  wanting someone who isn't there just waits until they meet.
- **News travels.** Residents may pass on what they heard to people it concerns, and decide for
  themselves whether to keep a confidence.
- **Plans are kept.** A time and place agreed out loud ("ramen at the station shop around six" /
  "See you there!", "six-thirty", "half past six") becomes a real meeting, even if the model didn't
  flag it (`agreedPlan`). "Morning, Mateo!" is a greeting, not a morning plan.
- **Your plans too.** When it's time, the resident you play sets off for a plan they agreed to, like
  everyone else (once: pick another place in **Go to…** and you can still stand someone up). Talking
  with them around the agreed time marks the plan kept, even if you found each other somewhere else;
  otherwise it is missed. Plans settle this way in Manual too. **Go to…** waits for a town moment in
  progress instead of being ignored.
- **Tasks that involve you.** Ask a resident to go somewhere *with* the person you play and they
  head there on their own (the AI never agrees for you); you choose whether to join. A resident
  waiting on you says "Waiting to talk it over" rather than claiming their AI failed, and any
  blocked task can be cancelled from their profile.
- **Intentions.** Every conversation turn can say what the speaker now wants to do; these become the
  "what happens next" choices.

## The storyteller and story pace

A world opens as a running show: Auto, **Story** pace and the clock running (once per world, so choosing
Manual, Live time or a pause afterwards sticks). At Story pace a game hour takes about 16 seconds, the night
(22:30 to 06:30) passes in about 8, and a scene on screen holds the clock, so time slows exactly when something
happens. 2x and 4x are faster; **Live** follows real Tokyo time as before. Hiding the tab pauses the town; it
carries on by itself when you come back.

The storyteller (`frontend/src/lib/storyteller.ts`) runs nine interlocking storylines (a secret song, a widower
and the librarian, a hidden manga, a cafe for sale, a heart condition, a job in Osaka, stolen credit, a broken
promise, a conservatory audition). Each plants private secrets and feelings once, then plays out in three or four
scenes. In the waking day (07:30 to 22:00), at most every 40 game minutes, the director picks the storyline that
has waited longest, sends one person to find the other and plays the scene straight away (one AI call, no
separate "should I talk?" call), telling the scene's writer what's at stake and not to smooth it over. A
storyline's proposal is a real question: a yes starts dating, a no is a no. The resident you play is never pushed
into a scene. Every four game hours a town incident (the shrine festival, a power cut, a lost cat...) gives
everyone something to talk about. A full game day has about 18 storyline scenes and 36 conversations in all.

## The fixer: cases, nudges and outcomes

The player has a role: the neighbourhood's fixer. Every storyline is a **case** with a goal ("Get Ren and Aoi on a
date"), a brief (what the player knows that the residents don't) and two endings (`storyteller.ts`: `goal`,
`brief`, `well`, `badly`).

- **Three cases at a time.** Cases open in `CASE_ORDER`, strongest hook first; when one closes the next opens. The
  director only stages scenes from open cases. A new world opens at breakfast on its first case, and ordinary small
  talk waits until that scene has played.
- **Nudges.** The player's lever is a quiet word with one of the two people in a case's *next* scene
  (`sessionNudge`): a suggested line or their own words. It becomes a memory for that resident and is handed to them
  privately when the scene is written; the other person never sees it. Three nudges a day (`NUDGES_PER_DAY`);
  making something happen from "What happens next?" costs one too. The clock holds while the player chooses words.
- **How scenes are judged.** Each scene is `well`, `badly` or `mixed`, from what the residents themselves report
  (`relationship_effect`). A case closes on its last scene: a proposal's yes or no decides it, otherwise the last
  scene, with earlier scenes breaking a tie (`caseOutcome`). Last scenes are told to land somewhere: nobody puts
  the conversation off until later.
- **On screen.** `CaseBoard` (the desk, top left) shows goals, a dot per scene, what's coming up and the nudge
  buttons; `CaseResult` shows how a case ended and the next case; the welcome is one sentence and the first case.
  When every case is closed the player gets a rank and can start a new season (`resetSession`).

Tests: `frontend/tests/cases.test.ts`.

## Scenes, sound and sharing

- Subtitles are a lower-third strip, so the scene keeps the screen. Speakers are framed over the listener's
  shoulder (shot and reverse shot); two-shots start at eye level.
- People talk with their forearms (`armPose` returns elbow bends), keep time with their voice, and listeners react
  to what they hear (`reactionTo`).
- Voices are on from the start using the device's own voices (free); natural AI voices remain a choice because each
  line costs a model call. The town has its own synthesised sound and a quiet score (`ambience.ts`, no audio
  files), ducked while people talk; one button in the header mutes it.
- Any scene, and any closed case, can be shared as a picture: the frame from the town, the lines and the link
  (`share.ts`).

## Telling residents apart

The bodies share a small set of CC0 outfits, so `wardrobe.ts` gives every resident their own outfit colours (top
above the waist, bottom below, recoloured in the shader), one signature accessory built from simple shapes and hung
on the skeleton (a guitar case, a police cap, a konbini apron, a cane), and their own bearing (cadence, stride,
arm swing, stoop).

## A lived-in street

`props.ts` adds what makes a Tokyo street: painted shop interiors behind the glass, lit from inside at night,
projecting signs, banner flags, paper lanterns, vending machines, bicycles, potted plants and post boxes. Anything
registered with `Art.glow` brightens after dark; windows are a mix of warm, dark and cool rooms; shopfronts spill
light onto the pavement.

## Opening flight

The flight starts at once on a plain blue planet; the Blue Marble photograph lands on it when it has loaded, so the
first frame is never a black screen.

Opening the game starts in space: the Earth (NASA Blue Marble imagery) turns to Japan, dives towards Tokyo and
through the clouds, and the town camera finishes the descent onto Nakameguro (about 7 seconds;
`EarthIntro.tsx`, `CityRenderer.introDescent`). **Skip** jumps straight in, and it is skipped for players who
prefer reduced motion.

## Street view

**Street** (next to Explore and Follow on the map) puts you in the street at eye level, like Google Street View:
drag to look around, click the street to walk there, use the arrow keys or WASD (or the on-screen arrows), scroll
to zoom, pick **Go to…** to stand in front of any place, and press Esc or **Exit** to return to the overview.
Movement stays on walkable ground; residents keep living around you and can be clicked as usual
(`frontend/src/game/three/street-view.ts`).

Street view is also how you follow the drama. When a scene starts, a **🎬 marker** shows who is talking and how
far away they are, floating over them or pinned to the screen edge with an arrow; click it to go there. You only
hear a conversation within about 24 m: from further away the subtitles say you're too far to hear (with **Go
there**), and up close each line also floats over the speaker's head as a speech bubble. Scenes can always be
replayed in full from Talk. There is no depth-of-field blur in street view.

The town is built at true scale for this (one unit is about 2 m): people about 0.85 units tall, Japanese houses
with tiled gable roofs, gutters, balconies and storm-shutter boxes, glass-fronted shops, apartment blocks with
balcony grids, a curtain-wall office tower and concrete public buildings (`architecture.ts`); real instanced trees
grown with EZ-Tree (zelkova, cherry in blossom, oak and pine, `trees.ts`); and concrete utility poles with
sagging overhead wires along the roads (`streetscape.ts`).

## Reliability and speed

- Dialogue uses minimal model thinking (`GEMINI_THINKING_LEVEL`, default `minimal`), and a reply
  slower than `HEDGE_AFTER_SECONDS` (default 6) is requested again in parallel; the first answer wins.
  Most lines take one or two seconds instead of occasional 20-second stalls.
- One failed or slow conversation no longer pauses Auto: it is dropped and the town carries on.
  Auto pauses after three failures in a row, or at once for a missing key or an exhausted quota.
- While you chat as a resident, other scenes wait in the queue and Auto starts no new AI work,
  so your words are never cut off or stuck behind the town.
- Resizing redraws the town at once, so a paused view never shows a blank green stage; the chat
  camera swings to an angle no building blocks.
