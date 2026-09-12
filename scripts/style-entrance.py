"""Reference-driven entrance styling, retaining editor IDs and source bounds.
Input snapshots keep this pass repeatable without touching administrator placement.
"""
import bpy, json, math, random
from pathlib import Path
from mathutils import Vector, Matrix, Euler
ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'model/entrance-reference'
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=str(OUT/'source.glb'))
bpy.context.view_layer.update()
roots={o['editorId']:o for o in bpy.data.objects if 'editorId' in o}
def bounds(objects):
    p=[o.matrix_world@v.co for o in objects if o.type=='MESH' for v in o.data.vertices]
    return Vector(tuple(min(v[i] for v in p) for i in range(3))),Vector(tuple(max(v[i] for v in p) for i in range(3)))
def mat(name,color):
    m=bpy.data.materials.new(name);m.diffuse_color=(*color,1);m.use_nodes=True
    bs=m.node_tree.nodes.get('Principled BSDF');bs.inputs['Base Color'].default_value=(*color,1);bs.inputs['Roughness'].default_value=.87
    return m
leaf=[mat('Entrance faceted leaf '+str(i),c) for i,c in enumerate([(0.19,.26,.075),(.29,.36,.12),(.38,.45,.18),(.13,.21,.075),(.47,.52,.24)])]
bark=mat('Entrance branching bark',(.19,.13,.08))
cream=mat('Entrance limestone',(.79,.76,.65)); paving=mat('Entrance warm paving',(.82,.68,.43)); roof=mat('Entrance ivory roof',(.83,.83,.74)); wall=mat('Entrance warm white walls',(.77,.78,.69)); lawn=mat('Entrance living lawn',(.22,.36,.085)); metal=mat('Entrance pale metal',(.63,.66,.62))
original_bounds={k:bounds(list(o.children_recursive)) for k,o in roots.items()}
rng=random.Random(4019)
def mesh(name,vs,fs,materials,parent):
    d=bpy.data.meshes.new(name);d.from_pydata(vs,[],fs);d.update();o=bpy.data.objects.new(name,d);bpy.context.collection.objects.link(o);o.parent=parent
    for m in materials:d.materials.append(m)
    for p in d.polygons:p.material_index=rng.randrange(len(materials));p.use_smooth=False
    return o

def branch(a,b,r0,r1,parent,vs,fs):
    a,b=Vector(a),Vector(b);axis=(b-a).normalized();u=axis.cross(Vector((0,0,1)))
    if u.length<.01:u=axis.cross(Vector((0,1,0)))
    u.normalize();v=axis.cross(u);start=len(vs)
    for p,r in [(a,r0),(b,r1)]:
        for i in range(7):vs.append(tuple(p+r*(u*math.cos(i*math.tau/7)+v*math.sin(i*math.tau/7))))
    for i in range(7):fs.append((start+i,start+(i+1)%7,start+(i+1)%7+7,start+i+7))
    fs.extend([tuple(start+i for i in range(6,-1,-1)),tuple(start+7+i for i in range(7))])

