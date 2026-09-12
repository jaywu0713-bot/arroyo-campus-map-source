"""Rebuild only the approved language-area objects, preserving the saved campus."""
import sys
from pathlib import Path
import bpy
from mathutils import Vector

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'scripts'))
from campus_language import build_language

bpy.ops.wm.open_mainfile(filepath=str(ROOT / 'model/arroyo-campus.blend'))
layout = build_language(bpy)
bpy.ops.wm.save_as_mainfile(filepath=str(ROOT / 'model/arroyo-campus.blend'))

groups = {}
for obj in list(bpy.data.objects):
    if obj.type == 'MESH':
        key = (obj.parent.name if obj.parent else '', obj.data.materials[0].name)
        groups.setdefault(key, []).append(obj)
for group in groups.values():
    if len(group) < 2:
        continue
    bpy.ops.object.select_all(action='DESELECT')
    for obj in group:
        obj.select_set(True)
    bpy.context.view_layer.objects.active = group[0]
    bpy.ops.object.join()
bpy.ops.object.select_all(action='DESELECT')
bpy.ops.export_scene.gltf(filepath=str(ROOT / 'public/models/arroyo-campus.glb'),
                        export_format='GLB', export_extras=True,
                        export_cameras=False, export_lights=False)

scene = bpy.context.scene
camera = scene.camera
scene.render.resolution_x = 1400
scene.render.resolution_y = 1000
scene.render.resolution_percentage = 100
scene.cycles.samples = 20
scene.world.use_nodes = True
background = scene.world.node_tree.nodes.get('Background')
background.inputs['Color'].default_value = (.62, .74, .85, 1)
background.inputs['Strength'].default_value = .65
for name, position, target, scale in [
    ('language-aerial', (195, -185, 100), (169, -126, 0), 97),
    ('language-street', (224, -124, 4.3), (162, -124, 2.4), None),
]:
    camera.location = position
    camera.rotation_euler = (Vector(target) - camera.location).to_track_quat('-Z', 'Y').to_euler()
    camera.data.type = 'ORTHO' if scale else 'PERSP'
    if scale:
        camera.data.ortho_scale = scale
    else:
        camera.data.lens = 23
    scene.render.filepath = str(ROOT / 'model' / (name + '.png'))
    bpy.ops.render.render(write_still=True)
print('LANGUAGE REBUILD COMPLETE: ' + layout['revision'], flush=True)
