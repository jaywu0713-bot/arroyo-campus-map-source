"""Export the existing mesh geometry as complete editable objects, without
changing the saved campus or its appearance. Run after rebuilding the .blend.
"""
import bpy, json, math, hashlib
from pathlib import Path
from mathutils import Vector
ROOT=Path(__file__).resolve().parents[1]
bpy.ops.wm.open_mainfile(filepath=str(ROOT/'model/arroyo-campus.blend'))
data=json.loads((ROOT/'data/campus.json').read_text())
meshes=[o for o in bpy.data.objects if o.type=='MESH']
editable=[]
def center(o):
    pts=[o.matrix_world@Vector(p) for p in o.bound_box]
    return [(min(p.x for p in pts)+max(p.x for p in pts))/2,-(min(p.y for p in pts)+max(p.y for p in pts))/2]
def bounds_ring(o):
    pts=[o.matrix_world@Vector(p) for p in o.bound_box]
    x0,x1=min(p.x for p in pts),max(p.x for p in pts)
    z0,z1=-max(p.y for p in pts),-min(p.y for p in pts)
    return [[x0,z0],[x1,z0],[x1,z1],[x0,z1]]
def attach(o,parent):
    matrix=o.matrix_world.copy();o.parent=parent;o.matrix_world=matrix
def mark(o,id,name,category,collisions=None):
    o['editorId']=id;o['editorName']=name;o['editorCategory']=category
    o['collisionRingsJson']=json.dumps(collisions or [])
    editable.append(o);return o
def group(id,name,category,objects,collisions=None):
    o=bpy.data.objects.new(id,None);bpy.context.collection.objects.link(o)
    for child in objects:attach(child,o)
    return mark(o,id,name,category,collisions)
def distance(a,b):return math.hypot(a[0]-b[0],a[1]-b[1])

for b in data['buildings']:
    o=bpy.data.objects.get(b['id'])
    if o:mark(o,b['id'],b['name'],'building',b['rings'])
for o in list(bpy.data.objects):
    if o.name.startswith('fence-') and o.type=='EMPTY':
        points=json.loads(o['points']);rings=[]
        for a,b in zip(points,points[1:]):
            length=distance(a,b)
            if length<.001:continue
            nx,nz=-(b[1]-a[1])/length*.13,(b[0]-a[0])/length*.13
            rings.append([[a[0]+nx,a[1]+nz],[b[0]+nx,b[1]+nz],[b[0]-nx,b[1]-nz],[a[0]-nx,a[1]-nz]])
        mark(o,o.name,'铁栏杆 · '+o.name.removeprefix('fence-'),'fence',rings)

# The source exporter had detached columns. Assign each actual column back to
# its walkway using the original generator's exact column coordinates.
paths={w['id']:w for w in data['walkways']};candidates=[];columns={id:[] for id in paths}
for id,w in paths.items():
    for a,b in zip(w['points'],w['points'][1:]):
        length=distance(a,b);dx,dz=(b[0]-a[0])/length,(b[1]-a[1])/length;d=2.5
        while d<length-1.5:
            for sign in (-1,1):candidates.append((id,[a[0]+dx*d-dz*(w['width']/2+.05)*sign,a[1]+dz*d+dx*(w['width']/2+.05)*sign]))
            d+=6
for o in meshes:
    if o.name.startswith('Walkway column'):
        id,p=min(candidates,key=lambda q:distance(center(o),q[1]));assert distance(center(o),p)<.01
        columns[id].append(bounds_ring(o));attach(o,bpy.data.objects['walkway-'+id])
for id,w in paths.items():mark(bpy.data.objects['walkway-'+id],'walkway-'+id,'连廊 · '+id,'walkway',columns[id])

