"""Build CC0 residents using an external MPFB checkout. See docs/open-character-art.md."""
import argparse
import hashlib
import json
import sys
from pathlib import Path

import bpy
import numpy as np

parser = argparse.ArgumentParser()
parser.add_argument('--mpfb', type=Path, required=True)
parser.add_argument('--assets', type=Path, required=True, help='Directory containing data/skins, data/hair, etc.')
parser.add_argument('--output', type=Path, required=True)
parser.add_argument('--profiles', type=Path, default=Path('frontend/src/lib/generated/citizens.json'),
                    help='Generated resident profiles (age, sex, height, weight, appearance colours).')
parser.add_argument('--resident', required=True, help='A resident id such as cit_009.')
args = parser.parse_args(sys.argv[sys.argv.index('--') + 1:])
sys.path.insert(0, str(args.mpfb.resolve() / 'src'))
# Resolve the source checkout's data to an isolated workspace, without installing an addon or saving preferences.
bpy.utils.extension_path_user = lambda *a, **kw: str(args.assets.resolve())
import addon_utils
addon_utils.enable('mpfb', default_set=True)
from mpfb.services.humanservice import HumanService
from mpfb.services.targetservice import TargetService
from mpfb.services.faceservice import FaceService
from mpfb.services.exportservice import ExportService
from mpfb.entities.material.mhmaterial import MhMaterial

# Art direction per resident, from their profile's hairstyle and outfit. MakeHuman's CC0 pack has no bun, so
# buns become a ponytail or braid; coats and aprons become the closest everyday outfit, recoloured below.
# The CC0 bobs (bob01, bob02) and short03 hang over the eyes, so faces stay clear with long hair, braids,
# ponytails and the short cuts instead.
ART = {
    'cit_009': dict(hair='long01', clothes='female_elegantsuit01', shoes='shoes02', brows='eyebrow001'),     # Aoi
    'cit_010': dict(hair='short02', clothes='male_casualsuit05', shoes='shoes01', brows='eyebrow003'),      # Ren
    'cit_021': dict(hair='short01', clothes='male_casualsuit06', shoes='shoes05', brows='eyebrow005', muscle=0.68),  # Riku
    'cit_022': dict(hair='long01', clothes='female_elegantsuit01', shoes='shoes04', brows='eyebrow002'),    # Mio
    'cit_026': dict(hair='short01', clothes='male_casualsuit01', shoes='shoes03', brows='eyebrow007'),      # Sota
    'cit_027': dict(hair='braid01', clothes='female_casualsuit01', shoes='shoes06', brows='eyebrow010'),      # Hana
    'cit_028': dict(hair='ponytail01', clothes='female_casualsuit01', shoes='shoes05', brows='eyebrow006'), # Rin
    'cit_029': dict(hair='short04', clothes='male_casualsuit06', shoes='shoes06', brows='eyebrow008'),      # Kaito
    'cit_030': dict(hair='short01', clothes='male_worksuit01', shoes='shoes03', brows='eyebrow012', muscle=0.66),   # Takashi
    'cit_031': dict(hair='braid01', clothes='female_elegantsuit01', shoes='shoes04', brows='eyebrow004'),   # Yuko
    'cit_032': dict(hair='short02', clothes='male_casualsuit03', shoes='shoes01', brows='eyebrow011', muscle=0.34),  # Masao
    'cit_033': dict(hair='braid01', clothes='female_elegantsuit01', shoes='shoes04', brows='eyebrow002'),   # Kaori
    'cit_034': dict(hair='short02', clothes='male_casualsuit03', shoes='shoes01', brows='eyebrow009'),      # Daisuke
    'cit_035': dict(hair='ponytail01', clothes='female_elegantsuit01', shoes='shoes02', brows='eyebrow005'),     # Keiko
    'cit_036': dict(hair='short02', clothes='male_casualsuit05', shoes='shoes04', brows='eyebrow001'),      # Naoki
    'cit_037': dict(hair='long01', clothes='female_casualsuit01', shoes='shoes02', brows='eyebrow003'),     # Yuka
    'cit_038': dict(hair='short04', clothes='male_elegantsuit01', shoes='shoes04', brows='eyebrow012', muscle=0.6),  # Takeshi
    'cit_039': dict(hair='ponytail01', clothes='female_sportsuit01', shoes='shoes05', brows='eyebrow007', muscle=0.66),  # Natsumi
    'cit_040': dict(hair='short02', clothes='male_elegantsuit01', shoes='shoes04', brows='eyebrow011'),     # Kenji
    'cit_041': dict(hair='braid01', clothes='female_casualsuit01', shoes='shoes02', brows='eyebrow009'),      # Aiko
    'cit_042': dict(hair='short02', clothes='male_casualsuit01', shoes='shoes06', brows='eyebrow006'),      # Haruto
    'cit_043': dict(hair='long01', clothes='female_elegantsuit01', shoes='shoes04', brows='eyebrow008'),    # Yui
    'cit_044': dict(hair='short01', clothes='male_elegantsuit01', shoes='shoes04', brows='eyebrow010'),     # Daichi
    'cit_045': dict(hair='short01', clothes='male_worksuit01', shoes='shoes03', brows='eyebrow011', muscle=0.38),   # Hiroshi
    'cit_046': dict(hair='ponytail01', clothes='female_elegantsuit01', shoes='shoes02', brows='eyebrow004'), # Emi
    'cit_047': dict(hair='long01', clothes='female_casualsuit01', shoes='shoes06', brows='eyebrow010'),      # Sakura
}

