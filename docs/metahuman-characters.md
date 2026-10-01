# Realistic residents (MetaHuman)

Residents can be shown as realistic MetaHumans instead of the simple figures. Each one is a single `.glb`
file. The game poses the body and face itself, so **no animations need exporting**. A resident without a
file keeps their simple figure, so you can add them one at a time.

**Current asset status:** all 26 residents use CC0 MPFB/MakeHuman exports; see
[the free, open character workflow](open-character-art.md). They are not MetaHumans.
No MetaHuman resident has been imported; a MetaHuman file listed in the manifest replaces that resident's model.
Run `npm run characters:check` in `frontend` for the actual imported count; this also runs before builds.
Do not mistake the loader or a passing synthetic-rig test for a verified photoreal character.

## What the game expects

| | |
|---|---|
| File | `frontend/public/characters/<resident id>.glb`, listed in `frontend/public/characters/manifest.json` |
| Skeleton | The standard MetaHuman body skeleton. The game uses `pelvis`, `spine_03`, `neck_01`, `head`, `thigh_l/r`, `calf_l/r`, `upperarm_l/r`, `lowerarm_l/r`. |
| Face | The 51 ARKit blendshapes (`jawOpen`, `eyeBlinkLeft`, `mouthSmileLeft`, `browInnerUp`, …) on the face mesh. Brow/lash cards with the same names follow along. |
| Compression | Meshopt geometry and WebP textures (step 3). Draco-compressed files are **not** supported. |
| Size | Aim for 4–8 MB per resident. Files load only when the resident is near the camera, selected or talking. |
| Units and facing | Export Y-up glTF. Scale is normalized from visible meshes; the model is centered, grounded and faced using the thigh bones. An optional `facingDegrees` in the manifest overrides automatic facing. The resident's `height_cm` sets final height. |

## Steps

### 1. Create the MetaHuman
In Unreal Engine 5.7, open **MetaHuman Creator** and build the resident from the casting sheet below.
All 26 active residents are Japanese adults. Match individual age, build, face, hairstyle and wardrobe;
do not reuse one face for the entire cast. Use the profile's `personality.appearance` as the art direction.
Colour swatches are illustration references, not measured human skin colour. Keep faces individual rather
than relying on ethnic caricatures. Check Epic's [current licence](https://www.metahuman.com/license)
for your project before exporting; the export tool's MIT licence does not license the MetaHuman assets.

