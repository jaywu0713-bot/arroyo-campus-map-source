"""Photo-led first pass for the math classroom courtyard."""
import math, random, bmesh
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
def build_math(bpy):
    old=bpy.data.objects.get('math-landscape')
    if old:
        for o in list(old.children_recursive): bpy.data.objects.remove(o,do_unlink=True)
        bpy.data.objects.remove(old,do_unlink=True)
    group=bpy.data.objects.new('math-landscape',None); bpy.context.collection.objects.link(group)
    def mat(name,c,rough=.85,emit=0):
        m=bpy.data.materials.get(name) or bpy.data.materials.new(name); m.diffuse_color=(*c,1); m.use_nodes=True; b=m.node_tree.nodes.get('Principled BSDF'); b.inputs['Base Color'].default_value=(*c,1); b.inputs['Roughness'].default_value=rough
        if emit: b.inputs['Emission Color'].default_value=(*c,1); b.inputs['Emission Strength'].default_value=emit
        return m
    grass=mat('Math courtyard soil grass',(.29,.45,.29)); cream=mat('Math toilet stucco',(.72,.71,.61)); roof=mat('Math toilet roof',(.34,.22,.16)); door=mat('Math toilet doors',(.24,.31,.32)); light=mat('Math corridor light',(1.0,.72,.38),.4,1.2); trunk=mat('Math tree trunk',(.25,.19,.13)); leaf=mat('Math tree canopy',(.08,.15,.07)); leaf2=mat('Math tree canopy light',(.16,.27,.10))
    def mesh(name,vs,fs,ma):
        me=bpy.data.meshes.new(name); me.from_pydata(vs,[],fs); me.update(); o=bpy.data.objects.new(name,me); bpy.context.collection.objects.link(o); o.data.materials.append(ma); o.parent=group; bm=bmesh.new(); bm.from_mesh(me); bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces)); bm.to_mesh(me); bm.free(); return o
    def p(x,z,y=0): return (x,-z,y)
    poly=[(160,170),(180,171),(182,199),(160,198)]; mesh('Math courtyard',[p(x,z,.035) for x,z in poly],[(0,1,2,3)],grass)
    # Low toilet row from the aerial blue rectangle; the former floating
    # facade panels are intentionally omitted because they caused the marked
    # intersection artifact.
    # The toilets sit in the north-south passage between Language Center and
    # Math, tying into the existing covered walkway rather than the courtyard.
    toilet=[(198.0,168.0),(202.0,168.0),(202.0,196.0),(198.0,196.0)]
    mesh('Math toilet walls',[p(x,z,.05) for x,z in toilet]+[p(x,z,2.55) for x,z in toilet],[(0,1,5,4),(1,2,6,5),(2,3,7,6),(3,0,4,7)],cream)
    mesh('Math toilet roof',[p(x,z,2.58) for x,z in toilet],[(0,1,2,3)],roof)
    for i in range(5):
        z=170.0+i*5.0; mesh('Math toilet stall door',[p(197.94,z,.45),p(197.94,z+3.2,.45),p(197.94,z+3.2,2.15),p(197.94,z,2.15)],[(0,1,2,3)],door)
    mesh('Math toilet corridor connection',[p(196.0,178.0,2.6),p(198.2,178.0,2.6),p(198.2,181.5,2.6),p(196.0,181.5,2.6)],[(0,1,2,3)],roof)
    def tree(cx,cz,r,h):
        mesh('Math mature trunk',[p(cx-.32,cz-.32,0),p(cx+.32,cz-.32,0),p(cx+.22,cz+.22,h*.62),p(cx-.22,cz+.22,h*.62)],[(0,1,2,3)],trunk); random.seed(int(cx*10))
        for i in range(7):
            ang=i*math.tau/7; x=cx+math.cos(ang)*r*.34; z=cz+math.sin(ang)*r*.34; bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=1,radius=r*.48,location=p(x,z,h*.72)); o=bpy.context.object; o.name='Math layered canopy'; o.scale=(1.15,.85,.8); o.data.materials.append(leaf2 if i%3==0 else leaf); o.parent=group
    tree(166,180,3.5,7.2); tree(168,193,3.2,6.8)
    for x,z in [(161,174),(161,182),(161,190),(180,176),(181,184),(181,192)]:
        bpy.ops.mesh.primitive_uv_sphere_add(segments=8, ring_count=4, radius=.16, location=p(x,z,2.95)); o=bpy.context.object; o.name='Math corridor light'; o.data.materials.append(light); o.parent=group
    return {'revision':'math-courtyard-20260910-v1'}
