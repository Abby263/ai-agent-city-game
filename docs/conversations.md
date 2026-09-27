# Conversations, Voices And Body Language

## Talking As A Resident

- Play as anyone, open **Talk** and type. Your words are voiced in your character's voice straight away, the other
  person answers in their own words and voice, and the two of you face each other where you stand.
- The camera does not move after replies and the Talk panel stays open. Tap 👀 to frame the two of you; a new chat
  frames you once only if you are off-screen.
- Chats are continuous: up to ten recent lines between this pair at the current location (last two city hours)
  are recalled in chronological order, including when several exchanges share the same game minute.
  A back-and-forth shows as one thread in Talk.
- When a chat agrees on a day and time ("Friday around seven at the food court"), a **📅 Add to plans** button saves
  it as a real meet-up both residents remember.
- Sleeping residents don't answer. In live mode at night, a card suggests fast-forwarding instead.

## Memory And Multi-Turn Dialogue

- Earlier exchanges are explicitly background, separate from the active transcript. Each turn identifies the
  latest partner line, the speaker's previous line and the remaining turn budget. Changing subject should not
  reopen an old gift question or repeat an invitation already answered.
- Each resident receives only their own private experiences and feelings. Retrieval prioritizes experiences
  involving the current partner, deduplicates identical memories and limits the recalled experience window to six.
  Old thoughts, task payloads and accumulated transcript summaries are not re-injected as current dialogue.
- Listeners do not receive the initiator's private task instructions. They react to what was actually said.
  Remembered statements remain reports, not proof that an invitation or event happened.
- AI-led exchanges can use up to six spoken turns, with either resident able to end earlier. Player-led chat
  generates one reply and returns control to you. No extra critic-model call is needed for continuity.
- Action-driven exchanges retain their initiating context in Talk and cinematic playback. Existing browser
  history is preserved; these changes affect future replies, not past dialogue. Model errors remain possible.

## Voices

- **Natural voices (default):** Gemini TTS (`gemini-3.8-flash-lite-tts`, set with `GEMINI_TTS_MODEL`) through
  `POST /api/speech`. Each resident is cast a distinct prebuilt voice by sex and age band (young, adult, senior), and
  each line gets a short delivery tag such as `warm, excited, 14-year-old girl`. Longer spoken directions were being
  read aloud, so tags stay short. Stage directions like `*hugs Leo*` and emoji are never spoken. The next line is
  fetched while the current one plays. The endpoint caps text at 420 characters, caches up to 300 clips and allows
  40 requests a minute per visitor; failures fall back to device voices.
- **Device voices (fallback, or chosen in the conversation controls):** the browser's speech synthesis, with Apple's
  novelty and legacy voices (Bubbles, Zarvox, Bad News…) filtered out, a voice matching the resident's gender, and
  pitch and pace by age. Voice lists follow the Readium "web-speech-recommended-voices" project.

## Body Language

- The head is its own joint: it looks at whoever is speaking, nods while listening, tilts when curious and drops when
  sad. Eyes blink; eyebrows show anger, worry or surprise.
- The mouth follows the real audio level (Web Audio analyser for natural voices, word boundaries for device voices).
- Each line picks a gesture from the words, the feeling and the person: wave, explain, point, open hands, shrug, hands
  on hips, hand on heart, fists, fidget. Listeners cross their arms when angry and clasp their hands when worried.
- Idle people breathe and shift their weight. In cutscenes the pair stands about 1.5 m apart, faces each other and is
  "cheated" slightly toward the camera, and the camera eases toward the current speaker.