FACE_SHAPES = {
    'jawOpen', 'mouthFunnel', 'eyeBlinkLeft', 'eyeBlinkRight', 'mouthSmileLeft', 'mouthSmileRight',
    'cheekSquintLeft', 'cheekSquintRight', 'eyeWideLeft', 'eyeWideRight', 'browInnerUp',
    'browOuterUpLeft', 'browOuterUpRight', 'mouthFrownLeft', 'mouthFrownRight', 'mouthPressLeft',
    'mouthPressRight', 'browDownLeft', 'browDownRight', 'noseSneerLeft', 'noseSneerRight',
    'mouthStretchLeft', 'mouthStretchRight',
}
HEADS = ['head-oval', 'head-round', 'head-square', 'head-diamond', 'head-triangular', 'head-invertedtriangular', 'head-rectangular']
# Symmetric face features: [decrease, increase] targets, plus their left/right eye and cheek pairs.
FEATURES = [
    ('nose-point-width-decr', 'nose-point-width-incr'), ('nose-hump-decr', 'nose-hump-incr'), ('nose-flaring-decr', 'nose-flaring-incr'),
    ('nose-scale-vert-decr', 'nose-scale-vert-incr'), ('mouth-scale-horiz-decr', 'mouth-scale-horiz-incr'),
    ('mouth-upperlip-volume-decr', 'mouth-upperlip-volume-incr'), ('mouth-lowerlip-volume-decr', 'mouth-lowerlip-volume-incr'),
    ('chin-width-decr', 'chin-width-incr'), ('chin-prominent-decr', 'chin-prominent-incr'), ('chin-height-decr', 'chin-height-incr'),
]
PAIRED = [('eye-scale-decr', 'eye-scale-incr'), ('eye-height2-decr', 'eye-height2-incr'), ('eye-eyefold-down', 'eye-eyefold-up'),
          ('cheek-bones-decr', 'cheek-bones-incr'), ('cheek-volume-decr', 'cheek-volume-incr')]


def seeded(resident):
    """A stable random stream per resident, so the same face is rebuilt every time."""
    return np.random.default_rng(int(hashlib.sha256(resident.encode()).hexdigest()[:8], 16))


