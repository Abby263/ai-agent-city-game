# Free, open character art

## What is implemented

Aoi (`cit_009`), Ren (`cit_010`), and Sota (`cit_026`) now have actual textured,
rigged GLB bodies instead of primitive shapes. They have individual proportions,
haircuts, brown eyes, everyday outfits, blinking, expressions and speaking mouths.
The existing simulation drives their walking and gestures. Each optimized model is
approximately 1 MB, with embedded 1024px-or-smaller WebP textures and Meshopt geometry.
No asset CDN, paid API, subscription, Unreal installation or runtime Blender is needed.

The other 23 residents retain the lightweight procedural bodies. This is a first
art pass, **not** a claim of photorealism or 26 completed production characters.
Hair cards, procedural animation, illustrated UI portraits and the simple town
geometry still limit realism. Test physical iOS/Android hardware before expanding
the high-detail cast; viewport emulation is not a GPU/memory benchmark.

## Why these tools

- [MPFB / MakeHuman](https://static.makehumancommunity.org/mpfb/faq/is_it_really_free.html):
  free, open-source Blender character authoring; CC0 core art can be exported into a
  browser game without applying the tool's GPL licence to those assets.
- [Blender](https://www.blender.org/about/license/): local authoring and glTF export.
- [glTF Transform](https://github.com/donmccurdy/glTF-Transform): MIT-licensed web
  asset optimization. Geometry stays animated; do not flatten the skeleton manually.
- [Poly Haven](https://polyhaven.com/license): CC0 scanned surfaces, environment
  lighting and props. The town already uses locally bundled Poly Haven surfaces.
  Better foliage and authored storefronts are the next environment-art priorities.

Check individual third-party asset licences; a free download is not automatically CC0.
The exact shipped inputs and source hashes are in
[`frontend/public/characters/CREDITS.md`](../frontend/public/characters/CREDITS.md).

## Reproduce a resident

Requires Blender 4.5 LTS, Node.js and approximately 1 GB temporary disk space.
Run from the repository root. Downloads are authoring inputs only; never deploy
the source pack, Blender preferences, `.blend` files, or any local world data.

```sh
git clone https://github.com/makehumancommunity/mpfb2.git /tmp/agentcity-mpfb2
git -C /tmp/agentcity-mpfb2 checkout afb9f530a7c2741dedb8df0ebae2e0b183caec21
curl -fL -o /tmp/makehuman_system_assets_cc0.zip https://files2.makehumancommunity.org/asset_packs/makehuman_system_assets/makehuman_system_assets_cc0.zip
curl -fL -o /tmp/faceunits01.zip https://files2.makehumancommunity.org/functional/faceunits01.zip
mkdir -p /tmp/agentcity-mpfb-assets/data /tmp/agentcity-blender-config
unzip -q /tmp/makehuman_system_assets_cc0.zip -d /tmp/agentcity-mpfb-assets/data
unzip -q /tmp/faceunits01.zip -d /tmp/agentcity-mpfb-assets/data

BLENDER_USER_CONFIG=/tmp/agentcity-blender-config /Applications/Blender.app/Contents/MacOS/Blender \
  --background --factory-startup --python-exit-code 1 \
  --python scripts/blender/export-residents.py -- \
  --mpfb /tmp/agentcity-mpfb2 --assets /tmp/agentcity-mpfb-assets \
  --output /tmp/agentcity-models --resident cit_009

npx --yes @gltf-transform/cli@4.4.0 optimize /tmp/agentcity-models/cit_009.glb \
  frontend/public/characters/cit_009.glb \
  --texture-compress webp --texture-size 1024 --compress meshopt --simplify false
cd frontend
npm run characters:check
```

On Linux/Windows substitute your Blender executable. Use a fresh source directory
or reuse an existing checkout at the pinned revision. Verify the two archive hashes
against CREDITS.md before running the exporter. This script uses a source checkout
in a headless, factory-startup process; it does not install MPFB in your personal
Blender environment or save your preferences.

Repeat for `cit_010` and `cit_026`. The explicit `CAST` records in the exporter
are the current art presets. To author another resident, add an individual preset
and its CLI choice, export, and add its stable ID to `manifest.json`. Match their
age and profile appearance; do not give the whole cast one face or outfit.

## Runtime acceptance checks

1. `characters:check` validates skeleton names, face shapes and embedded dependencies.
2. Asset tests require the shipped CC0 files to be below 2 MiB each, with opaque
   skin/clothing, masked hair, textures and an actual skin/skeleton.
3. Open a conversation in Talk and replay it. Inspect both bodies, hair coverage,
   eyes, blink, speech, gesture, shadows and ground contact.
4. Check a walking resident and resize to phone portrait/landscape. Camera collision
   avoidance must preserve both speakers; failed loads must retain a visible fallback.

Do not add all 26 high-resolution exports without bounded resident loading and LOD.
For truly cinematic results, the next steps are authored idle/listen/walk clips,
improved hair and skin shading, consistent environment geometry, and art review in
both daylight and evening lighting. The optional MetaHuman workflow remains in
[`metahuman-characters.md`](metahuman-characters.md).