for key in ['tree-entrance-1','tree-entrance-2','tree-entrance-3','tree-entrance-4']:
    root=roots[key];lo,hi=original_bounds[key];p=(lo+hi)/2;h=hi.z-lo.z;rad=min(hi.x-lo.x,hi.y-lo.y)/2
    for o in list(root.children_recursive):
        if o.type=='MESH':bpy.data.objects.remove(o,do_unlink=True)
    # Source GLB roots are identity; all generated coordinates are in Blender world.
    vs=[];fs=[];base=Vector((p.x,p.y,lo.z));top=base+Vector((.1,.08,h*.68))
    branch(base,top,.26,.12,root,vs,fs)
    clusters=[]
    conifer=key=='tree-entrance-1'
    for j in range(7 if conifer else 3):
        z=h*(.36+j*.085) if conifer else h*(.52+j*.13)
        rr=rad*(1-j*.105) if conifer else rad*(.84 if j<2 else .55)
        for i in range(7):
            a=i*math.tau/7+j*.68;q=base+Vector((math.cos(a)*rr*.67,math.sin(a)*rr*.67,z))
            branch(base+Vector((0,0,z*.68)),q,.10,.025,root,vs,fs)
            clusters.append((q,rr*.62,h*(.065 if conifer else .15)))
    mesh('Entrance visible branches',vs,fs,[bark],root)
    vs=[];fs=[]
    for c,r,rz in clusters:
        for j in range(23):
            a=rng.uniform(0,math.tau);rr=rng.uniform(.15,1)*r
            q=c+Vector((math.cos(a)*rr,math.sin(a)*rr,rng.uniform(-1,1)*rz))
            s=rng.uniform(.48,.95);st=len(vs)
            tilt=Euler((rng.uniform(-.9,.9),rng.uniform(-.9,.9),rng.uniform(0,math.tau))).to_matrix()
            # Broad angular leaf masses, open gaps expose branching silhouettes.
            for v in [(0,0,s*.65),(s,0,0),(s*.25,s*.8,0),(-s*.7,s*.5,0),(-s,-s*.2,0),(s*.1,-s*.8,0),(0,0,-s*.38)]:vs.append(tuple(q+tilt@Vector(v)))
            for i in range(1,6):fs.extend([(st,st+i,st+(i%5)+1),(st+6,st+(i%5)+1,st+i)])
    foliage=mesh('Entrance angular foliage',vs,fs,leaf,root)
    for i,poly in enumerate(foliage.data.polygons):poly.material_index=(i//10)%len(leaf)
    bpy.context.view_layer.update()
    children=[o for o in root.children_recursive if o.type=='MESH'];newlo,newhi=bounds(children)
    # Match the old complete-tree bounds, preserving BuildSession's pivot exactly.
    for o in children:
        for v in o.data.vertices:
            w=o.matrix_world@v.co
            w=Vector(tuple(lo[i]+(w[i]-newlo[i])*(hi[i]-lo[i])/(newhi[i]-newlo[i]) for i in range(3)))
            v.co=o.matrix_world.inverted()@w

changed=[]
for key,root in roots.items():
    name=root.get('editorName','');children=[o for o in root.children_recursive if o.type=='MESH']
    lo,hi=original_bounds[key];p=(lo+hi)/2
    entrance=(178<p.x<232 and -116<p.y<-48) or 'entrance' in name.lower() or name.lower() in ('front flower bed',)
    for o in children:
        o.data=o.data.copy()
        for i,old in enumerate(list(o.data.materials)):
            n=old.name.lower() if old else '';replacement=None
            if key in ('admin','business'):
                if 'roof' in n:replacement=roof
                elif any(t in n for t in ('wall','cream')):replacement=wall
            if key.startswith('bench-entrance'):replacement=cream
            if key.startswith('lawn-entrance'):replacement=lawn
            if entrance and key.startswith('decoration'):
                if 'forecourt' in name.lower() or 'sidewalk' in name.lower():replacement=paving
                elif any(t in name.lower() for t in ('lamp','bollard')) and 'banner' not in name.lower():replacement=metal
                elif 'flower' in name.lower() and 'bed' in name.lower():replacement=mat('Entrance dark planting soil',(.20,.15,.08))
                if 'shrub' in name.lower():
                    replacement=leaf[1]
                    for poly in o.data.polygons:poly.use_smooth=False
            if replacement:o.data.materials[i]=replacement;changed.append(key)
# Replace the little block-shaped flower groups with stems and faceted blossoms.
pink=mat('Entrance rose petals',(.72,.20,.13));petal=mat('Entrance cream petals',(.94,.72,.43))
for key,root in roots.items():
    if 'small flower cluster' not in root.get('editorName','').lower():continue
    lo,hi=original_bounds[key];center=(lo+hi)/2
    for child in list(root.children_recursive):
        if child.type=='MESH':bpy.data.objects.remove(child,do_unlink=True)
    vs=[];fs=[]
    for i in range(7):
        a=i*math.tau/7;x=center.x+math.cos(a)*.18;y=center.y+math.sin(a)*.18;z=lo.z+.35+rng.random()*.2
        branch((x,y,lo.z),(x,y,z),.018,.009,root,vs,fs)
        for k in range(5):
            angle=k*math.tau/5
            bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=1,radius=.075,location=(x+math.cos(angle)*.06,y+math.sin(angle)*.06,z))
            o=bpy.context.object;o.parent=root;o.data.materials.append(pink if i%2 else petal)
    mesh('Flower stems',vs,fs,[leaf[0]],root)
    bpy.context.view_layer.update()
    children=[o for o in root.children_recursive if o.type=='MESH'];a,b=bounds(children)
    for o in children:
        for v in o.data.vertices:
            w=o.matrix_world@v.co
            w=Vector(tuple(lo[i]+(w[i]-a[i])*(hi[i]-lo[i])/(b[i]-a[i]) for i in range(3)))
            v.co=o.matrix_world.inverted()@w