def face_targets(resident, gender):
    rng = seeded(resident)
    targets = [{'target': HEADS[rng.integers(len(HEADS))], 'value': float(rng.uniform(0.25, 0.6))}]
    for decrease, increase in FEATURES:
        amount = float(rng.normal(0, 0.28))
        targets.append({'target': increase if amount > 0 else decrease, 'value': min(0.6, abs(amount))})
    for decrease, increase in PAIRED:
        amount = float(rng.normal(0, 0.25))
        name = increase if amount > 0 else decrease
        for side in ('l', 'r'):
            targets.append({'target': f'{side}-{name}', 'value': min(0.55, abs(amount))})
    # Softer jaw for women, stronger for men, on top of the phenotype.
    targets.append({'target': 'chin-jaw-drop-incr' if gender else 'chin-jaw-drop-decr', 'value': float(rng.uniform(0.05, 0.25))})
    return targets


def macro_age(years):
    """MakeHuman's age slider: 0 is a baby, 0.1875 is 11, 0.5 is 25 and 1 is 90."""
    return 0.1875 + (years - 11) / 14 * 0.3125 if years <= 25 else min(1.0, 0.5 + (years - 25) / 65 * 0.5)


def macro_weight(kg, cm):
    bmi = kg / (cm / 100) ** 2
    return float(np.clip(0.5 + (bmi - 22) * 0.055, 0.25, 0.9))


def hex_rgb(value):
    value = value.lstrip('#')
    return np.array([int(value[i:i + 2], 16) / 255 for i in (0, 2, 4)])


def not_denim(u, v, rgb):
    return ~((rgb[:, 2] > rgb[:, 0] + 0.08) & (rgb[:, 2] > 0.25))


# Where the top is in each casual outfit's texture (u across, v down from the top), so the shirt takes the
# resident's colour while the jeans stay denim. Plaid shirts and jackets: everything that isn't denim.
SHIRT_AREAS = {
    'female_casualsuit01': lambda u, v, rgb: (v < 0.43) | ((u > 0.72) & (v > 0.6)),
    'male_casualsuit02': lambda u, v, rgb: (v < 0.42) | (u > 0.82),
    'male_casualsuit04': lambda u, v, rgb: v < 0.45,
    'male_casualsuit06': lambda u, v, rgb: v < 0.42,
    'male_casualsuit03': not_denim,
    'male_casualsuit05': not_denim,
}


