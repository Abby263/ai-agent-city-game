# Releasing Nakameguro For Everyone

The current cast is entirely 18+. This document retains the safeguards and release gates for a game that may be played by families; an adult cast is not a child-safety certification.

## In Place

- **Player text checks** (`frontend/src/lib/safety.ts`, mirrored in `backend/app/safety.py`). Speech, tasks and election platforms are checked in the browser before any AI request, and again by the API, so a modified client cannot skip them. Blocked: phone numbers, emails, street addresses, passwords, links and common profanity or slurs, including simple disguises such as `sh1t` or `f.u.c.k`. Messages about self-harm are not sent to the AI; the player is pointed to a parent, teacher or other trusted adult.
- **Citizen-safety prompt rules** (`CITIZEN_SAFETY_RULES`). Appended to every Deep Agent and structured model call: adult characters with non-explicit romance and non-graphic conflict, privacy boundaries, and no invented pregnancies or births. Child protections remain conditional safeguards if minors return. These prompts are not a substitute for output moderation.
- **Onboarding** reminds players that citizens are AI characters and that real personal details must never be shared.
- **Readability.** Interface text is at least 11px.

## Required Before Public Release

1. **Provider moderation on model output.** The pattern checks cover player input only. Run each generated line through the provider's moderation endpoint (or an equivalent classifier) and replace flagged lines before they are saved or spoken.
2. **Stronger input moderation.** Word lists miss context and new slang. Add a moderation API call for player text and keep the local check as a fast first pass.
3. **Privacy law review.** Players under 13 bring COPPA (US), and the GDPR age of digital consent (13-16 in the EU/UK) plus the UK Age Appropriate Design Code apply. Minimise data, publish a child-friendly privacy notice, and get verifiable parental consent where required. The current local-first design, which stores worlds in browser storage with no accounts, helps.
4. **Hosting controls from the README release gates:** per-world ownership, server-enforced request and token quotas, and saves with import/recovery.
5. **Parent information page** explaining what the AI does, what is stored and how to report a problem, plus an in-game report button on conversations.
6. **Playtests with the target age group** covering reading level, how long it takes to reach the first badge, and whether the city is understandable without the guide.
