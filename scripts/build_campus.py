"""Build the outdoor prototype from source-derived meter coordinates.
Run with Blender --background --python scripts/build_campus.py.
"""
import bpy, bmesh, json, math, random
from pathlib import Path
from mathutils import Vector

ROOT = Path(__file__).resolve().parents[1]
data = json.loads((ROOT / 'data/campus.json').read_text())
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)
random.seed(49)

def material(name, color, roughness=0.85):
    m=bpy.data.materials.new(name);m.diffuse_color=(*color,1);m.use_nodes=True
    bs=m.node_tree.nodes.get('Principled BSDF');bs.inputs['Base Color'].default_value=(*color,1);bs.inputs['Roughness'].default_value=roughness
    return m

mats={
 'fenceMetal':material('Galvanized fence steel',(0.39,0.43,0.44),.48),
 'wall':material('Warm white stucco',(0.79,0.77,0.66)),
 'brick':material('Brick accents',(0.42,0.22,0.15)),
 'roof':material('Light gray roofs',(0.67,0.69,0.68)),
 'roofWarm':material('Warm roof tiles',(0.42,0.25,0.17)),
 'fascia':material('Roof fascia',(0.36,0.24,0.20)),
 'blue':material('Arroyo blue',(0.06,0.25,0.52)),
 'glass':material('Simplified window bands',(0.10,0.19,0.24),0.35),
 'grass':material('Campus lawn',(0.29,0.45,0.29)),
 'field':material('Playing field',(0.21,0.43,0.28)),
 'track':material('Running track',(0.095,0.11,0.12)),
 'dirt':material('Baseball infield',(0.56,0.36,0.22)),
 'canopy':material('Walkway soffit',(0.84,0.82,0.72)),
 'post':material('Gray walkway columns',(0.37,0.42,0.40)),
 'stand':material('Aluminum bleachers',(0.64,0.68,0.70)),
 'solar':material('Solar panels',(0.075,0.14,0.23)),
 'court':material('Tennis courts',(0.13,0.39,0.42)),
 'paving':material('Concrete courtyards',(0.66,0.67,0.64)),
 'road':material('Asphalt',(0.26,0.31,0.34)),
 'white':material('Court markings',(0.91,0.92,0.87)),
 'tree':material('Tree crown',(0.20,0.37,0.22)),
 'treeLight':material('Tree crown light',(0.29,0.46,0.26)),
 'trunk':material('Tree trunk',(0.32,0.27,0.19)),
 'edge':material('Campus foundation',(0.57,0.64,0.64))
}
def coords(p,h=0):return (p[0],-p[1],h)
def mesh(name, verts, faces, mat, parent=None):
    me=bpy.data.meshes.new(name);me.from_pydata(verts,[],faces);me.update()
    obj=bpy.data.objects.new(name,me);bpy.context.collection.objects.link(obj);obj.data.materials.append(mats[mat]);obj.parent=parent
    bm=bmesh.new();bm.from_mesh(me);bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces));bm.to_mesh(me);bm.free()
    return obj
def flat(name, poly, h, mat, parent=None):
    return mesh(name,[coords(p,h) for p in poly['vertices']],poly['triangles'],mat,parent)
def box(name,p,size,h,mat,rotation=0,parent=None):
    bpy.ops.mesh.primitive_cube_add(size=1,location=coords(p,h));o=bpy.context.object;o.name=name;o.dimensions=size;o.rotation_euler[2]=rotation;o.data.materials.append(mats[mat]);o.parent=parent;bpy.ops.object.transform_apply(location=False,rotation=False,scale=True);o.select_set(False);return o
def strip(name,a,b,width,h,mat,parent=None,depth=0.08):
    dx=b[0]-a[0];dz=b[1]-a[1];return box(name,[(a[0]+b[0])/2,(a[1]+b[1])/2],[math.hypot(dx,dz),width,depth],h,mat,-math.atan2(dz,dx),parent)