def recolour(image, colour, strength, area=None):
    """Keeps the texture's light and shade, moves its colour to `colour` (both in sRGB), optionally only in `area`."""
    pixels = np.array(image.pixels[:], dtype=np.float32).reshape(-1, 4)
    rgb, alpha = pixels[:, :3], pixels[:, 3]
    if area is not None:
        width, height = image.size
        index = np.arange(len(pixels))
        u, v = (index % width) / width, 1 - (index // width) / height
        strength = np.where(area(u, v, rgb), strength, 0.0)[:, None]
    lum = rgb @ np.array([0.2126, 0.7152, 0.0722], dtype=np.float32)
    solid = alpha > 0.3
    mean = float(lum[solid].mean()) if solid.any() else float(lum.mean())
    target = colour.astype(np.float32)
    # Compressed so a bright highlight on dark hair stays a sheen instead of turning white.
    ratio = np.clip((lum / max(mean, 0.02)) ** 0.6, 0.25, 1.9)
    toned = np.clip(target[None, :] * ratio[:, None], 0, 1)
    mix = strength if np.ndim(strength) else np.float32(strength)
    pixels[:, :3] = rgb * (1 - mix) + toned * mix
    image.pixels.foreach_set(pixels.ravel())
    image.update()


def material(obj, source, kind, colour=None, strength=0.0, area=None):
    """Use glTF-native PBR nodes; MakeSkin's shader groups otherwise export opaque clothes as transparent."""
    mhmat = MhMaterial()
    mhmat.populate_from_mhmat(str(source))
    settings = mhmat._settings
    mat = bpy.data.materials.new(f'{kind}_{obj.name}')
    mat.use_nodes = True
    mat.use_backface_culling = kind not in ('hair', 'eyebrow', 'eyelash')
    nodes, links = mat.node_tree.nodes, mat.node_tree.links
    shader = nodes.get('Principled BSDF')
    shader.inputs['Roughness'].default_value = {'skin': 0.55, 'eyes': 0.15, 'hair': 0.8}.get(kind, 0.85)
    shader.inputs['Specular IOR Level'].default_value = {'skin': 0.38, 'eyes': 0.5, 'hair': 0.18}.get(kind, 0.3)
    diffuse = nodes.new('ShaderNodeTexImage')
    # Each resident's own copy, so recolouring one never changes another's texture.
    image = bpy.data.images.load(settings['diffuseTexture'], check_existing=False)
    if colour is not None and strength:
        if max(image.size) > 1024:
            factor = 1024 / max(image.size)
            image.scale(max(1, round(image.size[0] * factor)), max(1, round(image.size[1] * factor)))
        recolour(image, colour, strength, area)
    diffuse.image = image
    links.new(diffuse.outputs['Color'], shader.inputs['Base Color'])
    if kind in ('hair', 'eyebrow', 'eyelash', 'eyes'):
        # Hard alpha masks prevent sorted transparent hair planes cutting through the face. The eyes need one
        # too: their outer cornea shell is see-through in the texture, otherwise it paints over the iris.
        cutoff = nodes.new('ShaderNodeMath')
        cutoff.operation = 'GREATER_THAN'
        cutoff.inputs[1].default_value = 0.35
        links.new(diffuse.outputs['Alpha'], cutoff.inputs[0])
        links.new(cutoff.outputs[0], shader.inputs['Alpha'])
        mat.surface_render_method = 'DITHERED'
    normal_path = settings.get('normalmapTexture')
    if normal_path and Path(normal_path).exists():
        texture = nodes.new('ShaderNodeTexImage')
        texture.image = bpy.data.images.load(normal_path, check_existing=True)
        texture.image.colorspace_settings.name = 'Non-Color'
        normal = nodes.new('ShaderNodeNormalMap')
        normal.inputs['Strength'].default_value = 0.65
        links.new(texture.outputs['Color'], normal.inputs['Color'])
        links.new(normal.outputs['Normal'], shader.inputs['Normal'])
    obj.data.materials.clear()
    obj.data.materials.append(mat)


profiles = json.loads(args.profiles.read_text())
profiles = profiles if isinstance(profiles, list) else profiles.get('citizens', [])
profile = next((p for p in profiles if p['citizen_id'] == args.resident), None)
if profile is None or args.resident not in ART:
    raise SystemExit(f'No profile or art direction for {args.resident}')
art = ART[args.resident]
life = profile['life']
look = profile.get('personality', {}).get('appearance', {})
gender = 1.0 if life['sex'] == 'male' else 0.0
years = profile['age']
stage = 'old' if years >= 60 else 'middleage' if years >= 35 else 'young'
skin = f"{stage}_asian_{'male' if gender else 'female'}"
eyes = 'brownlight' if seeded(args.resident).random() < 0.3 else 'brown'

data = args.assets / 'data'
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)
info = HumanService._create_default_human_info_dict()
info.update(name=profile['name'].split()[0], rig='game_engine', skin_mhmat=f'{skin}/{skin}.mhmat',
            skin_material_type='MAKESKIN', eyes='high-poly/high-poly.mhclo', eyes_material_type='MAKESKIN',
            hair=f"{art['hair']}/{art['hair']}.mhclo", eyebrows=f"{art['brows']}/{art['brows']}.mhclo",
            eyelashes='eyelashes01/eyelashes01.mhclo',
            clothes=[f'{part}/{part}.mhclo' for part in (art['clothes'], art['shoes'])])
