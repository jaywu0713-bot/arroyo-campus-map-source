import bpy,json
from pathlib import Path
root=Path(__file__).resolve().parents[1]
bpy.ops.wm.open_mainfile(filepath=str(root/'model/arroyo-campus.blend'))
data=json.loads((root/'data/campus.json').read_text())
for b in data['buildings']:
    assert b['id'] in bpy.data.objects, b['id']
print(json.dumps({'verified_buildings':len(data['buildings']),'editable_objects':len(bpy.data.objects)}))