def ringlines(name,ring,h,mat,width=0.16,parent=None):
    for i,a in enumerate(ring):strip(name,a,ring[(i+1)%len(ring)],width,h,mat,parent)
def contains(p,ring):
    x,z=p;hit=False;j=len(ring)-1
    for i in range(len(ring)):
        a,b=ring[i],ring[j]
        if (a[1]>z)!=(b[1]>z) and x<(b[0]-a[0])*(z-a[1])/(b[1]-a[1])+a[0]:hit=not hit
        j=i
    return hit

box('Extended viewing ground',[0,0],[1000,900,.1],-3.2,'paving')
flat('Campus lawn',data['ground'],0,'grass')
ringlines('Site boundary',data['boundary'],-1.5,'edge',1.8)
for i,a in enumerate(data['boundary']):
    b=data['boundary'][(i+1)%len(data['boundary'])]
    mesh('Campus plinth',[coords(a,0),coords(b,0),coords(b,-3),coords(a,-3)],[(0,1,2,3)],'edge')
# The aerial reference shows lawns and separate courtyards between the academic
# buildings. Keep those spaces open so the model reads as a walkable campus;
# small aprons and plazas provide the paved areas without one large slab.
for plaza in data['plazas']:flat(plaza['id'],plaza,.08,'paving')
box('North parking',[229,-60],[32,65,0.12],0.07,'road',-0.12)
box('West parking',[-56,72],[45,54,0.12],0.08,'road',-0.12)
for p in data['paths']:
    for a,b in zip(p['points'],p['points'][1:]):
        # OSM service ways can extend a few metres beyond the school polygon.
        # Keep the generated lane inside the same boundary used for collisions.
        if contains(a,data['boundary']) and contains(b,data['boundary']):
            strip('Campus lane',a,b,5 if p['kind']=='service' else 2,0.15,'road' if p['kind']=='service' else 'paving')

ordered=sorted(data['surfaces'],key=lambda s:0 if s['kind']=='track' else 1)
for s in ordered:
    kind=s['kind'];mat='track' if kind=='track' else 'court' if kind in ['tennis','basketball','volleyball'] else 'dirt' if kind=='baseball' else 'field'
    if kind in ['recreation_ground','hardcourt']:
        # Dark hardscape surrounding the tennis courts, visible in the aerial.
        flat(s['id'],s,0.06,'road')
        continue
    flat(s['id'],s,0.18 if kind=='track' else .24 if kind=='baseball-grass' else 0.22,mat)
    if kind not in ['baseball','baseball-outfield','baseball-grass']:ringlines('Field boundary',s['rings'][0],0.28,'white',0.13)
    pts=s['rings'][0]
    if kind in ['tennis','soccer','american_football','basketball','volleyball'] and len(pts)==4:
        # Use the actual quadrilateral, orient yard/service markings across its long axis.
        if math.dist(pts[0],pts[1])>math.dist(pts[1],pts[2]):pts=[pts[1],pts[2],pts[3],pts[0]]
        a,b,c,d=pts
        mix=lambda p,q,t:[p[0]*(1-t)+q[0]*t,p[1]*(1-t)+q[1]*t]
        for t in ([i/12 for i in range(1,12)] if kind=='american_football' else [0.5]):
            strip('Field marking',mix(a,d,t),mix(b,c,t),0.14,0.29,'white')
        if kind=='tennis':
            for t in [.23,.77]:strip('Tennis service line',mix(a,d,t),mix(b,c,t),0.11,0.29,'white')
            strip('Tennis center',mix(a,b,.5),mix(d,c,.5),0.1,0.29,'white')
            strip('Tennis net',mix(a,d,.5),mix(b,c,.5),0.06,.7,'glass',depth=1)
        if kind=='soccer':
            center=[sum(p[0] for p in pts)/4,sum(p[1] for p in pts)/4]
            circle=[[center[0]+9.15*math.cos(i*math.tau/40),center[1]+9.15*math.sin(i*math.tau/40)] for i in range(40)]
            ringlines('Center circle',circle,.29,'white',.15)
        if kind in ['basketball','volleyball']:
            center=mix(mix(a,b,.5),mix(d,c,.5),.5)
            if kind=='basketball':
                circle=[[center[0]+1.8*math.cos(i*math.tau/24),center[1]+1.8*math.sin(i*math.tau/24)] for i in range(24)]
                ringlines('Basketball center circle',circle,.29,'white',.1)
                for end,t in [(mix(a,b,.5),.16),(mix(d,c,.5),.84)]:
                    strip('Basketball backboard',[end[0]-0.9,end[1]],[end[0]+.9,end[1]],.12,3.2,'white',depth=1.05)
                    box('Basketball hoop post',end,[.14,.14,3.1],1.55,'post')
            else:strip('Volleyball net',mix(a,d,.5),mix(b,c,.5),.06,1.9,'glass',depth=.8)
    if kind=='track':
        center=[sum(p[0] for p in pts)/len(pts),sum(p[1] for p in pts)/len(pts)]
        for scale in [.98,.956,.932,.908]:ringlines('Track lane',[[center[0]+(p[0]-center[0])*scale,center[1]+(p[1]-center[1])*scale] for p in pts],.3,'white',.1)

