import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

async function load(path: string) {
  const bytes = fs.readFileSync(path);
  return (await new GLTFLoader().parseAsync(
    bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
    '',
  )).scene;
}

function sceneSignature(scene: THREE.Object3D) {
  scene.updateMatrixWorld(true);
  let triangles = 0;
  let meshes = 0;
  const bounds = new THREE.Box3();
  scene.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    meshes += 1;
    const position = object.geometry.getAttribute('position');
    triangles += (object.geometry.index?.count || position.count) / 3;
    bounds.expandByObject(object);
  });
  return { meshes, triangles, bounds };
}

test('editor GLB keeps the original visible geometry and adds complete editable groups', async () => {
  const original = await load('public/models/arroyo-campus.glb');
  const editor = await load('public/models/arroyo-editor.glb');
  const baseline = sceneSignature(original);
  const editable = sceneSignature(editor);
  assert.equal(editable.triangles, baseline.triangles);
  assert.ok(editable.meshes >= baseline.meshes);

  const groups: THREE.Object3D[] = [];
  editor.traverse((object) => {
    if (typeof object.userData.editorId === 'string') groups.push(object);
  });
  assert.equal(groups.length, 1066);
  const counts = new Map<string, number>();
  for (const group of groups) {
    const category = group.userData.editorCategory as string;
    counts.set(category, (counts.get(category) || 0) + 1);
    let meshCount = 0;
    group.traverse((object) => {
      if (object instanceof THREE.Mesh) meshCount += 1;
    });
    assert.ok(meshCount > 0, '编辑对象没有完整网格：' + group.userData.editorId);
  }
  assert.deepEqual(Object.fromEntries(counts), {
    building: 49,
    decoration: 834,
    fence: 30,
    tree: 112,
    grass: 9,
    toilet: 1,
    walkway: 31,
  });
});
