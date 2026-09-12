import fs from 'node:fs';
import assert from 'node:assert/strict';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { Box3,Vector3 } from 'three';
const bytes=fs.readFileSync('public/models/arroyo-campus.glb');
const scene=(await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'')).scene;
const data=JSON.parse(fs.readFileSync('data/campus.json','utf8'));
for(const building of data.buildings){assert.ok(scene.getObjectByName(building.id),`Missing building ${building.id}`);}
for(const path of data.walkways || []) assert.ok(scene.getObjectByName(`walkway-${path.id}`), `Missing canopy ${path.id}`);
const fences=JSON.parse(fs.readFileSync('data/fences.json','utf8')).fences;
const actualFenceNames=[];
scene.traverse(o=>{if(o.name.startsWith('fence-'))actualFenceNames.push(o.name);});
assert.deepEqual(actualFenceNames.sort((a,b)=>a.localeCompare(b)),fences.map(f=>'fence-'+f.id).sort((a,b)=>a.localeCompare(b)),'GLB includes missing or superseded fence groups');
for(const f of fences) {
  const obj=scene.getObjectByName('fence-'+f.id);
  assert.deepEqual(JSON.parse(obj.userData.points),f.points,`Stale fence geometry source: ${f.id}`);
  const box=new Box3().setFromObject(obj,true);
  const expected=[Math.min(...f.points.map(p=>p[0])),Math.max(...f.points.map(p=>p[0])),Math.min(...f.points.map(p=>p[1])),Math.max(...f.points.map(p=>p[1]))];
  [box.min.x,box.max.x,box.min.z,box.max.z].forEach((v,i)=>assert.ok(Math.abs(v-expected[i])<.15,`Misplaced fence mesh ${f.id}`));
  assert.ok(Math.abs(box.max.y-(f.height+.22))<.15,`Incorrect fence height ${f.id}`);
}
assert.ok(scene.getObjectByName('entrance-details'), 'Missing entrance detail group');
const language=JSON.parse(fs.readFileSync('data/language-layout.json','utf8'));
for(const b of language.buildings){
  const obj=scene.getObjectByName(b.id);
  assert.deepEqual(JSON.parse(obj.userData.wallRing),b.ring,`Language wall footprint stale: ${b.id}`);
  const wall=obj.children.find(o=>o.name.includes('walls'));
  assert.ok(wall,`Missing wall mesh: ${b.id}`);
  const box=new Box3().setFromObject(wall,true);
  // Material batching joins the cream walls and gable ends into one mesh.
  const distance=(a,c)=>Math.hypot(a[0]-c[0],a[1]-c[1]);
  const rise=b.roof==='pitched'?Math.min(1.5,Math.min(distance(b.ring[0],b.ring[1]),distance(b.ring[1],b.ring[2]))*.17):0;
  assert.ok(box.max.y >= b.height-.01 && box.max.y <= b.height+rise+0.05,`Language wall height stale: ${b.id}`);
}
for(const t of language.trees)assert.ok(scene.getObjectByName(t.id),`Missing reference tree: ${t.id}`);
let meshes=0,triangles=0;scene.traverse(o=>{if(o.isMesh){meshes++;triangles+=(o.geometry.index?.count||o.geometry.attributes.position.count)/3;}});
const size=new Box3().setFromObject(scene,true).getSize(new Vector3());
assert.ok(size.x>=999.9&&size.x<1100);assert.ok(size.z>=899.9&&size.z<1000);assert.ok(size.y>9&&size.y<30);
assert.ok(bytes.byteLength < 8_000_000, 'Campus payload exceeds 8 MB');
// The new rear row and branching reference trees have a 5k-triangle allowance;
// keep the unchanged 8 MB download ceiling for the complete campus.
assert.ok(triangles < 125_000, `Campus exceeds low-poly geometry budget: ${triangles}`);
console.log(JSON.stringify({buildings:data.buildings.length,meshes,triangles,meters:size.toArray(),bytes:bytes.byteLength}));