for b in data['buildings']:
    parent=bpy.data.objects.new(b['id'],None);bpy.context.collection.objects.link(parent);parent['buildingId']=b['id'];parent['source']=b['source'];parent['heightSource']=b['heightSource'];parent['label']=b['name']
    if b.get('structure')=='stand':
        pts=b['rings'][0];center=[sum(p[0] for p in pts)/len(pts),sum(p[1] for p in pts)/len(pts)]
        along=Vector((-.12,.993));across=Vector((.993,.12))
        projections=[(Vector(p)-Vector(center)).dot(along) for p in pts]
        length=max(projections)-min(projections);center=list(Vector(center)+along*(max(projections)+min(projections))/2)
        width=9.0;rows=18
        for row in range(rows):
            t=(row+.5)/rows;off=(t-.5)*width
            p=list(Vector(center)+across*off);height=.5+(t if center[0]>-160 else 1-t)*5
            strip('Bleacher terrace',list(Vector(p)-along*length/2),list(Vector(p)+along*length/2),width/rows,height/2,'stand',parent,depth=height)
        continue
    # The aerial shows a mix of warm pitched roofs and pale flat roofs.
    warm_roof = b.get('roof')=='pitched'
    height=b['height'];verts=[];faces=[]
    for ring in b['rings']:
        for i,a in enumerate(ring):
            q=ring[(i+1)%len(ring)];n=len(verts);verts.extend([coords(a,.22),coords(q,.22),coords(q,height),coords(a,height)]);faces.append((n,n+1,n+2,n+3))
    mesh(b['name']+' walls',verts,faces,'wall',parent)
    if warm_roof and len(b['rings'][0])==4:
        a,q,c,d=b['rings'][0]
        if math.dist(a,q)>math.dist(q,c):a,q,c,d=q,c,d,a
        m=[(a[0]+q[0])/2,(a[1]+q[1])/2];n=[(d[0]+c[0])/2,(d[1]+c[1])/2]
        rise=min(1.25,math.dist(a,q)*.12)
        mesh('Pitched roof',[coords(a,height),coords(q,height),coords(c,height),coords(d,height),coords(m,height+rise),coords(n,height+rise)],[(0,3,5,4),(4,5,2,1),(0,4,1),(3,2,5)],'roofWarm',parent)
    else:flat(b['name']+' roof',b,height,'roofWarm' if warm_roof else 'roof',parent)
    # A narrow perimeter apron gives each building a visible outdoor edge.
    ringlines('Building apron',b['rings'][0],0.11,'paving',1.05)
    for ring in b['rings']:
        ringlines('Roof fascia',ring,height-.15,'fascia',.22,parent)
        # Windows are repeated stylistic details. They are not measured facade openings.
        for a,q in zip(ring,ring[1:]+ring[:1]):
            length=math.dist(a,q)
            if length<5:continue
            for j in range(1,int(length/4)):
                t=j*4/length;cx=a[0]+(q[0]-a[0])*t;cz=a[1]+(q[1]-a[1])*t
                dx=(q[0]-a[0])/length;dz=(q[1]-a[1])/length
                strip('Window band',[cx-dx*1.15,cz-dz*1.15],[cx+dx*1.15,cz+dz*1.15],.15,2.3,'glass',parent,1.1)
                if height>7:strip('Upper window',[cx-dx*1.15,cz-dz*1.15],[cx+dx*1.15,cz+dz*1.15],.15,6,'glass',parent,1.1)

