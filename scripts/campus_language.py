"""Approved language courtyard: classroom correction and photo-led landscaping."""
import json
import math
import random
import bmesh
from pathlib import Path
from mathutils import Vector

ROOT = Path(__file__).resolve().parents[1]


def build_language(bpy):
    layout = json.loads((ROOT / 'data/language-layout.json').read_text())
    rng = random.Random(91022)
    materials = {}
    colors = {
        'cream': (.80, .79, .65), 'roof': (.29, .18, .125),
        'fascia': (.25, .21, .16), 'flat': (.68, .70, .66),
        'glass': (.075, .12, .13), 'door': (.29, .31, .24),
        'concrete': (.63, .65, .59), 'trunk': (.42, .43, .36),
        'mulch': (.23, .20, .13), 'leaf': (.09, .22, .075),
        'leaf-light': (.16, .29, .085), 'grass': (.18, .32, .075),
        'grass-light': (.185, .327, .079), 'grass-shade': (.175, .313, .071),
    }
    for key, color in colors.items():
        m = bpy.data.materials.get('Language ' + key)
        if m is None:
            m = bpy.data.materials.new('Language ' + key)
        m.diffuse_color = (*color, 1)
        m.use_nodes = True
        bsdf = m.node_tree.nodes.get('Principled BSDF')
        bsdf.inputs['Base Color'].default_value = (*color, 1)
        bsdf.inputs['Roughness'].default_value = .88 if key != 'glass' else .4
        materials[key] = m

    def remove_tree(obj):
        for child in list(obj.children_recursive):
            bpy.data.objects.remove(child, do_unlink=True)
        bpy.data.objects.remove(obj, do_unlink=True)

    target_ids = {b['id'] for b in layout['buildings']}
    for name in target_ids | {'language-landscape'}:
        obj = bpy.data.objects.get(name)
        if obj is not None:
            remove_tree(obj)
    for obj in list(bpy.data.objects):
        x, z = obj.location.x, -obj.location.y
        if obj.name.startswith(('Simplified tree trunk', 'Simplified tree canopy')) and 130 < x < 209 and 104 < z < 157:
            bpy.data.objects.remove(obj, do_unlink=True)
        elif obj.name.startswith('Building apron') and 122 < x < 203 and 103 < z < 156:
            bpy.data.objects.remove(obj, do_unlink=True)
        elif obj.name.startswith(('Entrance mature trunk', 'Entrance layered foliage')) and 198 < x < 211 and 113 < z < 125:
            # This old invented tree is replaced by the street photograph's
            # broad-canopied tree, without touching the office planting.
            bpy.data.objects.remove(obj, do_unlink=True)

    def parent(name):
        obj = bpy.data.objects.new(name, None)
        bpy.context.collection.objects.link(obj)
        obj['source'] = layout['source']
        return obj

    def mesh(name, vertices, faces, key, group):
        data = bpy.data.meshes.new(name)
        data.from_pydata(vertices, [], faces)
        data.update()
        obj = bpy.data.objects.new(name, data)
        bpy.context.collection.objects.link(obj)
        obj.data.materials.append(materials[key])
        obj.parent = group
        bm = bmesh.new()
        bm.from_mesh(data)
        bmesh.ops.recalc_face_normals(bm, faces=list(bm.faces))
        bm.to_mesh(data)
        bm.free()
        return obj

    def p(q, h):
        return (q[0], -q[1], h)

    def mix(a, b, t):
        return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]

    def beam(name, a, b, width, height, center, key, group):
        direction = Vector((b[0] - a[0], b[1] - a[1]))
        normal = Vector((-direction.y, direction.x)).normalized() * width / 2
        ring = [list(Vector(a) + normal), list(Vector(b) + normal),
                list(Vector(b) - normal), list(Vector(a) - normal)]
        vs = [p(q, center + h) for h in (-height / 2, height / 2) for q in ring]
        return mesh(name, vs, [(0, 1, 2, 3), (7, 6, 5, 4),
                              (0, 4, 5, 1), (1, 5, 6, 2),
                              (2, 6, 7, 3), (3, 7, 4, 0)], key, group)

    for b in layout['buildings']:
        group = parent(b['id'])
        group['buildingId'] = b['id']
        group['label'] = b['name']
        group['wallRing'] = json.dumps(b['ring'])
        h = b['height']
        ring = b['ring']
        vertices = [p(q, y) for y in (.12, h) for q in ring]
        mesh(b['name'] + ' walls', vertices,
             [(i, (i + 1) % 4, (i + 1) % 4 + 4, i + 4) for i in range(4)], 'cream', group)
        # Choose the short end to create the two street-facing gables.
        a, c, d, e = ring
        if math.dist(a, c) > math.dist(c, d):
            a, c, d, e = c, d, e, a
        if b['roof'] == 'pitched':
            m, n = mix(a, c, .5), mix(e, d, .5)
            rise = min(1.5, math.dist(a, c) * .17)
            mesh('Language gable ends', [p(a, h), p(c, h), p(d, h), p(e, h), p(m, h + rise), p(n, h + rise)],
                 [(0, 4, 1), (3, 2, 5)], 'cream', group)
            center = Vector([sum(q[0] for q in ring) / 4, sum(q[1] for q in ring) / 4])
            expanded = [list(center + (Vector(q) - center) * 1.035) for q in [a, c, d, e]]
            mesh('Language brown pitched roof', [p(q, h + .07) for q in expanded] + [p(m, h + rise + .07), p(n, h + rise + .07)],
                 [(0, 3, 5, 4), (4, 5, 2, 1)], 'roof', group)
            # Thin regularly spaced shingle bands, visible at walking distance.
            for j in range(1, 10):
                t = j / 10
                for q, r in [(a, e), (c, d)]:
                    beam('Roof shingle course', mix(q, m, t), mix(r, n, t), .025, .025,
                         h + rise * t + .09, 'fascia', group)
        else:
            mesh('Language rear pale roof', [p(q, h + .1) for q in ring], [(0, 3, 2, 1)], 'flat', group)
        for i, q in enumerate(ring):
            r = ring[(i + 1) % 4]
            beam('Language building apron', q, r, .75, .05, .13, 'concrete', group)
            beam('Language roof fascia', q, r, .12, .18, h, 'fascia', group)
            length = math.dist(q, r)
            if length < 15:
                continue
            # Long elevations have recessed dark windows and cream mullions.
            for j in range(1, int(length / 5)):
                middle = mix(q, r, j * 5 / length)
                direction = [(r[0] - q[0]) / length, (r[1] - q[1]) / length]
                v = lambda offset: [middle[0] + direction[0] * offset, middle[1] + direction[1] * offset]
                beam('Language shaded window', v(-1.2), v(1.2), .14, .9, 2.1, 'glass', group)
                beam('Language window mullion', v(-.035), v(.035), .18, .98, 2.1, 'cream', group)
            for t in (.18, .68):
                q1, q2 = mix(q, r, t), mix(q, r, t + 1.05 / length)
                beam('Language classroom door', q1, q2, .16, 2.2, 1.22, 'door', group)

    group = parent('language-landscape')
    for lawn in layout['lawns']:
        a, b, c, d = lawn['ring']
        # Slight material changes are actual exportable geometry; no shader
        # noise that would silently disappear during glTF export.
        for j in range(12):
            t, u = j / 12, (j + 1) / 12
            q = [mix(a, b, t), mix(a, b, u), mix(d, c, u), mix(d, c, t)]
            mesh(lawn['id'] + ' turf', [p(v, .18) for v in q], [(0, 3, 2, 1)],
                 ['grass', 'grass-light', 'grass-shade', 'grass'][j % 4], group)
    for path in layout['paths']:
        a, b = path['a']
        beam('Language concrete walk', a, b, path['width'], .08, .20, 'concrete', group)

    def branch(name, start, end, r1, r2, owner):
        axis = Vector(end) - Vector(start)
        u = axis.cross(Vector((0, 1, 0))).normalized()
        v = axis.normalized().cross(u)
        vertices = [tuple(Vector(center) + (u * math.cos(i * math.tau / 8) + v * math.sin(i * math.tau / 8)) * radius)
                    for center, radius in [(start, r1), (end, r2)] for i in range(8)]
        mesh(name, vertices, [(i, (i + 1) % 8, (i + 1) % 8 + 8, i + 8) for i in range(8)] + [tuple(range(8, 16))], 'trunk', owner)

    def foliage(name, center, scale, owner):
        bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=2 if owner.name == 'language-front-tree' else 1, radius=1, location=center)
        obj = bpy.context.object
        obj.name = name
        obj.scale = scale
        obj.parent = owner
        for vertex in obj.data.vertices:
            vertex.co *= rng.uniform(.87, 1.13)
        obj.data.materials.append(materials['leaf'])
        obj.data.materials.append(materials['leaf-light'])
        for face in obj.data.polygons:
            face.use_smooth = True
            face.material_index = int(rng.random() < .22)
        obj.select_set(False)

    for tree in layout['trees']:
        owner = parent(tree['id'])
        owner.parent = group
        q, h, radius, trunk = tree['p'], tree['height'], tree['radius'], tree['trunkRadius']
        owner['trunkPoint'] = q
        branch('Language branching trunk', p(q, .17), p([q[0] + .15, q[1] - .18], h * .53), trunk, trunk * .55, owner)
        for j in range(6):
            angle = j * math.tau / 6 + .3
            tip = [q[0] + math.cos(angle) * radius * .62, q[1] + math.sin(angle) * radius * .62]
            branch('Language spreading branch', p(q, h * (.31 + j * .018)), p(tip, h * .69), trunk * .44, .07, owner)
            foliage('Language layered crown', p(tip, h * (.72 + (j % 2) * .05)),
                    (radius * .57, radius * .58, h * .22), owner)
        foliage('Language central crown', p(q, h * .83), (radius * .68, radius * .63, h * .17), owner)
        # Exposed soil ring and shallow roots under the main street tree.
        ring = [[q[0] + trunk * 2.8 * math.cos(j * math.tau / 16), q[1] + trunk * 2.8 * math.sin(j * math.tau / 16)] for j in range(16)]
        mesh('Language tree soil ring', [p(v, .19) for v in ring], [tuple(reversed(range(16)))], 'mulch', owner)
        if tree['id'] == 'language-front-tree':
            for j in range(5):
                angle = j * math.tau / 5
                branch('Language surface root', p(q, .35), p([q[0] + math.cos(angle) * 1.45, q[1] + math.sin(angle) * 1.45], .2), .14, .025, owner)
    for hedge in layout['hedges']:
        a, b = hedge['a']
        count = max(1, math.ceil(math.dist(a, b) / 1.25))
        for j in range(count):
            q = mix(a, b, (j + .5) / count)
            foliage('Language clipped hedge', p(q, hedge['height'] / 2 + .18),
                    (.78, hedge['width'] / 2, hedge['height'] / 2), group)
    # Two canopy directions intersect at this courtyard. A small deliberate
    # height offset avoids coplanar flicker at the existing connections.
    for name in ('walkway-language-north', 'walkway-language-south'):
        canopy = bpy.data.objects.get(name)
        if canopy:
            for obj in canopy.children:
                if obj.name.startswith('Light canopy'):
                    obj.location.z = 3.46
                elif obj.name.startswith('Canopy edge beam'):
                    obj.location.z = 3.26
    bpy.context.scene['modelRevision'] = layout['revision']
    return layout
