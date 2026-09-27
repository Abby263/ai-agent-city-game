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
  with them there, around the agreed time, marks the plan kept; otherwise it is missed. **Go to…**
  waits for a town moment in progress instead of being ignored.
- **Intentions.** Every conversation turn can say what the speaker now wants to do; these become the
  "what happens next" choices.

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