# Roofs remain overhead; their footprint is not a wall collision polygon.
for path in data['walkways']:
    parent=bpy.data.objects.new('walkway-'+path['id'],None);bpy.context.collection.objects.link(parent)
    parent['walkwayKind']=path['kind']
    for a,b in zip(path['points'],path['points'][1:]):
        strip('Covered walkway paving',a,b,path['width']+.35,.14,'paving',parent)
        strip('Light canopy',a,b,path['width']+.45,path['clearHeight']+.24,'canopy',parent,depth=.25)
        dx=b[0]-a[0];dz=b[1]-a[1];length=math.hypot(dx,dz)
        for sign in [-1,1]:
            offset=[-dz/length*(path['width']/2)*sign,dx/length*(path['width']/2)*sign]
            strip('Canopy edge beam',[a[0]+offset[0],a[1]+offset[1]],[b[0]+offset[0],b[1]+offset[1]],.17,path['clearHeight']+.04,'canopy',parent,depth=.22)
for post in data['posts']:
    bpy.ops.mesh.primitive_cylinder_add(vertices=8,radius=.13,depth=post['height'],location=coords(post['point'],post['height']/2+.13))
    o=bpy.context.object;o.name='Walkway column';o.data.materials.append(mats['post']);o.select_set(False)

# Repeated carport bays and parking lines provide recognizable scale at low cost.
for prefix,x,z,length,angle in [('Cedar',228,-60,62,-.12),('Stadium north',-249,59,66,-.12),('Stadium south',-254,140,53,-.12)]:
    direction=[-math.sin(angle),-math.cos(angle)]
    for offset in ([-7,7] if prefix=='Cedar' else [0]):
        p=[x+offset,z]
        a=[p[0]-direction[0]*length/2,p[1]-direction[1]*length/2];b=[p[0]+direction[0]*length/2,p[1]+direction[1]*length/2]
        strip(prefix+' parking lane',a,b,13,.09,'road')
        strip(prefix+' solar canopy',a,b,8,3.4,'solar',depth=.18)
        for j in range(int(length/6)):
            t=(j+.5)/int(length/6);q=[a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t]
            box('Carport support',q,[.2,.2,3.3],1.7,'post')
            strip('Parking stripe',[q[0]-6,q[1]],[q[0]+6,q[1]],.09,.18,'white')

def tree(p,h):
    bpy.ops.mesh.primitive_cylinder_add(vertices=6,radius=.24,depth=h*.65,location=coords(p,h*.325));o=bpy.context.object;o.name='Simplified tree trunk';o.data.materials.append(mats['trunk']);o.select_set(False)
    bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=1,radius=h*.38,location=coords(p,h*.77));o=bpy.context.object;o.name='Simplified tree canopy';o.scale=(1,1,1.25);o.data.materials.append(mats[random.choice(['tree','treeLight'])]);o.select_set(False)
def segment_distance(p,a,b):
    dx=b[0]-a[0];dz=b[1]-a[1];t=max(0,min(1,((p[0]-a[0])*dx+(p[1]-a[1])*dz)/(dx*dx+dz*dz or 1)))
    return math.hypot(p[0]-a[0]-dx*t,p[1]-a[1]-dz*t)
