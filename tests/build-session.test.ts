import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { BuildSession } from '../lib/build-session.ts';

function fixture() {
  const root = new THREE.Group();
  const building = new THREE.Group();
  building.name = 'school';
  building.userData = { editorId: 'school', editorName: '教室', editorCategory: 'building' };
  for (const [name, y, color] of [['walls', 2, 0xffffff], ['roof', 4.2, 0x884422]] as const) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(8, name === 'roof' ? .4 : 4, 4), new THREE.MeshStandardMaterial({ color }));
    mesh.name = name; mesh.position.set(30, y, 50); building.add(mesh);
  }
  root.add(building);
  const scene = new THREE.Scene(); scene.add(root);
  return new BuildSession(root, 'fixture-v1', [[-100,-100],[100,-100],[100,100],[-100,100]]);
}

test('placement clones the complete building, preserves its materials and uses positive map Z', () => {
  const s = fixture();
  const id = s.add('school', [60, 0, 70]);
  const obj = s.object(id)!;
  assert.equal(obj.children[0].children.length, 2);
  assert.deepEqual(obj.position.toArray(), [60, 0, 70]);
  const colors: number[] = []; obj.traverse(o => { if (o instanceof THREE.Mesh) colors.push((o.material as THREE.MeshStandardMaterial).color.getHex()); });
  assert.deepEqual(colors, [0xffffff, 0x884422]);
  assert.deepEqual(new THREE.Box3().setFromObject(obj).getSize(new THREE.Vector3()).toArray().map(n=>+n.toFixed(2)), [8, 4.4, 4]);
});

test('original movement/deletion and new copies survive export/import; undo restores full objects', () => {
  const s = fixture();
  s.update('school', { position: [10,0,20], rotation: [0,Math.PI/2,0] });
  const copy = s.duplicate('school');
  s.remove('school');
  assert.equal(s.object('school')!.visible, false);
  s.undo(); assert.equal(s.object('school')!.visible, true);
  s.redo(); assert.equal(s.object('school')!.visible, false);
  const saved = s.export(); const restored = fixture(); restored.import(saved);
  assert.deepEqual(JSON.parse(restored.export()).objects, JSON.parse(saved).objects);
  assert.equal(restored.object(copy)!.children[0].children.length, 2);
  assert.equal(restored.object('school')!.visible, false);
});

test('a multi-frame drag is a single undo step and cancel restores its starting position', () => {
  const s = fixture(); s.begin();
  s.object('school')!.position.x = 1; s.capture('school');
  s.object('school')!.position.x = 2; s.capture('school'); s.commit();
  s.undo(); assert.equal(s.object('school')!.position.x, 30);
  s.redo(); assert.equal(s.object('school')!.position.x, 2);
  s.begin(); s.object('school')!.position.x = 90; s.capture('school'); s.cancel();
  assert.equal(s.object('school')!.position.x, 2);
});

test('bad imports fail atomically and collision/outside warnings describe actual placements', () => {
  const s = fixture(), original = s.export();
  const bad = JSON.parse(original); bad.objects[0].position = [null,0,0];
  assert.throws(()=>s.import(JSON.stringify(bad)));
  assert.equal(s.export(), original);
  const id = s.add('school',[30,0,50]); assert.ok(s.warnings(id).some(w=>w.includes('重叠')));
  s.update(id,{position:[150,0,150]}); assert.ok(s.warnings(id).some(w=>w.includes('范围')));
});