### 2. Export to GLB with ARKit face shapes
Unreal's own glTF exporter drops the face shape names, so use the open-source pipeline
[smorchj/metahuman-to-glb](https://github.com/smorchj/metahuman-to-glb) (MIT). It assembles the character
in Unreal, bakes ARKit shapes through Blender 5 and writes one GLB. Its documented setup requires an
existing Unreal project, `UnrealEditor-Cmd.exe` and `blender.exe`: a Windows authoring machine is the
documented path. Installing PowerShell on a Mac alone does not provide those tools or make the pipeline
Mac-compatible. The upstream output uses Draco; recompress it to Meshopt before importing here.

### 3. Shrink it for the web
From the repo root (resulting size depends on the asset; 4-8 MB is a target, not a guarantee):

```bash
npx @gltf-transform/cli optimize path/to/export.glb frontend/public/characters/cit_009.glb --texture-compress webp --texture-size 1024 --compress meshopt --simplify false
```

### 4. List it
Add the resident to `frontend/public/characters/manifest.json`:

```json
{
  "residents": {
    "cit_009": { "file": "cit_009.glb" }
  }
}
```

### 5. Check it
Run the game locally (`npm run dev` in `frontend`), select the resident and press **Follow**. They should
stand at their height, walk with a stride, turn their head to whoever is talking, blink, and move their
mouth and face with the conversation.

Before deployment run `npm run characters:check`. It rejects missing files, incomplete rigs, missing
blink/jaw morph names, Draco, external textures and invalid manifest paths. The release staging script
includes the manifest, GLBs and the checker. Never place world saves or private journals in `public`.

For each asset verify daylight and night, front/side/back views, hair edges, closed eyelids, mouth opening,
feet on the ground, a walking route, and a two-person conversation. Test phone frame rate and memory with
two imported residents first. Procedural posing is not motion capture: foot IK, authored walk clips,
phoneme-driven lips and better skin/hair shaders remain separate quality work.

## Saved worlds

Resident IDs and family links are unchanged. Existing worlds refresh names, appearance and nature from
the profiles without clearing emotions, relationship scores, tasks or private journals. Old text is not
rewritten; `personality.identity.former_names` lets the default character prompt recognize their earlier
name. Player-edited prompts remain player-owned. Inactive legacy profiles remain inactive.

## Known limits of the export pipeline
- Clothing colours can come out wrong where MetaHuman blends two colours by mask.
- `tongueOut` is missing on the default rig (the game doesn't use it).
- Fine face wrinkles are lost in the bake; expressions still read clearly.

## Casting sheet

Generated from the residents' profiles; skin and hair are the colours used on their portraits.

| Resident | ID | Age | Sex | Height | Build | Job | Skin | Hair |
|---|---|---|---|---|---|---|---|---|
| Aoi Takahashi | `cit_009` | 20 | female | 162 cm | average | Lab assistant | #d6ac8b | #292a2c |
| Ren Ishikawa | `cit_010` | 21 | male | 175 cm | average | Barista | #c99978 | #37302c |
| Riku Hayashi | `cit_021` | 19 | male | 180 cm | average | Trainee fitness instructor | #d6ac8b | #292a2c |
| Mio Fujimoto | `cit_022` | 21 | female | 165 cm | average | Pharmacy technician | #c99978 | #37302c |
| Sota Watanabe | `cit_026` | 19 | male | 176 cm | average | Apprentice technician | #c99978 | #40342e |
| Hana Shimizu | `cit_027` | 20 | female | 158 cm | average | Library assistant | #efd0b5 | #292a2c |
| Rin Abe | `cit_028` | 21 | female | 166 cm | average | Junior software engineer | #e3bfa2 | #37302c |
| Kaito Ito | `cit_029` | 20 | male | 172 cm | average | Food-court cook | #d6ac8b | #40342e |
| Takashi Watanabe | `cit_030` | 46 | male | 181 cm | sturdy | Farmer | #c99978 | #292a2c |
| Yuko Watanabe | `cit_031` | 44 | female | 165 cm | sturdy | Bank clerk | #efd0b5 | #37302c |
| Masao Watanabe | `cit_032` | 81 | male | 172 cm | average | Retired farmer | #e3bfa2 | #b8b7b0 |
| Kaori Takahashi | `cit_033` | 42 | female | 162 cm | average | Doctor | #d6ac8b | #292a2c |
| Daisuke Ishikawa | `cit_034` | 45 | male | 174 cm | heavy | Cafe owner | #c99978 | #37302c |
| Keiko Hayashi | `cit_035` | 39 | female | 168 cm | average | Teacher | #efd0b5 | #40342e |
| Naoki Ito | `cit_036` | 47 | male | 170 cm | average | Scientist | #e3bfa2 | #292a2c |
| Yuka Fujimoto | `cit_037` | 38 | female | 166 cm | average | Librarian | #d6ac8b | #37302c |
| Takeshi Abe | `cit_038` | 45 | male | 179 cm | average | Police officer | #c99978 | #40342e |
| Natsumi Shimizu | `cit_039` | 29 | female | 170 cm | average | Fitness coach | #efd0b5 | #292a2c |
| Kenji Tanaka | `cit_040` | 54 | male | 170 cm | average | Station master | #e3bfa2 | #555450 |
| Aiko Tanaka | `cit_041` | 51 | female | 158 cm | average | Konbini owner | #d6ac8b | #555450 |
| Haruto Tanaka | `cit_042` | 22 | male | 177 cm | average | Station staff | #c99978 | #292a2c |
| Yui Sato | `cit_043` | 28 | female | 161 cm | average | Office worker | #efd0b5 | #37302c |
| Daichi Mori | `cit_044` | 31 | male | 176 cm | sturdy | Mall manager | #e3bfa2 | #40342e |
| Hiroshi Nakamura | `cit_045` | 74 | male | 165 cm | average | Retired carpenter | #d6ac8b | #b8b7b0 |
| Emi Kobayashi | `cit_046` | 44 | female | 160 cm | average | Clinic doctor | #c99978 | #37302c |
| Sakura Kobayashi | `cit_047` | 19 | female | 157 cm | average | Konbini clerk | #efd0b5 | #40342e |