def free(p):
    if not contains(p,data['boundary']) or any(contains(p,b['rings'][0]) for b in data['buildings']) or any(contains(p,s['rings'][0]) for s in data['surfaces']):return False
    if any(contains(p,q['rings'][0]) for q in data['plazas']):return False
    if any(segment_distance(p,a,b)<w['width']/2+3.5 for w in data['walkways'] for a,b in zip(w['points'],w['points'][1:])):return False
    if any(segment_distance(p,a,b)<4 for w in data['paths'] for a,b in zip(w['points'],w['points'][1:])):return False
    if any(math.dist(p,q)<4 for q in data['walkSpawns'].values()):return False
    return True
for _ in range(170):
    p=[random.uniform(-255,245),random.uniform(-180,195)]
    if free(p):tree(p,random.uniform(4.5,8))
# Concentrate additional landscaping around the academic cluster, matching the
# tree canopy visible around the south-east buildings in the aerial reference.
for _ in range(90):
    p=[random.uniform(-18,208),random.uniform(38,191)]
    if free(p):tree(p,random.uniform(4.5,7.5))

# Simple benches in the central outdoor gathering area.
for x in [51,63,75,87]:
    for z in [65,71]:
        if free([x,z]):box('Outdoor bench',[x,z],[3,.8,.22],.55,'blue')
# Shared geometry and walk-collision source for perimeter fences and gates.
import sys
sys.path.insert(0,str(ROOT/'scripts'))
from campus_fences import build_fences
build_fences(json.loads((ROOT/'data/fences.json').read_text())['fences'],bpy,mesh,mats)

from campus_entrance import build_entrance
build_entrance(bpy,data,mats,material,box,strip,mesh,coords)

from campus_language import build_language
build_language(bpy)

scene=bpy.context.scene
scene.world.color=(.55,.65,.75)
bpy.ops.object.light_add(type='SUN',location=(0,0,200));sun=bpy.context.object;sun.name='Daylight';sun.rotation_euler=(.45,-.45,-.4);sun.data.energy=2.2;sun.data.angle=.25
bpy.ops.object.camera_add(location=(500,-610,540));cam=bpy.context.object;cam.rotation_euler=(Vector((0,0,0))-cam.location).to_track_quat('-Z','Y').to_euler();cam.data.type='ORTHO';cam.data.ortho_scale=760;cam.data.clip_end=2500;scene.camera=cam
scene.render.engine='CYCLES';scene.cycles.samples=16;scene.render.resolution_x=1400;scene.render.resolution_y=1000;scene.render.resolution_percentage=100
scene.view_settings.view_transform='AgX'
(ROOT/'model').mkdir(exist_ok=True);(ROOT/'public/models').mkdir(parents=True,exist_ok=True)
bpy.ops.wm.save_as_mainfile(filepath=str(ROOT/'model/arroyo-campus.blend'))
# Keep separate editable objects in .blend; merge by building and material for web export.
groups={}
for obj in list(bpy.data.objects):
    if obj.type=='MESH':
        key=(obj.parent.name if obj.parent else '',obj.data.materials[0].name)
        groups.setdefault(key,[]).append(obj)
for group in groups.values():
    if len(group)<2:continue
    bpy.ops.object.select_all(action='DESELECT')
    for obj in group:obj.select_set(True)
    bpy.context.view_layer.objects.active=group[0]
    bpy.ops.object.join()
bpy.ops.object.select_all(action='DESELECT')
bpy.ops.export_scene.gltf(filepath=str(ROOT/'public/models/arroyo-campus.glb'),export_format='GLB',export_extras=True,export_cameras=False,export_lights=False)
scene.render.filepath=str(ROOT/'model/campus-overview.png');bpy.ops.render.render(write_still=True)
print(json.dumps({'buildings':len(data['buildings']),'objects':len(bpy.data.objects),'model':'public/models/arroyo-campus.glb'}))