bpy.context.view_layer.update()
# Assert every pre-existing model retains its placement anchor.
for key,root in roots.items():
    lo,hi=bounds(list(root.children_recursive));oldlo,oldhi=original_bounds[key]
    assert (lo-oldlo).length<.002 and (hi-oldhi).length<.002,key
bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'entrance-styled.blend'))
bpy.ops.export_scene.gltf(filepath=str(OUT/'entrance-styled.glb'),export_format='GLB',export_extras=True,export_cameras=False,export_lights=False)
print('STYLED',len(set(changed)),'material groups and four trees',flush=True)
# Render the user's saved layout: geometry moves about the same base-centered pivot as BuildSession.
layout=json.loads((OUT/'layout.json').read_text())
template_meshes={key:[(child,child.matrix_world.copy()) for child in root.children_recursive if child.type=='MESH'] for key,root in roots.items()}
for item in layout['objects']:
    source=roots[item['templateId']]
    if item['origin']=='added':
        root=bpy.data.objects.new(item['id'],None);bpy.context.collection.objects.link(root)
        for child,original_matrix in template_meshes[item['templateId']]:
            c=child.copy();c.data=child.data;root.users_collection[0].objects.link(c);c.parent=root;c.matrix_world=original_matrix;c.hide_render=False
    else:root=source
    if item['deleted']:
        for child in root.children_recursive:child.hide_render=True
        continue
    lo,hi=original_bounds[item['templateId']];pivot=Vector(((lo.x+hi.x)/2,(lo.y+hi.y)/2,lo.z))
    pos=item['position'];scale=item['scale'];angle=item['rotation'][1]
    trans=Matrix.Translation(Vector((pos[0],-pos[2],pos[1])))@Matrix.Rotation(angle,4,'Z')@Matrix.Diagonal(Vector((scale[0],scale[2],scale[1],1)))@Matrix.Translation(-pivot)
    for child in root.children_recursive:
        if child.type=='MESH':child.matrix_world=trans@child.matrix_world
world=bpy.data.worlds.new('Clear daylight');bpy.context.scene.world=world;world.use_nodes=True;world.node_tree.nodes['Background'].inputs[0].default_value=(.50,.66,.84,1);world.node_tree.nodes['Background'].inputs[1].default_value=.65
bpy.ops.object.light_add(type='SUN',location=(240,-40,80));sun=bpy.context.object;sun.rotation_euler=(.35,-.5,-.45);sun.data.energy=2.5;sun.data.angle=.10
bpy.ops.object.camera_add(location=(232,-103,3.5));camera=bpy.context.object;target=Vector((195,-78,3.5));camera.rotation_euler=(target-camera.location).to_track_quat('-Z','Y').to_euler();camera.data.lens=32
scene=bpy.context.scene;scene.camera=camera;scene.render.engine='CYCLES';scene.cycles.samples=24;scene.cycles.use_denoising=True;scene.render.resolution_x=1400;scene.render.resolution_y=900;scene.render.resolution_percentage=100
scene.view_settings.view_transform='AgX';scene.view_settings.exposure=.7
scene.render.filepath=str(OUT/'entrance-preview.png');bpy.ops.render.render(write_still=True)
