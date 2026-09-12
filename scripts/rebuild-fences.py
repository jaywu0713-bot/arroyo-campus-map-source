"""Replace only fence objects in the editable campus and export the full web model.

Run after node scripts/prepare-fences.mjs:
Blender --background --python scripts/rebuild-fences.py
The existing buildings, entrances, materials and other objects are preserved.
"""
import bpy
import bmesh
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'scripts'))
from campus_fences import build_fences

bpy.ops.wm.open_mainfile(filepath=str(ROOT / 'model/arroyo-campus.blend'))
records = json.loads((ROOT / 'data/fences.json').read_text())
removed = []
for obj in list(bpy.data.objects):
    if obj.name.startswith('fence-'):
        removed.append(obj.name)
        for child in list(obj.children_recursive):
            bpy.data.objects.remove(child, do_unlink=True)
        bpy.data.objects.remove(obj, do_unlink=True)

material = bpy.data.materials.get('Galvanized fence steel')
if material is None:
    raise RuntimeError('Expected campus fence material was not found')

def mesh(name, verts, faces, mat, parent=None):
    data = bpy.data.meshes.new(name)
    data.from_pydata(verts, [], faces)
    data.update()
    obj = bpy.data.objects.new(name, data)
    bpy.context.collection.objects.link(obj)
    obj.data.materials.append(material)
    obj.parent = parent
    bm = bmesh.new()
    bm.from_mesh(data)
    bmesh.ops.recalc_face_normals(bm, faces=list(bm.faces))
    bm.to_mesh(data)
    bm.free()
    return obj

build_fences(records['fences'], bpy, mesh, {'fenceMetal': material})
bpy.context.scene['fenceRevision'] = records['revision']
bpy.ops.wm.save_as_mainfile(filepath=str(ROOT / 'model/arroyo-campus.blend'))

# Match the full builder's parent/material batching without changing the saved
# editable model. Keep building and fence groups independent in the GLB.
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
bpy.ops.export_scene.gltf(
    filepath=str(ROOT / 'public/models/arroyo-campus.glb'),
    export_format='GLB', export_extras=True,
    export_cameras=False, export_lights=False,
)
print(json.dumps({'removedOldFenceGroups': len(removed), 'newFenceGroups': len(records['fences']), 'revision': records['revision']}), flush=True)

# A render from the saved campus camera verifies the actual generated meshes.
scene = bpy.context.scene
scene.render.resolution_percentage = 75
scene.cycles.samples = 12
scene.render.filepath = str(ROOT / 'model/campus-overview.png')
bpy.ops.render.render(write_still=True)
