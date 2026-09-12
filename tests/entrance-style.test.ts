import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { BuildSession } from '../lib/build-session.ts';
async function load(path: string) {
  const bytes = fs.readFileSync(path);
  return (await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '')).scene;
}
test('entrance styling preserves every editable pivot and the exact administrator layout', async () => {
  const metadata = JSON.parse(fs.readFileSync('data/editor-assets.json','utf8'));
  const before = new BuildSession(await load('model/entrance-reference/source.glb'), metadata.revision, []);
  const after = new BuildSession(await load('public' + metadata.url), metadata.revision, []);
  const old = new Map(before.catalog.map(item => [item.id,item]));
  assert.equal(after.catalog.length,old.size);
  for (const item of after.catalog) {
    const previous = old.get(item.id)!; assert.ok(previous,item.id);
    assert.equal(item.category,previous.category);
    assert.ok(Math.abs(item.baseY-previous.baseY)<.002,item.id);
    item.size.forEach((value,i)=>assert.ok(Math.abs(value-previous.size[i])<.002,item.id));
    assert.ok(before.object(item.id)!.position.distanceTo(after.object(item.id)!.position)<.002,item.id);
  }
  const text = fs.readFileSync('data/default-campus-build.json','utf8');
  assert.deepEqual(JSON.parse(text).objects,JSON.parse(fs.readFileSync('model/entrance-reference/layout.json','utf8')).objects);
  after.import(text,true);
  for (const item of JSON.parse(text).objects) {
    const obj = after.object(item.id);
    if (item.deleted) { assert.ok(!obj || !obj.visible); continue; }
    assert.ok(obj,item.id);
    assert.deepEqual(obj.position.toArray(),item.position);
    assert.deepEqual(obj.scale.toArray(),item.scale);
    assert.ok(Math.abs(obj.rotation.y-item.rotation[1])<.00001);
  }
});
