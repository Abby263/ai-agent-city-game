#!/bin/bash
# Builds the narrators' talking avatars (see docs/open-character-art.md for the MPFB checkout and asset packs).
# Usage: scripts/blender/build-narrators.sh /path/to/mpfb2 /path/to/mpfb-assets
set -e
cd "$(dirname "$0")/../.."
for id in narrator_lucknow narrator_nakameguro; do
  /Applications/Blender.app/Contents/MacOS/Blender --background --factory-startup --python-exit-code 1 \
    --python scripts/blender/export-residents.py -- --mpfb "$1" --assets "$2" --output /tmp/agentcity-models \
    --profiles scripts/blender/narrators.json --resident "$id" --talking 2>&1 | grep -E "Exported|Error|Traceback" | tail -3
  # TalkingHead finds the avatar by its root, "Armature": keep the scene's structure as exported.
  npx --yes @gltf-transform/cli@4.4.0 optimize "/tmp/agentcity-models/$id.glb" "frontend/public/avatars/$id.glb" \
    --texture-compress webp --texture-size 1024 --compress meshopt --simplify false --flatten false --join false 2>&1 | tail -1
done
