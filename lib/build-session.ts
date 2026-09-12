import * as THREE from 'three';
import { inside, type Point } from './spatial.ts';

export type BuildCategory = 'building' | 'toilet' | 'tree' | 'grass' | 'fence' | 'walkway' | 'decoration';
export type Vec3 = [number, number, number];
export type BuildItem = {
  id: string; templateId: string; origin: 'original' | 'added';
  position: Vec3; rotation: Vec3; scale: Vec3; deleted: boolean;
};
export type BuildTemplate = { id: string; name: string; category: BuildCategory; size: Vec3; baseY: number };
type Template = BuildTemplate & { mesh: THREE.Group; collisions: Point[][] };
type Document = { format: 'arroyo-campus-build'; version: 2; baseRevision: string; units: 'meters'; axes: 'X-east Y-up Z-south'; objects: BuildItem[] };
const copy = <T,>(value: T): T => structuredClone(value);

/** Editable instances share immutable source geometry/materials; removing an
 * instance never disposes the assets used by another instance or by undo. */
export class BuildSession {
  private root: THREE.Group;
  private revision: string;
  private boundary: Point[];
  private templates = new Map<string, Template>();
  private originals: BuildItem[] = [];
  private items: BuildItem[] = [];
  private objects = new Map<string, THREE.Group>();
  private past: BuildItem[][] = [];
  private future: BuildItem[][] = [];
  private pending: BuildItem[] | null = null;
  onChange: () => void = () => {};

  constructor(root: THREE.Group, revision: string, boundary: Point[]) {
    this.root = root; this.revision = revision; this.boundary = boundary;
    root.updateWorldMatrix(true, true);
    const sources: THREE.Object3D[] = [];
    root.traverse(o => { if (typeof o.userData.editorId === 'string') sources.push(o); });
    for (const source of sources) {
      const id = source.userData.editorId as string;
      if (this.templates.has(id)) throw new Error(`重复的模型标识：${id}`);
      const box = new THREE.Box3().setFromObject(source, true);
      if (box.isEmpty()) continue;
      const pivot = box.getCenter(new THREE.Vector3()); pivot.y = box.min.y;
      const group = new THREE.Group(); group.name = `editable:${id}`;
      this.root.add(group); group.position.copy(pivot); group.updateMatrixWorld(true);
      group.attach(source); // preserve every child mesh's WORLD transform
      group.userData.editorInstance = id;
      const templateMesh = group.clone(true); templateMesh.position.set(0,0,0);
      const collisions = (source.userData.collisionRingsJson ? JSON.parse(source.userData.collisionRingsJson) : source.userData.collisionRings || []) as Point[][];
      const template: Template = {
        id, name: source.userData.editorName || source.userData.label || source.name,
        category: source.userData.editorCategory,
        size: box.getSize(new THREE.Vector3()).toArray() as Vec3, baseY: pivot.y,
        mesh: templateMesh,
        collisions: collisions.map(r => r.map(p => [p[0]-pivot.x,p[1]-pivot.z] as Point)),
      };
      this.templates.set(id, template); this.objects.set(id, group);
      this.items.push({ id, templateId:id, origin:'original', position:pivot.toArray() as Vec3, rotation:[0,0,0], scale:[1,1,1], deleted:false });
    }
    this.originals = copy(this.items);
  }