for prefix,crown_prefix,kind in [('Simplified tree trunk','Simplified tree canopy','校园树木'),('Entrance mature trunk','Entrance layered foliage','入口大树'),('Math mature trunk','Math layered canopy','数学庭院树')]:
    trunks=sorted([o for o in meshes if o.name.startswith(prefix)],key=lambda o:(center(o)[0],center(o)[1]))
    crowns=[o for o in meshes if o.name.startswith(crown_prefix)]
    for index,trunk in enumerate(trunks):
        parts=[trunk]+[c for c in crowns if min(trunks,key=lambda t:distance(center(c),center(t)))==trunk]
        assert len(parts)>1
        group('tree-'+prefix.split()[0].lower()+'-'+str(index+1),kind+' '+str(index+1),'tree',parts,[bounds_ring(trunk)])
for o in list(bpy.data.objects):
    if o.type=='EMPTY' and o.name.startswith('language-') and 'tree' in o.name:
        trunks=[c for c in o.children_recursive if 'trunk' in c.name.lower() and c.type=='MESH']
        mark(o,o.name,'语言中心大树 · '+o.name.replace('language-',''),'tree',[bounds_ring(t) for t in trunks])

for index,o in enumerate(sorted([o for o in meshes if o.name.startswith('Angular entrance lawn')],key=lambda o:o.name)):
    group('lawn-entrance-'+str(index+1),'入口草坪 '+str(index+1),'grass',[o])
for id in ['language-central-lawn','language-street-lawn','language-rear-garden','language-south-lawn']:
    group('lawn-'+id,'语言中心草坪 · '+id,'grass',[o for o in meshes if o.name.startswith(id+' turf')])
group('lawn-math','数学区域草坪','grass',[bpy.data.objects['Math courtyard']])
toilets=[o for o in meshes if o.name.startswith('Math toilet ')]
group('toilet-math','厕所','toilet',toilets,[bounds_ring(bpy.data.objects['Math toilet walls'])])

# The low concrete seat walls in front of the main entrance are real scene
# objects and should be editable individually, just like buildings and fences.
for index, seat in enumerate([o for o in meshes if o.name.startswith('Low concrete seat wall')], 1):
    group('bench-entrance-'+str(index), '正门石头椅子 '+str(index), 'building', [seat], [bounds_ring(seat)])

# Make every remaining visible mesh independently editable. These are the
# environmental and decorative pieces that are intentionally not part of a
# larger logical building, fence, tree, lawn, toilet, or walkway group.
decor_index = 1
for obj in list(meshes):
    owner = obj
    while owner and 'editorId' not in owner:
        owner = owner.parent
    if owner or obj.hide_render or not obj.visible_get():
        continue
    safe_name = obj.name.strip() or '环境装饰'
    group('decoration-'+str(decor_index), safe_name, 'decoration', [obj], [bounds_ring(obj)])
    decor_index += 1

# Preserve the complete courtyard geometry; consolidate only within one logical
# object. Original names stay on child groups for labels and provenance.
groups={}
for o in meshes:
    owner=o
    while owner and 'editorId' not in owner:owner=owner.parent
    key=(owner.name if owner else '',tuple(m.name if m else '' for m in o.data.materials))
    groups.setdefault(key,[]).append(o)
for objects in groups.values():
    if len(objects)<2:continue
    bpy.ops.object.select_all(action='DESELECT')
    for o in objects:o.select_set(True)
    bpy.context.view_layer.objects.active=objects[0];bpy.ops.object.join()
for o in editable:assert any(c.type=='MESH' for c in o.children_recursive),o.name
bpy.ops.export_scene.gltf(filepath=str(ROOT/'public/models/arroyo-editor.glb'),export_format='GLB',export_extras=True,export_cameras=False,export_lights=False)
revision=hashlib.sha256((ROOT/'public/models/arroyo-editor.glb').read_bytes()).hexdigest()[:16]
(ROOT/'data/editor-assets.json').write_text(json.dumps({'revision':revision,'url':'/models/arroyo-editor.glb','objects':len(editable)},indent=2)+'\n')
print('EDITOR EXPORT: '+str(len(editable))+' complete objects; '+revision,flush=True)
