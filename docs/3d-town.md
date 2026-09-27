# Nakameguro In 3D

Nakameguro is rendered as real, orbitable Three.js geometry, not an illustrated image on a plane. Its art direction takes inspiration from [Sakura Crossing](https://github.com/Kenton-GMI/sakura-crossing) by Kenton Wang (MIT): cohesive low-poly geometry, stepped lighting, warm sunlight, and restrained ink outlines. AgentCity's town geometry, characters, textures, and shader implementation are original; no Sakura Crossing code or assets are bundled.

## Controls

- Drag with the left mouse button to orbit; right-drag to pan; scroll to zoom.
- On touchscreens, one finger orbits and two fingers pan/pinch.
- Tap a citizen model or its name, or choose a portrait from the roster.
- Follow tracks the selected citizen. Explore releases the camera.
- The overview button frames the town; rotate turns the camera by 45 degrees.
- Place labels toggles additional destination names. Building signs remain visible.
- At town-wide zoom, only the selected citizen's name remains visible to avoid label clutter. The portrait roster always provides access to every citizen.
- Nameplates start with an icon for the resident's current activity (💤 sleeping, 📚 school, 💬 talking, 🔬 lab club and so on). Residents asleep at home go indoors; their nameplate stays at the front door.
- Movement and conversation commands remain in the citizen and Talk panels. Camera gestures do not issue citizen tasks.

## Rendering Architecture

```mermaid
flowchart LR
  World[Existing city state] --> Canvas[React GameCanvas]
  Canvas --> Renderer[Three.js lifecycle and camera]
  Layout[Authored locations and A-star grid] --> Renderer
  Renderer --> Models[Animated citizen models and name buttons]
  Renderer --> Town[Instanced buildings, trees, props and ground]
  Models --> Frame[Toon lighting, soft shadows, contact shadows]
  Town --> Frame
  Horizon[Sky dome, city to the horizon, Mt Fuji] --> Frame
  Frame --> AO[Ambient occlusion]
  AO --> Ink[Ink outlines and conversation depth blur]
  Ink --> Grade[Bloom, ACES tone mapping, vignette]
  Grade --> Screen[WebGL canvas]
  Screen --> Select[Raycast selection]
  Select --> World
```

`frontend/src/game/three/` owns the scene:

- `layout.ts`: authored building footprints and destination arrivals; PathFinding.js A-star navigation with no diagonal corner cutting.
- `materials.ts`: shared toon materials, geometry, procedural signage, and texture ownership.
- `town.ts`: buildings, rooftops, windows, awnings, garden boxes, market produce, benches, lamps, bikes, schoolyard, pond, river, bridges, and drifting petals.
- `citizen.ts`: distinct palette-based student models, walking cycles, idle motion, selection rings, and accessible DOM name buttons.
- `post.ts`: the HDR frame pipeline (below).
- `quality.ts`: graphics presets, device detection and automatic step-down.
- `sky.ts`: the colour script and a sky dome (horizon to zenith, sun glow).
- `horizon.ts`: the world beyond the town: ground to the horizon, tree clumps, low-rise streets, a skyline with night windows, the river continuing both ways and Mt Fuji in the west.
- `renderer.ts`: camera, lighting, selection, resizing, visibility, frame budget, and cleanup.

## The Frame

Each frame is rendered in HDR and finished in `post.ts`, using [postprocessing](https://github.com/pmndrs/postprocessing) (Zlib) and [N8AO](https://github.com/N8python/n8ao) (ISC):

1. **Scene** with toon materials, sun shadows and soft contact shadows under people and vehicles (`Art.contactShadow`).
2. **Ambient occlusion** (N8AO), tinted towards the sky so it reads as shade: it grounds buildings, trees and people.
3. **Ink**: the depth-curvature outlines, plus the soft background blur during conversations.
4. **Bloom** that grows at night, so lit windows, lamps, headlights and the distant skyline glow; **ACES** tone mapping; a light vignette.

The approach was informed by studying how browser games get a lot from Three.js (the view-only [spiderbench](https://github.com/xikhar/spiderbench) demo: AO, bloom, a sky model, aerial perspective, contact shadows, quality presets, shader warm-up). No code or assets from it are used; everything here is our own implementation on open-source libraries.

Distant buildings use one instanced toon material with windows computed from world position (lit at night, a third to a half of them) and their own distance haze towards the horizon colour, so silhouettes stay readable while the town keeps crisp fog. Shaders are compiled up front (`renderer.compileAsync`) so nothing stutters the first time it appears.

## Graphics Quality

| Preset | Pixel ratio | Anti-aliasing | Ambient occlusion | Shadow map |
|---|---|---|---|---|
| high (desktop) | up to 1.75 | 4× MSAA | full resolution | 2048 |
| medium (phones) | up to 1.35 | 2× MSAA | half resolution | 2048 |
| low (weak devices) | 1 | none | off | 1024 |

The preset is chosen from the device (CPU cores, memory, touch screen). If the median frame takes longer than 45 ms for five seconds, the town steps down one preset and remembers it for the next visit. Force one with `?q=low`, `?q=medium` or `?q=high`.

## Simulation Boundary

The existing 40-by-40 simulation remains authoritative. The renderer maps location arrivals to public entrances and interpolates citizen motion over a separate half-tile navigation grid. Buildings and the park pond block visual paths; decorative props do not all have collision volumes. This is presentation navigation, not a physics or pedestrian-avoidance simulation. Animation can finish after a logical tick; it does not advance city time or alter task completion. This boundary lets existing saves, plans, private memory, and conversations continue to work.

Lighting follows the simulation clock through a colour script in `sky.ts`: peach sunrise, blue day, golden hour, lavender dusk and deep-blue night. The sun arcs from the river (east) to the west, and the sky eases between 15-minute ticks instead of jumping. After dark, `atmosphere.ts` lights window glass and street lamps with emissive materials, adds soft lamp light pools, stars and a moon. None of these are real lights, so night costs almost nothing. Clouds drift and cast moving shadows by day.

`traffic.ts` runs a yellow city bus and two cars in the right-hand lane around the central block. The bus pauses at the bus shelter. Every vehicle stops for pedestrians in front of it and queues behind the vehicle ahead. Traffic is decorative: it never blocks simulation movement, and it stays parked when reduced motion is on.

Blossom petals, clouds, river ripples and traffic are visual effects, not weather or transport simulation. Interiors and Blender/glTF asset loading are not implemented in this revision.

## Performance And Compatibility

The renderer targets 30 frames per second, caps device pixel ratio, shares materials and geometry, and instances repeated static meshes. It stops rendering when the tab is hidden or the game leaves the viewport. Reduced-motion preferences disable decorative motion and gait bobbing, while necessary travel remains visible. Resize observers, controls, listeners, textures, shadow targets, instanced buffers, and render targets are disposed on unmount.

WebGL 2 is required. A visible error state replaces a blank canvas when graphics initialization fails. There are no new environment variables or runtime art downloads. The scene renders on the player's device and does not create backend or LLM requests; public hosting remains paused.

Run `npm test`, `npm run typecheck`, `npm run lint`, and `npm run build` in `frontend/`. Navigation tests cover every pair of public destinations, obstacles, boundary clamping, corner cutting, repeated searches, and distinct home positions. Browser verification should also cover desktop and mobile orbit/zoom, name selection, player walking, conversation submission, and a nonblank moving canvas.
