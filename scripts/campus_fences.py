"""Reference-based fencing, batched per section for economical web export."""
import math
import json

def build_fences(records, bpy, mesh, mats):
    for fence in records:
        vertices, faces = [], []
        def beam(a, b, width):
            # Box beam between arbitrary 3D points, with stable orthogonal frame.
            from mathutils import Vector
            a,b=Vector(a),Vector(b)
            axis=(b-a).normalized()
            helper=Vector((0,0,1)) if abs(axis.z)<.95 else Vector((1,0,0))
            u=axis.cross(helper).normalized()*width/2
            v=axis.cross(u).normalized()*width/2
            n=len(vertices)
            vertices.extend([tuple(p+su*u+sv*v) for p in (a,b) for su,sv in ((-1,-1),(1,-1),(1,1),(-1,1))])
            faces.extend(tuple(n+i for i in face) for face in ((0,3,2,1),(4,5,6,7),(0,1,5,4),(1,2,6,5),(2,3,7,6),(3,0,4,7)))
        height=fence['height']
        for a,b in zip(fence['points'],fence['points'][1:]):
            dx,dz=b[0]-a[0],b[1]-a[1]
            length=math.hypot(dx,dz)
            if length < .001:
                continue
            def p(t,h):return (a[0]+dx*t/length,-a[1]-dz*t/length,h+.12)
            count=max(1,math.ceil(length/2.8))
            for i in range(count+1):beam(p(length*i/count,0),p(length*i/count,height+.1),.075)
            for h in (.15,height-.05):beam(p(0,h),p(length,h),.055)
            if fence['kind']=='picket':
                # 22 cm spacing keeps the full campus within the web geometry
                # budget while retaining solid vertical metal bars up close.
                count=max(1,math.ceil(length/.22))
                for i in range(1,count):beam(p(length*i/count,.1),p(length*i/count,height),.025)
            else:
                # Diamond mesh as double-sided narrow ribbons. Geometry avoids
                # texture alpha sorting and remains visible from both sides.
                spacing=.32
                for slope in (-1,1):
                    for i in range(math.floor(-length/spacing)-1,math.ceil((length+height)/spacing)+2):
                        intercept=i*spacing
                        lo=max(0,(.16-intercept)/slope) if slope>0 else max(0,(height-.08-intercept)/slope)
                        hi=min(length,(height-.08-intercept)/slope) if slope>0 else min(length,(.16-intercept)/slope)
                        if hi<=lo:continue
                        h0=slope*lo+intercept;h1=slope*hi+intercept
                        n=len(vertices);w=.012
                        vertices.extend([p(lo,h0-w),p(hi,h1-w),p(hi,h1+w),p(lo,h0+w)])
                        faces.append((n,n+1,n+2,n+3))
        parent=bpy.data.objects.new('fence-'+fence['id'],None)
        bpy.context.collection.objects.link(parent)
        parent['reference']=fence['source'];parent['approximate']=True
        parent['points']=json.dumps(fence['points'])
        parent['closed']=fence.get('closed',False)
        parent['height']=height
        mesh('Fence '+fence['id'],vertices,faces,'fenceMetal',parent)
