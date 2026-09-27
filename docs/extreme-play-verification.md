# Relationship accounting and extreme-play verification

Verification date: 2026-09-27. This is a bounded regression/stress pass, not a claim that every possible AI interaction is correct.

## Changes

- Action effects and subsequent private AI reactions both contribute to the recorded conversation impact. History records actual clamped before/after values for all seven bond metrics.
- New conflicts, jealousy and repairs are no longer swallowed by the blanket relationship cooldown. Repeated evidence is suppressed; positive trust growth remains rate-limited.
- Friendship indexes are synchronized after actions. Dating/marriage is displayed separately from social closeness.
- Invalid actions, self-targets, unaffordable gifts, inconsistent partnerships and duplicate wedding proposals are rejected at execution.
- Late AI replies after pause/cancel cannot write memories or bonds. Latest task planning intent wins; closing a task twice is harmless.
- Malformed cognition is validated before journal writes. Backend private turns enforce finite bounded emotions, valid participants and nonblank speech. Public summaries do not repeat private task instructions.
- Invalid scenario money amounts are rejected; repeated incidents get distinct IDs. Appointment parsing handles midnight and rejects impossible times.

## Automated coverage

Run `npm test`, `npm run typecheck`, `npm run lint` and `npm run build` from `frontend/`. Run `.venv/bin/pytest -q` from `backend/`.

Result: 461 frontend tests and 172 backend tests passed. Typecheck, lint and production build passed. Backend emitted three existing deprecation warnings.

| Area | Coverage |
| --- | --- |
| Action catalog | All 21 actions; self/missing targets; age boundaries; low/high needs; exact romance thresholds; gift budgets; repeated proposals; 200 repetitions per physical action |
| Bonds | 300 conflict/repair iterations; finite 0-100 values; exact directional deltas; action plus dialogue totals; immediate friendship synchronization; repeated evidence |
| Conversations | Malformed payloads; interrupted and out-of-order replies; no partial memory writes; private memory isolation; six-turn limit; provider failure at each turn |
| Tasks | Overlapping planners; close/restart; duplicate closure; bounded goals, memories and event buffers |
| Scenarios | Every catalog entry; interruption and provider failure; non-finite money; same-tick fires and accidents |
| Elections | 26 ballots; invalid/duplicate ballots; retries; pending batch interruption; no premature tally; ties and abstentions |
| Other systems | Existing navigation, routines, weather, time, life, stories, speech cancellation and playback regression suites |

Tests use disposable in-memory storage. Backend tests disable credential/environment loading and external sockets. No saved-world scores are edited to make tests pass.

## Real AI browser check

Used a separate `127.0.0.1:3011` browser origin with local backend cognition (`gemini-3.5-flash-lite`), not the player's production save. Recorded initial directional values, then asked Ava to argue with Mateo through the normal action UI. The AI produced six spoken lines, including an apology and a follow-up discussion.

| Metric | Ava toward Mateo | Mateo toward Ava |
| --- | --- | --- |
| Trust | 42 -> 44 | 43 -> 45 |
| Warmth | 42 -> 36 after action -> 38 after dialogue | 43 -> 35 after action -> 37 after dialogue |
| Resentment | 0 -> 0 | 0 -> 10 after action -> 5 after dialogue |

The conversation impact, expanded explanation and Bonds network agreed. Recent changes showed separate action and conversation entries. At a 390 x 844 phone viewport, the history had vertical overflow available for scrolling and no horizontal document/panel overflow (390/390 and 389/389 pixels respectively).

## Limits

- Unit stress tests stub AI calls; the browser check is one real exchange, not an exhaustive provider soak or a full real-AI election.
- AI can apologize or de-escalate even when the player initiates conflict. Tests check faithful accounting, not a guaranteed hostile reply.
- Old history entries without original snapshots cannot be reconstructed truthfully. They retain their saved scores and say that change amounts were not recorded.
- A completed physical action remains recorded if the subsequent AI dialogue fails; no invented conversation is added.
- Browser-local storage remains bounded and is not a transactional multi-device database. Storage exhaustion, multi-tab concurrency and long-term production load need separate testing.