info['phenotype'].update(gender=gender, age=macro_age(years), height=0.5,
                         weight=macro_weight(life['weight_kg'], life['height_cm']),
                         muscle=art.get('muscle', 0.5 if gender else 0.42))
info['phenotype']['race'] = {'asian': 1.0, 'african': 0.0, 'caucasian': 0.0}
info['targets'] = face_targets(args.resident, gender)
settings = HumanService.get_default_deserialization_settings()
settings.update(subdiv_levels=0, load_clothes=True)
body = HumanService.deserialize_from_dict(info, settings)
TargetService.bake_targets(body)
FaceService.load_targets(body, False, False, True)
FaceService.interpolate_targets(body)
ExportService.bake_modifiers_remove_helpers(body, bake_masks=True, remove_helpers=True)

hair_colour = hex_rgb(look.get('hair', '#292a2c'))
shirt_colour = hex_rgb(look.get('shirt', '#8a8f94'))
sources = {
    # The CC0 'old' skins are strongly orange; bring them back to the resident's own tone.
    'body': (data / 'skins' / skin / f'{skin}.mhmat', 'skin', hex_rgb(look.get('skin', '#d6ac8b')), 0.55 if stage == 'old' else 0),
    'high-poly': (data / f'eyes/materials/{eyes}.mhmat', 'eyes', None, 0),
    art['brows']: (data / 'eyebrows' / art['brows'] / f"{art['brows']}.mhmat", 'eyebrow', hair_colour, 0.85),
    'eyelashes01': (data / 'eyelashes/eyelashes01/eyelashes01.mhmat', 'eyelash', None, 0),
    art['hair']: (data / 'hair' / art['hair'] / f"{art['hair']}.mhmat", 'hair', hair_colour, 0.9),
    # Casual outfits share one texture with their jeans: only the shirt area takes the colour, strongly.
    art['clothes']: (data / 'clothes' / art['clothes'] / f"{art['clothes']}.mhmat", 'clothes', shirt_colour,
                     0.8 if art['clothes'] in SHIRT_AREAS else 0.25 if 'casualsuit' in art['clothes'] else 0.45),
    art['shoes']: (data / 'clothes' / art['shoes'] / f"{art['shoes']}.mhmat", 'shoes', None, 0),
}
for obj in bpy.context.scene.objects:
    if obj.type != 'MESH':
        continue
    part = obj.name.split('.', 1)[1]
    source, kind, colour, strength = sources[part]
    material(obj, source, kind, colour, strength, SHIRT_AREAS.get(part) if kind == 'clothes' else None)
    for polygon in obj.data.polygons:
        polygon.use_smooth = True
    if obj.data.shape_keys:
        for key in list(obj.data.shape_keys.key_blocks)[1:]:
            name = key.name.removeprefix('!').split('/')[-1]
            if name not in FACE_SHAPES or kind not in ('skin', 'eyebrow', 'eyelash'):
                obj.shape_key_remove(key)
            else:
                key.name = name
                key.value = 0
    # MPFB's custom properties include source paths, which do not belong in distributed art.
    for key in list(obj.keys()):
        del obj[key]

for image in bpy.data.images:
    if image.source != 'FILE' or not image.users:
        continue
    if max(image.size) > 1024:
        factor = 1024 / max(image.size)
        image.scale(max(1, round(image.size[0] * factor)), max(1, round(image.size[1] * factor)))
    image.pack()

args.output.mkdir(parents=True, exist_ok=True)
bpy.ops.export_scene.gltf(filepath=str(args.output / f'{args.resident}.glb'), export_format='GLB',
                          export_animations=False, export_morph=True, export_extras=False)
print(f'Exported {args.resident}: {profile["name"]} ({years}, {skin}, {art["hair"]}, {art["clothes"]})')
