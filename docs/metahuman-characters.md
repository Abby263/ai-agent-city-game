# Realistic residents (MetaHuman)

Residents can be shown as realistic MetaHumans instead of the simple figures. Each one is a single `.glb`
file. The game poses the body and face itself, so **no animations need exporting**. A resident without a
file keeps their simple figure, so you can add them one at a time.

## What the game expects

| | |
|---|---|
| File | `frontend/public/characters/<resident id>.glb`, listed in `frontend/public/characters/manifest.json` |
| Skeleton | The standard MetaHuman body skeleton. The game uses `pelvis`, `spine_03`, `neck_01`, `head`, `thigh_l/r`, `calf_l/r`, `upperarm_l/r`, `lowerarm_l/r`. |
| Face | The 51 ARKit blendshapes (`jawOpen`, `eyeBlinkLeft`, `mouthSmileLeft`, `browInnerUp`, …) on the face mesh. Brow/lash cards with the same names follow along. |
| Compression | Meshopt geometry and WebP textures (step 3). Draco-compressed files are **not** supported. |
| Size | Aim for 4–8 MB per resident. Files load only when the resident is near the camera, selected or talking. |
| Units and facing | Any. The loader measures the height, stands the model on the ground and turns it to face forward. The resident's `height_cm` then sets their final height. |

## Steps

### 1. Create the MetaHuman
In Unreal Engine 5.7, open **MetaHuman Creator** and build the resident from the casting sheet below.
Match age, sex, height, build, skin and hair; clothes are up to you (everyday Tokyo clothes). MetaHuman is free
for anyone earning under $1M a year and may be used outside Unreal ([licence](https://www.metahuman.com/license)).

### 2. Export to GLB with ARKit face shapes
Unreal's own glTF exporter drops the face shape names, so use the open-source pipeline
[smorchj/metahuman-to-glb](https://github.com/smorchj/metahuman-to-glb) (MIT). It assembles the character
in Unreal, bakes the 51 ARKit shapes through Blender 5 and writes one GLB (about 40 MB). Its scripts are
PowerShell: on a Mac install it with `brew install powershell`, or ask Claude Code to run the stages for you.

### 3. Shrink it for the web
From the repo root (about 40 MB down to about 6 MB):

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

## Known limits of the export pipeline
- Clothing colours can come out wrong where MetaHuman blends two colours by mask.
- `tongueOut` is missing on the default rig (the game doesn't use it).
- Fine face wrinkles are lost in the bake; expressions still read clearly.

## Casting sheet

Generated from the residents' profiles; skin and hair are the colours used on their portraits.

| Resident | ID | Age | Sex | Height | Build | Job | Skin | Hair |
|---|---|---|---|---|---|---|---|---|
| Ava Singh | `cit_009` | 20 | female | 162 cm | average | Lab assistant | #bd815f | #362f31 |
| Mateo Garcia | `cit_010` | 21 | male | 175 cm | average | Barista | #d7a07b | #493b31 |
| Noah Mensah | `cit_021` | 19 | male | 180 cm | average | Trainee fitness instructor | #83533d | #252728 |
| Iris Novak | `cit_022` | 21 | female | 165 cm | average | Pharmacy technician | #f0c5a9 | #865340 |
| Leo Brooks | `cit_026` | 19 | male | 176 cm | average | Apprentice technician | #eac09c | #9d713c |
| Sophie Laurent | `cit_027` | 20 | female | 158 cm | average | Library assistant | #edb898 | #5d3630 |
| Zara Ali | `cit_028` | 21 | female | 166 cm | average | Junior software engineer | #b97953 | #292830 |
| Eliot Chen | `cit_029` | 20 | male | 172 cm | average | Food-court cook | #e5b38c | #302e32 |
| Tom Brooks | `cit_030` | 46 | male | 181 cm | sturdy | Farmer | #e8bd98 | #8a6437 |
| Hannah Brooks | `cit_031` | 44 | female | 165 cm | sturdy | Bank clerk | #f0c8a6 | #c49a5c |
| Walter Brooks | `cit_032` | 81 | male | 172 cm | average | Retired farmer | #e6b999 | #d9d7d2 |
| Priya Singh | `cit_033` | 42 | female | 162 cm | average | Doctor | #b57a58 | #2f2729 |
| Carlos Garcia | `cit_034` | 45 | male | 174 cm | heavy | Cafe owner | #c9956f | #3e3129 |
| Grace Mensah | `cit_035` | 39 | female | 168 cm | average | Teacher | #7a4a36 | #211f22 |
| Wei Chen | `cit_036` | 47 | male | 170 cm | average | Scientist | #e0ad86 | #2b2a2f |
| Elena Novak | `cit_037` | 38 | female | 166 cm | average | Librarian | #efc3a5 | #7d4a38 |
| Samir Ali | `cit_038` | 45 | male | 179 cm | average | Police officer | #a86e4a | #26252b |
| Maya Laurent | `cit_039` | 29 | female | 170 cm | average | Fitness coach | #ecb793 | #5d3630 |
| Kenji Tanaka | `cit_040` | 54 | male | 170 cm | average | Station master | #e9c29f | #6d6a6a |
| Aiko Tanaka | `cit_041` | 51 | female | 158 cm | average | Konbini owner | #ecc6a4 | #3a3033 |
| Haruto Tanaka | `cit_042` | 22 | male | 177 cm | average | Station staff | #e9c29f | #1f1e22 |
| Yui Sato | `cit_043` | 28 | female | 161 cm | average | Office worker | #efcaa8 | #2b2a2f |
| Daichi Mori | `cit_044` | 31 | male | 176 cm | sturdy | Mall manager | #e3b58f | #4a3a30 |
| Hiroshi Nakamura | `cit_045` | 74 | male | 165 cm | average | Retired carpenter | #e6bd98 | #cfccc6 |
| Emi Kobayashi | `cit_046` | 44 | female | 160 cm | average | Clinic doctor | #efcaa8 | #262528 |
| Sakura Kobayashi | `cit_047` | 19 | female | 157 cm | average | Konbini clerk | #efcaa8 | #2b2a2f |
