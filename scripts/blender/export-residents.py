"""Build CC0 residents using an external MPFB checkout. See docs/open-character-art.md."""
import argparse
import sys
from pathlib import Path

import bpy

parser = argparse.ArgumentParser()
parser.add_argument('--mpfb', type=Path, required=True)
parser.add_argument('--assets', type=Path, required=True, help='Directory containing data/skins, data/hair, etc.')
parser.add_argument('--output', type=Path, required=True)
parser.add_argument('--resident', choices=['cit_009', 'cit_010', 'cit_026'], required=True)
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

CAST = {
    'cit_009': dict(name='Aoi', gender=0.0, age=0.28, height=0.48, muscle=0.36, weight=0.42,
                    hair='bob01', clothes='female_elegantsuit01', shoes='shoes02'),
    'cit_010': dict(name='Ren', gender=1.0, age=0.30, height=0.53, muscle=0.48, weight=0.45,
                    hair='short02', clothes='male_casualsuit05', shoes='shoes01'),
    'cit_026': dict(name='Sota', gender=1.0, age=0.28, height=0.56, muscle=0.56, weight=0.49,
                    hair='short01', clothes='male_casualsuit01', shoes='shoes03'),
}
FACE_SHAPES = {
    'jawOpen', 'mouthFunnel', 'eyeBlinkLeft', 'eyeBlinkRight', 'mouthSmileLeft', 'mouthSmileRight',
    'cheekSquintLeft', 'cheekSquintRight', 'eyeWideLeft', 'eyeWideRight', 'browInnerUp',
    'browOuterUpLeft', 'browOuterUpRight', 'mouthFrownLeft', 'mouthFrownRight', 'mouthPressLeft',
    'mouthPressRight', 'browDownLeft', 'browDownRight', 'noseSneerLeft', 'noseSneerRight',
    'mouthStretchLeft', 'mouthStretchRight',
}


def material(obj, source, kind):
    """Use glTF-native PBR nodes; MakeSkin's shader groups otherwise export opaque clothes as transparent."""
    mhmat = MhMaterial()
    mhmat.populate_from_mhmat(str(source))
    settings = mhmat._settings
    mat = bpy.data.materials.new(f'{kind}_{obj.name}')
    mat.use_nodes = True
    mat.use_backface_culling = kind not in ('hair', 'eyebrow', 'eyelash')
    nodes, links = mat.node_tree.nodes, mat.node_tree.links
    shader = nodes.get('Principled BSDF')
    shader.inputs['Roughness'].default_value = {'skin': 0.57, 'eyes': 0.22, 'hair': 0.78}.get(kind, 0.85)
    shader.inputs['Specular IOR Level'].default_value = 0.3
    diffuse = nodes.new('ShaderNodeTexImage')
    diffuse.image = bpy.data.images.load(settings['diffuseTexture'], check_existing=True)
    links.new(diffuse.outputs['Color'], shader.inputs['Base Color'])
    if kind in ('hair', 'eyebrow', 'eyelash'):
        # Hard alpha masks prevent sorted transparent hair planes cutting through the face.
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


cast = CAST[args.resident]
data = args.assets / 'data'
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)
skin = 'young_asian_male' if cast['gender'] else 'young_asian_female'
info = HumanService._create_default_human_info_dict()
info.update(name=cast['name'], rig='game_engine', skin_mhmat=f'{skin}/{skin}.mhmat',
            skin_material_type='MAKESKIN', eyes='high-poly/high-poly.mhclo', eyes_material_type='MAKESKIN',
            hair=f"{cast['hair']}/{cast['hair']}.mhclo", eyebrows='eyebrow001/eyebrow001.mhclo',
            eyelashes='eyelashes01/eyelashes01.mhclo',
            clothes=[f'{part}/{part}.mhclo' for part in (cast['clothes'], cast['shoes'])])
info['phenotype'].update({key: cast[key] for key in ('gender', 'age', 'height', 'weight', 'muscle')})
info['phenotype']['race'] = {'asian': 1.0, 'african': 0.0, 'caucasian': 0.0}
settings = HumanService.get_default_deserialization_settings()
settings.update(subdiv_levels=0, load_clothes=True)
body = HumanService.deserialize_from_dict(info, settings)
TargetService.bake_targets(body)
FaceService.load_targets(body, False, False, True)
FaceService.interpolate_targets(body)
ExportService.bake_modifiers_remove_helpers(body, bake_masks=True, remove_helpers=True)

sources = {
    'body': (data / 'skins' / skin / f'{skin}.mhmat', 'skin'),
    'high-poly': (data / 'eyes/materials/brown.mhmat', 'eyes'),
    'eyebrow001': (data / 'eyebrows/eyebrow001/eyebrow001.mhmat', 'eyebrow'),
    'eyelashes01': (data / 'eyelashes/eyelashes01/eyelashes01.mhmat', 'eyelash'),
    cast['hair']: (data / 'hair' / cast['hair'] / f"{cast['hair']}.mhmat", 'hair'),
    cast['clothes']: (data / 'clothes' / cast['clothes'] / f"{cast['clothes']}.mhmat", 'clothes'),
    cast['shoes']: (data / 'clothes' / cast['shoes'] / f"{cast['shoes']}.mhmat", 'shoes'),
}
for obj in bpy.context.scene.objects:
    if obj.type != 'MESH':
        continue
    part = obj.name.split('.', 1)[1]
    source, kind = sources[part]
    material(obj, source, kind)
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
    if image.source != 'FILE':
        continue
    if max(image.size) > 1024:
        factor = 1024 / max(image.size)
        image.scale(max(1, round(image.size[0] * factor)), max(1, round(image.size[1] * factor)))
    image.pack()

args.output.mkdir(parents=True, exist_ok=True)
bpy.ops.export_scene.gltf(filepath=str(args.output / f'{args.resident}.glb'), export_format='GLB',
                          export_animations=False, export_morph=True, export_extras=False)
print(f'Exported {args.resident}: {cast["name"]}')
