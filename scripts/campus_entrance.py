"""Entrance detail pass based on the supplied Cedar Ave street photograph."""
import math
import random
import json
from pathlib import Path

def build_entrance(bpy, data, mats, material, box, strip, mesh, coords):
    # Replace the prototype's randomly scattered trees in this reference area.
    for obj in list(bpy.data.objects):
        if obj.name.startswith(('Simplified tree trunk','Simplified tree canopy')) and 180 < obj.location.x < 228 and 50 < -obj.location.y < 126:
            bpy.data.objects.remove(obj,do_unlink=True)
    rng=random.Random(4921)
    for key,color in [('entryCream',(.86,.84,.73)),('entryRoof',(.36,.25,.20)),('entryGreen',(.16,.28,.10)),('entryLeaf',(.29,.40,.15)),('entryCurb',(.64,.07,.075)),('entryDark',(.08,.10,.10)),('entryBlue',(.025,.13,.40))]:
        mats[key]=material(key,color)
    parent=bpy.data.objects.new('entrance-details',None);bpy.context.collection.objects.link(parent)
    parent['source']='Cedar Ave photograph 2026-09-06 16.31.19; approximate dimensions'
    def cube(name,p,size,h,mat):return box(name,p,size,h,mat,parent=parent)
    def shrub(p,s=1):
        bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=2,radius=1,location=coords(p,.6*s))
        o=bpy.context.object;o.name='Entrance shrub';o.scale=(s,.7*s,.6*s);o.data.materials.append(mats['entryGreen']);o.parent=parent
        for face in o.data.polygons:face.use_smooth=True
    layout=json.loads((Path(__file__).resolve().parents[1]/'data/entrance-layout.json').read_text())
    def cylinder(name,p,r,height,z,mat):
        bpy.ops.mesh.primitive_cylinder_add(vertices=10,radius=r,depth=height,location=coords(p,z))
        o=bpy.context.object;o.name=name;o.parent=parent;o.data.materials.append(mats[mat]);return o
    def foliage(p,z,scale):
        bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=2,radius=1,location=coords(p,z))
        o=bpy.context.object;o.name='Entrance layered foliage';o.scale=scale;o.parent=parent
        for v in o.data.vertices:v.co*=rng.uniform(.85,1.13)
        o.data.materials.append(mats['entryGreen']);o.data.materials.append(mats['entryLeaf'])
        for face in o.data.polygons:face.use_smooth=True;face.material_index=int(rng.random()<.25)
    def crown(item):
        p,h,r,kind=item['p'],item['h'],item['r'],item['kind']
        cylinder('Entrance mature trunk',p,.24,h*.75,h*.375,'trunk')
        layers=5 if kind=='cedar' else 3
        for layer in range(layers):
            radius=r*(1-layer/(layers+1)) if kind in ('cedar','tall') else r*(1-abs(layer-1)*.18)
            z=h*.46+layer*h*.12
            for i in range(5):
                a=i*math.tau/5+layer*.7
                q=[p[0]+math.cos(a)*radius*.45,p[1]+math.sin(a)*radius*.45]
                foliage(q,z,(radius*.68,radius*.68,.6 if kind=='cedar' else radius*.70))
    # Fan-shaped lawn islands, interrupted low retaining seats and diagonal walks.
    pts=[[180,96],[215,101],[228,54],[182,53]]
    mesh('Entrance forecourt',[coords(p,.13) for p in pts],[(0,1,2),(0,2,3)],'entryCream',parent)
    for ring in layout['lawns']:
        mesh('Angular entrance lawn',[coords(p,.17) for p in ring],[(0,1,2),(0,2,3)],'grass',parent)
    for a,b in layout['seats']:
        strip('Low concrete seat wall',a,b,.6,.39,'entryCream',parent,depth=.48)
        middle=[(a[0]+b[0])/2,(a[1]+b[1])/2]
        cube('Seat recessed light',middle,[.13,.65,.10],.38,'stand')
    for item in layout['trees']:crown(item)
    for p in [[199+i*1.3,104] for i in range(6)]+[[214+i*.65,83-i*.1] for i in range(9)]:shrub(p,.65)
    # Front rose bed, with restrained small flower clusters.
    cube('Front flower bed',[215,83],[3,6,.025],.18,'dirt')
    for i in range(8):
        q=[214.5+(i%2),80.5+(i//2)*1.3];shrub(q,.45)
        cube('Small flower cluster',q,[.15,.15,.10],.7,'brick')
    # Music enclosure gate opens onto this forecourt parking strip.
    parking=[[183,51],[225,48.5],[222,61],[182,61]]
    mesh('Office music foreground parking',[coords(p,.20) for p in parking],[(0,1,2),(0,2,3)],'road',parent)
    for x in [184,187,190,193,196,213,216,219]:
        strip('Office parking bay stripe',[x,52],[x,57],.09,.23,'white',parent)
    # Clear six-metre aisle directly aligned with the open gate.
    # Music frontage: continuous dark paved yard replaces invented grass/cross paths.
    yard=[[218,44],[232,48],[248,-16],[219,-20],[217,23],[197,31],[197,43]]
    # Fan triangles use a point inside this concave service court.
    center=[225,20]
    mesh('Music paved service yard',[coords(center,.32)]+[coords(p,.32) for p in yard],
         [(0,i+1,(i+1)%len(yard)+1) for i in range(len(yard))],'road',parent)
    planting=[[230,47],[233,48],[248,-16],[245,-16]]
    mesh('Narrow roadside planting',[coords(p,.35) for p in planting],[(0,1,2),(0,2,3)],'dirt',parent)
    for i in range(14):
        t=(i+.5)/14;shrub([231+15*t,46-61*t],.38)
    strip('Music frontage sidewalk',[235,49],[251,-17],2.3,.24,'paving',parent,depth=.13)
    # Small paved entrance spur visible beside the projecting music-room wall.
    strip('Music entrance apron',[213,39],[226,39],2.4,.36,'entryCream',parent,depth=.09)
    cube('Music exterior service enclosure',[220,21],[2.3,3.6,1.6],1.15,'brick')
    cube('Music exterior equipment top',[220,21],[2.1,3.3,.18],2.02,'stand')
    for obj in list(bpy.data.objects):
        if obj.name.startswith(('Simplified tree trunk','Simplified tree canopy')) and 216<obj.location.x<251 and -22< -obj.location.y <49:
            bpy.data.objects.remove(obj,do_unlink=True)
    # Tall pedestal sign near language-center end of the forecourt.
    cube('School sign pedestal',[207,102],[.7,.8,3.9],2.08,'entryCream')
    cube('School electronic sign housing',[207,102],[.85,2.6,1.65],4.85,'entryDark')
    cube('School electronic sign screen',[207.44,102],[.025,2.25,1.03],4.65,'entryBlue')
    def text(name,body,p,h,size,mat):
        curve=bpy.data.curves.new(name,'FONT');curve.body=body;curve.align_x='CENTER';curve.align_y='CENTER';curve.size=size;curve.extrude=.003
        obj=bpy.data.objects.new(name,curve);bpy.context.collection.objects.link(obj);obj.location=coords(p,h);obj.rotation_euler=(math.pi/2,0,math.pi/2);obj.data.materials.append(mats[mat]);obj.parent=parent
        bpy.ops.object.select_all(action='DESELECT');obj.select_set(True);bpy.context.view_layer.objects.active=obj;bpy.ops.object.convert(target='MESH');obj.select_set(False)
    text('School sign title','ARROYO',[207.46,102],5.37,.34,'white')
    text('School sign display','KNIGHTS',[207.47,102],4.66,.26,'white')
    # Flag pole and simple striped flag; no invented school emblem.
    cube('Entrance flagpole',[198,59],[.10,.10,8],4.12,'stand')
    for i in range(13):
        cube('Flag stripe',[198,58.2],[.035,1.6,.065],7.88-i*.065,'white' if i%2 else 'entryCurb')
    cube('Flag canton',[198.025,58.63],[.025,.75,.455],7.69,'entryBlue')
    for p in layout['lamps']:
        cylinder('Entrance lamp post',p,.07,4.2,2.2,'stand')
        bpy.ops.mesh.primitive_cone_add(vertices=16,radius1=.09,radius2=.45,depth=.18,location=coords(p,4.36))
        o=bpy.context.object;o.name='Shallow dish lamp';o.data.materials.append(mats['entryCream']);o.parent=parent
        cube('Campus lamp banner',[p[0],p[1]-.42],[.035,.7,1.05],3.22,'entryDark')
        text('Banner KNIGHTS','KNIGHTS',[p[0]+.03,p[1]-.42],2.98,.105,'white')
    # Red curb follows Cedar boundary, leaving the entrance crossing unpainted.
    for a,b in [([217,98],[226,62]),([209,133],[216,106])]:
        strip('Red Cedar curb',a,b,.25,.16,'entryCurb',parent,depth=.20)
    for z in [108,110,112,114]:cylinder('Entrance bollard',[208,z],.09,.85,.55,'stand')
    # Replace generic facade details only on the two reference buildings.
    for building_id in ('admin','business'):
        building=next(b for b in data['buildings'] if b['id']==building_id)
        building_parent=bpy.data.objects[building_id]
        original_height=building['height']
        for obj in list(building_parent.children):
            if obj.type=='MESH':
                factor=3.4/original_height
                obj.scale.z*=factor
                obj.location.z*=factor
            if 'walls' in obj.name:obj.data.materials.clear();obj.data.materials.append(mats['entryCream'])
            if 'Window band' in obj.name:bpy.data.objects.remove(obj,do_unlink=True)
        if building_id=='business':
            # Keep the street-facing gable largely blank, as in the photograph.
            strip('Language entrance door',[193,106.2],[194.1,106.3],.16,1.35,'glass',building_parent,depth=2.2)
            for x in [163,170,177,184]:strip('Language shaded windows',[x,104],[x+2.8,104.25],.17,2.1,'glass',building_parent,depth=1.1)
        else:
            for j in range(10):
                z=55.3+j*2.65;x=171.85-(z-54.63)*2.25/28.56+.08
                strip('Office continuous windows',[x,z],[x-.19,z+2.5],.13,1.85,'glass',building_parent,depth=1.4)
                cube('Office window mullion',[x+.03,z],[.18,.075,1.5],1.85,'entryDark')
            cube('Office entry brick accent',[179,52],[.18,3.3,2.7],1.55,'brick')
            # Add a shallow pitched roof over the main north–south office wing.
            ring=[[168.3,48.5],[180,49.6],[175.8,94.7],[163.8,93.5]]
            h=3.4;a,b,c,d=ring
            m=[(a[0]+b[0])/2,(a[1]+b[1])/2];n=[(c[0]+d[0])/2,(c[1]+d[1])/2]
            mesh('Office pitched roof',[coords(p,h+.05) for p in ring]+[coords(m,h+1.05),coords(n,h+1.05)],[(0,3,5,4),(4,5,2,1),(0,4,1),(3,2,5)],'entryRoof',building_parent)
