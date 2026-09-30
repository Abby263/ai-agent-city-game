# Character visual review

## Verified locally

- Free-art pass: imported CC0 MPFB models for Aoi, Ren and Sota. Replayed Aoi/Ren
  and Ren/Sota exchanges; textured bodies, clothing, hair, gestures and both speakers
  render. The closer camera was checked at 1440x900 and 390x844 with no horizontal
  overflow. This pass replayed history; it did not test new LLM generation.
- Asset preflight, 355 frontend tests, lint, typecheck and a webpack production build
  pass. The three models are approximately 0.93-1.11 MB each. Physical-phone frame
  rate and memory use are not yet benchmarked.

- Played the revised cast at 1440x900 and 390x844. Resident selection, player control, the city canvas,
  and a two-person conversation rendered. Ren offered Sota coffee; the AI reply mentioned his
  apprenticeship and asked a follow-up question. This was a real backend reply, not a mocked transcript.
- The local API was initially stopped: Auto and messages failed until it was started. Both servers
  must run for a local playtest. A separate temporary database was used; no local history was deployed.
- Updated all 26 active profiles to Japanese adults, keeping IDs, families, professions and personalities.
  Existing saves retain historical wording rather than rewriting private journals or relationship scores.
- Replaced the mixed anime/placeholder portrait set with one profile-driven illustrated style. The map
  fallback now has adult proportions, smooth faces, articulated knees/elbows, individual hair, glasses,
  aprons, jackets and coats. It is still procedural art, not a realistic MetaHuman.
- Removed floating nameplates during dialogue so they do not collide with the phone location caption.
- Fixed deployment staging to include the MetaHuman manifest and added build-time asset validation.
- Tested rig normalization, hidden helper meshes, separate eyelash morphs and incomplete rig fallback
  with synthetic fixtures. **No real MetaHuman was available to visually validate.**

## What prevents state-of-the-art visuals

The manifest now includes three textured CC0 MPFB residents: Aoi, Ren and Sota.
See [the open character art workflow](open-character-art.md) for reproducible exports.
The other 23 residents still use procedural bodies.
The setting also still uses simplified buildings, foliage and props, so a realistic person alone will
not produce a consistent cinematic scene. The current procedural walk and amplitude-driven mouth are
not production facial/body animation.

## Next production milestones

1. **Approve the first three residents:** refine the CC0 MPFB exports, or author a replacement using
   [the MetaHuman guide](metahuman-characters.md). Approve head/eye shading, hair coverage, facial
   expressions and wardrobe in the actual daylight/night conversation camera before duplicating work.
2. **Animation:** add properly licensed walk/idle/listening clips, retargeting, foot placement and
   phoneme-based facial motion. Test that speaking and gestures continue to follow the audible line.
3. **A consistent Japanese streetscape:** replace prominent house/road/foliage assets with a coherent
   authored set. Prioritize the two-person backdrop, pavement edges, doors, signs, cables and shopfronts.
   More polygon density alone will not fix art-direction differences.
4. **Phone budgets:** start with two imported residents; measure frame time, texture memory and loading
   on actual iOS/Android devices. Add geometry/texture LOD and bounded asset residency before loading
   26 high-detail people. Viewport emulation is not a mobile GPU performance test.
5. **Game readability:** make the transition from observing to playing a resident more explicit, show
   API connectivity before Auto starts, and keep the first daytime encounter easy to discover. The live
   Tokyo clock can otherwise introduce a new player to a town full of sleeping residents.

No paid services or Vercel add-ons were enabled for this work. This review is local, not a deployment
or a claim that the game is now photorealistic.