  get catalog(): BuildTemplate[] { return [...this.templates.values()].map(({mesh: _mesh,collisions: _collisions,...t}) => t); }
  get canUndo() { return this.past.length > 0; }
  get canRedo() { return this.future.length > 0; }
  get addedCount() { return this.items.filter(i=>i.origin==='added'&&!i.deleted).length; }
  get changedCount() { return this.items.filter(i=>i.origin==='original'&&JSON.stringify(i)!==JSON.stringify(this.originals.find(o=>o.id===i.id))).length; }
  object(id: string) { return this.objects.get(id); }
  item(id: string) { const item=this.items.find(i=>i.id===id); return item ? copy(item) : undefined; }
  template(id: string) { return this.catalog.find(t=>t.id===id); }
  preview(id: string) { return this.templates.get(id)?.mesh.clone(true); }
  ownerOf(object: THREE.Object3D | null): string | null {
    for (let o=object; o; o=o.parent) {
      const id=o.userData.editorInstance;
      if (typeof id==='string' && this.objects.get(id)===o && o.visible) return id;
    }
    return null;
  }
  visibleObjects() { return this.items.filter(i=>!i.deleted).map(i=>this.objects.get(i.id)!); }
  begin() { if (!this.pending) this.pending=copy(this.items); }
  commit() {
    if (this.pending && JSON.stringify(this.pending)!==JSON.stringify(this.items)) {
      this.past.push(this.pending); if(this.past.length>100)this.past.shift(); this.future=[];
    }
    this.pending=null; this.onChange();
  }
  cancel() { if(this.pending){this.items=this.pending; this.pending=null; this.sync();} }
  private change(fn:()=>void) { this.begin(); fn(); this.sync(); this.commit(); }
  capture(id: string) {
    const item=this.items.find(i=>i.id===id), obj=this.objects.get(id);
    if(!item||!obj)return;
    item.position=obj.position.toArray() as Vec3;
    item.rotation=[obj.rotation.x,obj.rotation.y,obj.rotation.z];
    item.scale=obj.scale.toArray() as Vec3;
  }
  add(templateId: string, position: Vec3): string {
    if(!this.templates.has(templateId))throw new Error('找不到完整模型，请重新加载页面。');
    const id=`placed-${crypto.randomUUID()}`;
    this.change(()=>this.items.push({id,templateId,origin:'added',position:copy(position),rotation:[0,0,0],scale:[1,1,1],deleted:false}));
    return id;
  }
  duplicate(id: string): string {
    const item=this.item(id); if(!item||item.deleted)throw new Error('请先选择模型');
    const next=`placed-${crypto.randomUUID()}`;
    this.change(()=>this.items.push({...item,id:next,origin:'added',position:[item.position[0]+3,item.position[1],item.position[2]+3]}));
    return next;
  }
  update(id: string, patch: Partial<Pick<BuildItem,'position'|'rotation'|'scale'>>) {
    const item=this.items.find(i=>i.id===id); if(!item||item.deleted)return;
    this.change(()=>Object.assign(item,copy(patch)));
  }
  remove(id: string) { const item=this.items.find(i=>i.id===id); if(item&&!item.deleted)this.change(()=>{item.deleted=true;}); }
  undo() { this.cancel(); const before=this.past.pop(); if(before){this.future.push(copy(this.items));this.items=before;this.sync();} }
  redo() { this.cancel(); const after=this.future.pop(); if(after){this.past.push(copy(this.items));this.items=after;this.sync();} }
  private sync() {
    for(const obj of this.objects.values())obj.visible=false;
    for(const item of this.items) {
      let obj=this.objects.get(item.id);
      if(!obj){obj=this.templates.get(item.templateId)!.mesh.clone(true);obj.name=`editable:${item.id}`;obj.userData.editorInstance=item.id;this.root.add(obj);this.objects.set(item.id,obj);}
      obj.position.fromArray(item.position);obj.rotation.set(...item.rotation);obj.scale.fromArray(item.scale);obj.visible=!item.deleted;
      obj.updateMatrixWorld(true);
    }
    this.onChange();
  }
  export(): string {
    const document: Document={format:'arroyo-campus-build',version:2,baseRevision:this.revision,units:'meters',axes:'X-east Y-up Z-south',objects:copy(this.items)};
    return JSON.stringify(document,null,2);
  }
  import(text: string, allowMissingOriginals = false) {
    if(text.length>8_000_000)throw new Error('地图文件过大');
    const doc=JSON.parse(text) as Document;
    if(doc.format!=='arroyo-campus-build'||doc.version!==2)throw new Error('请选择新版建造模式导出的地图 JSON');
    if(doc.baseRevision!==this.revision)throw new Error('地图基于不同版本的校园模型，无法直接导入');
    if(doc.units!=='meters'||doc.axes!=='X-east Y-up Z-south'||!Array.isArray(doc.objects)||doc.objects.length>3000)throw new Error('地图格式不正确');
    const ids=new Set<string>();
    const vector=(v:unknown,scale=false):v is Vec3=>Array.isArray(v)&&v.length===3&&v.every(n=>typeof n==='number'&&Number.isFinite(n)&&Math.abs(n)<10000&&(!scale||(n>=.05&&n<=20)));
    const checked: BuildItem[]=[];
    for(const i of doc.objects){
      if(!i||typeof i.id!=='string'||i.id.length>150||ids.has(i.id)||!this.templates.has(i.templateId)||!['original','added'].includes(i.origin)||typeof i.deleted!=='boolean'||!vector(i.position)||!vector(i.rotation)||!vector(i.scale,true))throw new Error('地图包含无效对象，当前场景未更改');
      if(i.origin==='original' ? i.id!==i.templateId||!this.originals.some(o=>o.id===i.id) : !i.id.startsWith('placed-'))throw new Error('地图中的原始模型标识不正确');
      ids.add(i.id);checked.push({id:i.id,templateId:i.templateId,origin:i.origin,position:copy(i.position),rotation:copy(i.rotation),scale:copy(i.scale),deleted:i.deleted});
    }
    if(!allowMissingOriginals && this.originals.some(i=>!checked.some(c=>c.id===i.id&&c.origin==='original')))throw new Error('地图缺少原有模型记录');
    if (allowMissingOriginals) {
      for (const original of this.originals) {
        if (!checked.some(item => item.id === original.id)) checked.push(copy(original));
      }
    }
    this.change(()=>{this.items=checked;});
  }
  warnings(id: string): string[] {
    const obj=this.objects.get(id),item=this.items.find(i=>i.id===id);if(!obj||!item||item.deleted)return [];
    const box=new THREE.Box3().setFromObject(obj,true), result:string[]=[];
    if([[box.min.x,box.min.z],[box.max.x,box.min.z],[box.max.x,box.max.z],[box.min.x,box.max.z]].some(p=>!inside(p as Point,this.boundary)))result.push('模型超出校园范围');
    if(this.templates.get(item.templateId)?.category==='grass')return result;
    for(const other of this.items){
      if(other.id===id||other.deleted||this.templates.get(other.templateId)?.category==='grass')continue;
      const b=new THREE.Box3().setFromObject(this.objects.get(other.id)!,true);
      if(Math.min(box.max.x,b.max.x)-Math.max(box.min.x,b.min.x)>.15 && Math.min(box.max.z,b.max.z)-Math.max(box.min.z,b.min.z)>.15 && Math.min(box.max.y,b.max.y)-Math.max(box.min.y,b.min.y)>.15){result.push(`可能与「${this.templates.get(other.templateId)!.name}」重叠`);if(result.length>=3)break;}
    }
    return result;
  }
  collisionRings(): Point[][] {
    const result:Point[][]=[];
    for(const item of this.items){
      if(item.deleted)continue;
      const obj=this.objects.get(item.id)!;obj.updateMatrixWorld(true);
      for(const ring of this.templates.get(item.templateId)!.collisions)result.push(ring.map(p=>{const v=new THREE.Vector3(p[0],0,p[1]).applyMatrix4(obj.matrixWorld);return [v.x,v.z] as Point;}));
    }
    return result;
  }
}
