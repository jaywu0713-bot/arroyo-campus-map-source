import sys
from pathlib import Path
import bpy
ROOT=Path(__file__).resolve().parents[1]; sys.path.insert(0,str(ROOT/'scripts'))
from campus_math import build_math
bpy.ops.wm.open_mainfile(filepath=str(ROOT/'model/arroyo-campus.blend'))
build_math(bpy)
bpy.ops.wm.save_as_mainfile(filepath=str(ROOT/'model/arroyo-campus.blend'))
groups={}
for obj in list(bpy.data.objects):
    if obj.type=='MESH':
        key=(obj.parent.name if obj.parent else '',obj.data.materials[0].name if obj.data.materials else '')
        groups.setdefault(key,[]).append(obj)
for items in groups.values():
    if len(items)<2: continue
    bpy.ops.object.select_all(action='DESELECT')
    for obj in items: obj.select_set(True)
    bpy.context.view_layer.objects.active=items[0]
    bpy.ops.object.join()
bpy.ops.export_scene.gltf(filepath=str(ROOT/'public/models/arroyo-campus.glb'),export_format='GLB',export_extras=True,export_cameras=False,export_lights=False)
print('MATH REBUILD COMPLETE',flush=True)
