import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { TransformControls } from 'three/addons/controls/TransformControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { moveSafely, walkable, type Point } from './spatial';
import { renderPixelRatio, needsFrame } from './render-policy';
import data from '../data/campus.json';
import fences from '../data/fences.json';
import { fenceObstacles } from './fence-geometry';
import entranceObstacles from '../data/entrance-obstacles.json';
import editorAssets from '../data/editor-assets.json';
import defaultBuild from '../data/default-campus-build.json';
import { BuildSession, type Vec3 } from './build-session';
import type { BuilderState, BuildTool } from './builder-types';
import type { RoomMarker, MarkerTarget } from './room-markers';

export type ViewMode = 'overview' | 'walk' | 'fly';
export type CampusController = {
  setMode: (mode: ViewMode) => void;
  focus: (id: string) => void;
  reset: () => void;
  zoom: (direction: number) => void;
  setInput: (key: string, pressed: boolean) => void;
  addBuildPiece: (templateId: string) => void;
  undoBuildPiece: () => void;
  redoBuildPiece: () => void;
  setBuildMode: (active: boolean) => void;
  setMarkerMode: (active: boolean) => void;
  setMarkers: (markers: RoomMarker[]) => void;
  setBuildTool: (tool: BuildTool) => void;
  setBuildSnap: (snap: boolean) => void;
  duplicateBuildPiece: () => void;
  deleteBuildPiece: () => void;
  rotateBuildPiece: (degrees: number) => void;
  cancelPlacement: () => void;
  focusBuildPiece: () => void;
  importBuild: (json: string) => void;
  exportBuild: () => string;
  dispose: () => void;
};
export type LabelPosition = {
  id: string;
  x: number;
  y: number;
  visible: boolean;
};

export function createCampusEngine(
  host: HTMLDivElement,
  onReady: () => void,
  onError: (message: string) => void,
  onSelect: (id: string) => void,
  onFrame: (labels: LabelPosition[]) => void,
  onBuilder: (state: BuilderState) => void = () => {},
  onMarker: (target: MarkerTarget) => void = () => {},
  onMarkerEdit: (id: string) => void = () => {},
  onMarkerMessage: (message: string) => void = () => {},
  onMarkerHover: (value: {id:string;x:number;y:number}|null) => void = () => {},
): CampusController {
  const touch = window.matchMedia('(pointer: coarse)').matches;
  const renderer = new THREE.WebGLRenderer({
    antialias: true,
    powerPreference: 'default',
  });
  renderer.setPixelRatio(renderPixelRatio(window.devicePixelRatio, touch));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  // All campus geometry and the sun are static. Rebuild only when assets load.
  renderer.shadowMap.autoUpdate = false;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.25;
  const canvas = renderer.domElement;
  canvas.tabIndex = 0;
  canvas.setAttribute(
    'aria-label',
    'Interactive 3D campus. Drag to look around. In walk mode use W A S D or arrow keys to move.',
  );
  host.appendChild(canvas);
  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#dcebf4');
  scene.fog = new THREE.Fog('#dcebf4', 950, 1900);
  scene.add(new THREE.HemisphereLight(0xe3f2ff, 0x596b51, 2.2));
  const sun = new THREE.DirectionalLight(0xfff2d7, 3.2);
  sun.position.set(-220, 380, 200);
  sun.castShadow = true;
  sun.shadow.mapSize.set(touch ? 1024 : 2048, touch ? 1024 : 2048);
  sun.shadow.camera.left = -350;
  sun.shadow.camera.right = 350;
  sun.shadow.camera.top = 350;
  sun.shadow.camera.bottom = -350;
  sun.shadow.camera.far = 1100;
  sun.shadow.normalBias = 0.15;
  scene.add(sun);
  const backdrop = new THREE.Mesh(
    new THREE.PlaneGeometry(5000, 5000),
    new THREE.MeshStandardMaterial({ color: '#cbdce5', roughness: 1 }),
  );
  backdrop.rotation.x = -Math.PI / 2;
  backdrop.position.y = -3.1;
  backdrop.receiveShadow = true;
  scene.add(backdrop);
  const camera = new THREE.PerspectiveCamera(42, 1, 0.15, 3000);
  camera.position.set(260, 20, 100);
  const controls = new OrbitControls(camera, canvas);
  const transform = new TransformControls(camera, canvas);
  transform.enabled = false;
  scene.add(transform.getHelper());
  controls.target.set(0, 0, 0);
  controls.enableDamping = true;
  controls.dampingFactor = 0.09;
  controls.minDistance = 35;
  controls.maxDistance = 1300;
  controls.maxPolarAngle = Math.PI / 2 - 0.04;
  controls.minPolarAngle = 0.08;
  controls.enabled = false;
  controls.update();
  let model: THREE.Group | undefined,
    disposed = false,
    mode: ViewMode = 'fly';
  let yaw = Math.PI / 2,
    pitch = 0,
    drag: { x: number; y: number; id: number } | null = null,
    down: { x: number; y: number } | null = null;
  let frame = 0,
    lastTime = 0,
    lastActivity = 0,
    labelTime = 0,
    highlight: THREE.BoxHelper | undefined;
  let session: BuildSession | undefined;
  let builderActive = false, markerActive = false, buildTool: BuildTool = 'translate', buildSnap = true;
  const markerGroup = new THREE.Group(); scene.add(markerGroup);
  let savedMarkers: RoomMarker[] = [];
  let hoveredMarker: string|null=null;
  const markerOwner = (id:string) => id==='@ground'?model:session?.object(id);
  const surfaceHits = () => model ? raycaster.intersectObject(model,true).filter(hit=>{
    for(let obj:THREE.Object3D|null=hit.object;obj;obj=obj.parent)if(!obj.visible)return false;
    return true;
  }) : [];
  const showMarker = (id:string|null) => {
    hoveredMarker=id;
    const sprite=markerGroup.children.find(c=>c.userData.markerId===id);
    if(!sprite||!sprite.visible){onMarkerHover(null);return;}
    const p=sprite.position.clone().project(camera),rect=canvas.getBoundingClientRect();
    onMarkerHover({id:id!,x:rect.left+(p.x+1)*rect.width/2,y:rect.top+(1-p.y)*rect.height/2});
  };
  let moved = false;
  const clearMarkers = () => {
    for (const child of [...markerGroup.children]) {
      const sprite = child as THREE.Sprite;
      sprite.material.map?.dispose(); sprite.material.dispose(); markerGroup.remove(sprite);
    }
  };
  const setMarkers = (items: RoomMarker[]) => {
    savedMarkers = items;
    clearMarkers();
    for (const item of items) {
      const label = document.createElement('canvas'); label.width=64; label.height=64;
      const ctx=label.getContext('2d')!;
      ctx.beginPath();ctx.arc(32,32,27,0,Math.PI*2);ctx.fillStyle='#dc2626';ctx.fill();
      ctx.lineWidth=6;ctx.strokeStyle='white';ctx.stroke();
      const texture=new THREE.CanvasTexture(label); texture.colorSpace=THREE.SRGBColorSpace;
      const sprite=new THREE.Sprite(new THREE.SpriteMaterial({map:texture,depthTest:true,depthWrite:false,alphaTest:.1}));
      sprite.userData.markerId=item.id; sprite.center.set(.5,0); markerGroup.add(sprite);
    }
    wake();
  };
  let selectedBuild: string | null = null, pendingTemplate: string | null = null;
  let ghost: THREE.Group | null = null, gizmoPointer = false;
  let buildHighlight: THREE.BoxHelper | null = null;
  const pressed = new Set<string>(),
    raycaster = new THREE.Raycaster(),
    pointer = new THREE.Vector2();
  const boundary = data.boundary as Point[],
    initialObstacles = [
      ...data.buildings.map((b) => b.rings[0]),
      ...data.posts.map((p) => p.ring),
      ...data.landscapeObstacles,
      ...fenceObstacles(fences.fences),
      ...entranceObstacles,
    ] as Point[][],
    buildingIds = new Set(data.buildings.map((b) => b.id));
  let obstacles: Point[][] = initialObstacles;
  const arrivals: Record<string, Point> = Object.fromEntries(
    Object.entries({ ...data.walkSpawns, ...fences.walkArrivalOverrides }).map(([id, p]) => [
      id,
      [p[0], p[1]] as Point,
    ]),
  );
  let contextAvailable = true;
  const clearBuildHighlight = () => {
    if(buildHighlight){scene.remove(buildHighlight);buildHighlight.geometry.dispose();(buildHighlight.material as THREE.Material).dispose();buildHighlight=null;}
  };
  const publishBuilder = () => {
    const item=selectedBuild?session?.item(selectedBuild):undefined;
    if(item?.deleted||!item){selectedBuild=null;transform.detach();clearBuildHighlight();}
    else if(builderActive){
      const obj=session!.object(item.id)!;transform.attach(obj);transform.enabled=true;
      if(!buildHighlight){buildHighlight=new THREE.BoxHelper(obj,0x1866ed);scene.add(buildHighlight);}else buildHighlight.setFromObject(obj);
    }
    const warnings=selectedBuild?session?.warnings(selectedBuild)||[]:[];
    if(buildHighlight)(buildHighlight.material as THREE.LineBasicMaterial).color.set(warnings.length?0xe69224:0x1866ed);
    onBuilder({active:builderActive,tool:buildTool,snap:buildSnap,pending:pendingTemplate,catalog:session?.catalog||[],selected:item&&!item.deleted?{...item,name:session!.template(item.templateId)!.name}:null,added:session?.addedCount||0,changed:session?.changedCount||0,canUndo:!!session?.canUndo,canRedo:!!session?.canRedo,warnings});
    renderer.shadowMap.needsUpdate=true;wake();
  };
  const cancelPlacement = () => {
    if(ghost){scene.remove(ghost);ghost.traverse(o=>{if(o instanceof THREE.Mesh){const mats=Array.isArray(o.material)?o.material:[o.material];mats.forEach(m=>m.dispose());}});ghost=null;}
    pendingTemplate=null;canvas.style.cursor='';publishBuilder();
  };
  const selectBuild = (id: string | null) => {
    selectedBuild=id;clearBuildHighlight();if(!id)transform.detach();publishBuilder();
  };
  const setBuildTool = (tool: BuildTool) => {
    buildTool=tool;transform.setMode(tool);transform.showX=tool!=='rotate';transform.showY=true;transform.showZ=tool!=='rotate';publishBuilder();
  };
  const setBuildSnap = (snap: boolean) => {
    buildSnap=snap;transform.setTranslationSnap(snap?.5:null);transform.setRotationSnap(snap?Math.PI/12:null);transform.setScaleSnap(snap?.1:null);publishBuilder();
  };
  const addBuildPiece = (templateId: string) => {
    if(markerActive)return;
    if(!builderActive||!session)return;
    cancelPlacement();selectBuild(null);ghost=session.preview(templateId)||null;if(!ghost)return;
    ghost.traverse(o=>{if(o instanceof THREE.Mesh){const soften=(m:THREE.Material)=>{const c=m.clone();c.transparent=true;c.opacity=.55;c.depthWrite=false;return c;};o.material=Array.isArray(o.material)?o.material.map(soften):soften(o.material);o.castShadow=false;}});
    ghost.position.set(controls.target.x,session.template(templateId)!.baseY,controls.target.z);scene.add(ghost);pendingTemplate=templateId;canvas.style.cursor='crosshair';publishBuilder();
  };
  const duplicateBuildPiece = () => {if(builderActive&&selectedBuild&&session)selectBuild(session.duplicate(selectedBuild));};
  const deleteBuildPiece = () => {if(builderActive&&selectedBuild)session?.remove(selectedBuild);};
  const rotateBuildPiece = (degrees: number) => {
    const item=selectedBuild?session?.item(selectedBuild):null;
    if(builderActive&&item)session?.update(item.id,{rotation:[0,item.rotation[1]+THREE.MathUtils.degToRad(degrees),0]});
  };
  const undoBuildPiece = () => {cancelPlacement();transform.detach();session?.undo();};
  const redoBuildPiece = () => {cancelPlacement();transform.detach();session?.redo();};
  const exportBuild = () => session?.export()||'';
  const importBuild = (json: string) => {if(!session)throw new Error('模型仍在加载');cancelPlacement();session.import(json);selectBuild(null);};
  const focusBuildPiece = () => {
    if(!selectedBuild||!session)return;
    const box=new THREE.Box3().setFromObject(session.object(selectedBuild)!,true),center=box.getCenter(new THREE.Vector3());
    const span=Math.max(12,box.getSize(new THREE.Vector3()).length());controls.target.copy(center);camera.position.copy(center).add(new THREE.Vector3(span*.6,span*.85,span));controls.update();wake();
  };
  transform.addEventListener('dragging-changed',e=>{controls.enabled=mode==='overview'&&!e.value;});
  transform.addEventListener('mouseDown',()=>{if(builderActive)session?.begin();});
  transform.addEventListener('objectChange',()=>{if(selectedBuild&&builderActive){session?.capture(selectedBuild);buildHighlight?.update();renderer.shadowMap.needsUpdate=true;wake();}});
  transform.addEventListener('mouseUp',()=>{if(builderActive)session?.commit();gizmoPointer=false;});
  transform.addEventListener('change',()=>wake());
  function wake() {
    if (disposed || !contextAvailable) return;
    lastActivity = performance.now();
    if (!frame && !document.hidden) frame = requestAnimationFrame(animate);
  }
  controls.addEventListener('change', wake);
  let transition: { position: THREE.Vector3; target: THREE.Vector3 } | null =
    null;
  const safeNear = (p: Point): Point => {
    for (let r = 0; r < 70; r += 2)
      for (let i = 0; i < 24; i++) {
        const q: Point = [
          p[0] + r * Math.cos((i * Math.PI) / 12),
          p[1] + r * Math.sin((i * Math.PI) / 12),
        ];
        if (walkable(q, boundary, obstacles, 1)) return q;
      }
    return arrivals.entrance;
  };
  const setMode = (next: ViewMode) => {
    // Overview is retained only for backwards-compatible controller calls.
    // There is no campus camera anymore; any legacy request is normalized to
    // the free-flight camera before it can affect controls or projection.
    if (next === 'overview') next = 'fly';
    if (builderActive) setBuildMode(false);
    mode = next;
    pressed.clear();
    drag = null;
    controls.enabled = false;
    transition = null;
    if (next === 'fly') {
      camera.position.set(260, 20, 100);
      yaw = Math.PI / 2; pitch = -0.18;
      camera.rotation.set(pitch, yaw, 0, 'YXZ');
    } else if (next === 'walk') {
      const p = arrivals.entrance;
      camera.position.set(p[0], 1.8, p[1]);
      yaw = Math.PI / 2;
      pitch = 0;
      camera.rotation.set(pitch, yaw, 0, 'YXZ');
    } else {
      camera.position.set(460, 540, 650);
      controls.target.set(0, 0, 0);
      controls.update();
    }
    canvas.focus({ preventScroll: true });
    wake();
  };
  const setBuildMode = (active: boolean) => {
    markerActive=false;
    // Build mode is a free-flight variant of the fly camera. Keep the
    // engine's internal mode in sync so vertical movement and unconstrained
    // navigation use the same flight branch as the Fly tab.
    if (active && mode !== 'fly') setMode('fly');
    cancelPlacement();session?.cancel();builderActive=active;
    transform.detach();transform.enabled=false;selectedBuild=null;clearBuildHighlight();
    controls.enabled=!active && mode==='overview';controls.minDistance=active?4:35;
    canvas.setAttribute(
      'aria-label',
      active
        ? '飞行建造模式。拖动鼠标转向，使用 W A S D 移动，E 上升，Q 下降，Shift 加速。'
        : 'Interactive 3D campus. Drag to look around. In walk mode use W A S D or arrow keys to move.',
    );
    if (active) {
      camera.position.set(260, 80, 180);
      yaw = Math.atan2(camera.position.x, camera.position.z);
      pitch = -0.2;
      camera.rotation.set(pitch, yaw, 0, 'YXZ');
    }
    if(highlight){scene.remove(highlight);highlight.geometry.dispose();(highlight.material as THREE.Material).dispose();highlight=undefined;}
    pressed.clear();drag=null;down=null;setBuildTool(buildTool);setBuildSnap(buildSnap);
    if(!active) obstacles = [
      ...(session?.collisionRings() || []),
      ...(entranceObstacles as Point[][]),
    ];
    canvas.focus({preventScroll:true});publishBuilder();
  };
  const setMarkerMode = (active: boolean) => {
    markerActive=active&&builderActive; cancelPlacement(); selectBuild(null); transform.enabled=false;
    pressed.clear(); down=null; drag=null; canvas.style.cursor=markerActive?'crosshair':'';
    canvas.focus({preventScroll:true}); wake();
  };
  const reset = () => {
    pressed.clear();
    transition = null;
    if (mode !== 'overview') setMode(mode);
    else {
      camera.position.set(460, 540, 650);
      controls.target.set(0, 0, 0);
      controls.update();
    }
    wake();
  };
  const focus = (id: string) => {
    const place = data.landmarks.find((p) => p.id === id),
      b = data.buildings.find((p) => p.id === id);
    const position =
      place?.position ||
      (b
        ? [
            b.rings[0].reduce((s, p) => s + p[0], 0) / b.rings[0].length,
            b.rings[0].reduce((s, p) => s + p[1], 0) / b.rings[0].length,
          ]
        : null);
    if (!position) return;
    if (mode !== 'overview') {
      const q = arrivals[id] || safeNear([position[0] + 16, position[1] + 20]);
      camera.position.set(q[0], mode === 'fly' ? 20 : 1.8, q[1]);
      yaw = Math.atan2(q[0] - position[0], q[1] - position[1]);
      pitch = 0.02;
      camera.rotation.set(pitch, yaw, 0, 'YXZ');
    } else {
      transition = {
        position: new THREE.Vector3(position[0] + 105, 130, position[1] + 135),
        target: new THREE.Vector3(position[0], 0, position[1]),
      };
      if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
        camera.position.copy(transition.position);
        controls.target.copy(transition.target);
        transition = null;
        controls.update();
      }
    }
    if (highlight) {
      scene.remove(highlight);
      highlight.geometry.dispose();
      (highlight.material as THREE.Material).dispose();
      highlight = undefined;
    }
    const obj = model?.getObjectByName(id);
    if (obj) {
      highlight = new THREE.BoxHelper(obj, 0x2b76d3);
      scene.add(highlight);
    }
    if (mode === 'walk') canvas.focus({ preventScroll: true });
    wake();
  };
  new GLTFLoader().load(
    `${editorAssets.url}?v=${editorAssets.revision}`,
    (gltf) => {
      if (disposed) {
        disposeObject(gltf.scene);
        return;
      }
      model = gltf.scene;
      model.traverse((obj) => {
        if (obj instanceof THREE.Mesh) {
          const box = new THREE.Box3().setFromObject(obj);
          obj.castShadow = box.max.y > 0.6;
          obj.receiveShadow = true;
        }
      });
      scene.add(model);
      session=new BuildSession(model,editorAssets.revision,boundary);
      // Use the administrator's exported layout verbatim. This intentionally
      // avoids any inferred or corrective fence edits.
      try {
        session.import(JSON.stringify(defaultBuild), true);
      } catch (error) {
        console.error('默认地图布局加载失败', error);
      }
      session.onChange=publishBuilder;
      publishBuilder();
      renderer.shadowMap.needsUpdate = true;
      onReady();
      wake();
    },
    undefined,
    () => {
      if (!disposed)
        onError(
          'The campus model could not load. Reload the page to try again.',
        );
    },
  );
  function resize() {
    const width = host.clientWidth,
      height = host.clientHeight;
    if (!width || !height) return;
    renderer.setSize(width, height);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    wake();
  }
  const observer = new ResizeObserver(resize);
  observer.observe(host);
  resize();
  const pointerDown = (e: PointerEvent) => {
    showMarker(null);
    transition = null;
    if (e.button !== 0) return;
    moved=false;
    // OrbitControls must never receive mouse control outside the removed
    // overview camera. Lock it again at the event boundary as a safeguard
    // against focus/blur and transform-control listeners.
    if (mode !== 'overview') controls.enabled = false;
    down = { x: e.clientX, y: e.clientY };
    if(builderActive){
      gizmoPointer=!!transform.axis&&!!transform.object&&transform.enabled;
      canvas.focus({preventScroll:true});
      if(pendingTemplate)controls.enabled=false;
      if (!gizmoPointer && !pendingTemplate) {
        drag = { x: e.clientX, y: e.clientY, id: e.pointerId };
        canvas.setPointerCapture(e.pointerId);
      }
    }
    wake();
    if (mode !== 'overview') {
      drag = { x: e.clientX, y: e.clientY, id: e.pointerId };
      canvas.setPointerCapture(e.pointerId);
      canvas.focus({ preventScroll: true });
    }
  };
  const pointerMove = (e: PointerEvent) => {
    if(!down){
      const rect=canvas.getBoundingClientRect();pointer.set((e.clientX-rect.left)/rect.width*2-1,1-(e.clientY-rect.top)/rect.height*2);
      camera.updateMatrixWorld();raycaster.setFromCamera(pointer,camera);
      const pin=raycaster.intersectObjects(markerGroup.children.filter(c=>c.visible),false)[0], hit=pin?surfaceHits()[0]:undefined;
      const id=pin&&(!hit||pin.distance<=hit.distance+.3)?pin.object.userData.markerId:null;
      showMarker(id);canvas.style.cursor=id?'pointer':markerActive?'crosshair':'';
    }
    if(down&&Math.hypot(e.clientX-down.x,e.clientY-down.y)>=5) moved=true;
    if(builderActive){
      if(ghost&&pendingTemplate&&session){
        const rect=canvas.getBoundingClientRect();pointer.set((e.clientX-rect.left)/rect.width*2-1,1-(e.clientY-rect.top)/rect.height*2);raycaster.setFromCamera(pointer,camera);
        const hit=raycaster.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0,1,0),0),new THREE.Vector3());
        if(hit){const snap=(n:number)=>buildSnap?Math.round(n*2)/2:n;ghost.position.set(snap(hit.x),session.template(pendingTemplate)!.baseY,snap(hit.z));wake();}
      }
      if (!ghost && drag && drag.id === e.pointerId) {
        yaw -= (e.clientX - drag.x) * 0.004;
        pitch = Math.max(-1.05, Math.min(1.05, pitch - (e.clientY - drag.y) * 0.004));
        drag.x = e.clientX; drag.y = e.clientY;
        camera.rotation.set(pitch, yaw, 0, 'YXZ');
        wake();
      }
      return;
    }
    if (!drag || mode === 'overview' || drag.id !== e.pointerId) return;
    yaw -= (e.clientX - drag.x) * 0.004;
    pitch = Math.max(
      -1.05,
      Math.min(1.05, pitch - (e.clientY - drag.y) * 0.004),
    );
    drag.x = e.clientX;
    drag.y = e.clientY;
    camera.rotation.set(pitch, yaw, 0, 'YXZ');
    wake();
  };
  const pointerUp = (e: PointerEvent) => {
    const tap=!!down&&!moved&&e.button===0&&Math.hypot(e.clientX-down.x,e.clientY-down.y)<5;
    if(tap && session){
      const rect=canvas.getBoundingClientRect(); pointer.set((e.clientX-rect.left)/rect.width*2-1,1-(e.clientY-rect.top)/rect.height*2);
      camera.updateMatrixWorld(); model?.updateWorldMatrix(true,true); raycaster.setFromCamera(pointer,camera);
      const hits=surfaceHits();
      const pin=raycaster.intersectObjects(markerGroup.children.filter(c=>c.visible),false)[0];
      if(pin && (!hits[0] || pin.distance<=hits[0].distance+1)){
        showMarker(pin.object.userData.markerId); down=null;drag=null;wake();return;
      }
      if(markerActive&&builderActive){
        const hit=hits[0], owner=hit&&session.ownerOf(hit.object);
        const item=owner?session.item(owner):undefined, template=item?session.template(item.templateId):undefined;
        const upward=!!hit?.face && hit.face.normal.clone().applyMatrix3(new THREE.Matrix3().getNormalMatrix(hit.object.matrixWorld)).normalize().y>.5;
        const ground=upward && (!owner || (template?.category==='decoration' && hit.point.y<=1 && template.size[1]<=1));
        if(hit && (ground || (template&&['building','grass','walkway'].includes(template.category)))){
          const obj=owner?session.object(owner)!:model!;
          const normal=hit.face?.normal.clone().applyMatrix3(new THREE.Matrix3().getNormalMatrix(hit.object.matrixWorld)).normalize()||new THREE.Vector3(0,1,0);
          const local=obj.worldToLocal(hit.point.clone().addScaledVector(normal,.06));
          onMarker({owner:owner||'@ground',point:local.toArray() as Vec3,building:ground?'地面':template?.name||'地面'});
        }else onMarkerMessage('请点击建筑物或地面表面，天空和装饰物不能放置房间标记。');
        down=null;drag=null;wake();return;
      }
    }
    if(builderActive){
      const clicked=tap;
      if(!gizmoPointer&&!transform.dragging&&clicked&&session){
        if(pendingTemplate&&ghost){
          // Tap placement also works without a preceding pointermove.
          pointerMove(e);const id=session.add(pendingTemplate,ghost.position.toArray() as Vec3);cancelPlacement();selectBuild(id);
        }else{
          const rect=canvas.getBoundingClientRect();pointer.set((e.clientX-rect.left)/rect.width*2-1,1-(e.clientY-rect.top)/rect.height*2);raycaster.setFromCamera(pointer,camera);
          const hit=raycaster.intersectObjects(session.visibleObjects(),true)[0];selectBuild(session.ownerOf(hit?.object||null));
        }
      }
      down=null;drag=null;controls.enabled=false;wake();return;
    }
    drag = null;
    if (
      down &&
      Math.hypot(e.clientX - down.x, e.clientY - down.y) < 5 &&
      model
    ) {
      const rect = canvas.getBoundingClientRect();
      pointer.set(
        ((e.clientX - rect.left) / rect.width) * 2 - 1,
        (-(e.clientY - rect.top) / rect.height) * 2 + 1,
      );
      raycaster.setFromCamera(pointer, camera);
      const hit = raycaster.intersectObject(model, true)[0];
      let obj: THREE.Object3D | undefined = hit?.object;
      let selectedId: string | undefined;
      while (obj) {
        const candidate = obj.userData?.buildingId;
        if (typeof candidate === 'string' && buildingIds.has(candidate)) {
          selectedId = candidate;
          break;
        }
        // Some GLTF exporters preserve the parent node name but omit custom
        // extras. The name fallback keeps click-to-select working either way.
        if (buildingIds.has(obj.name)) {
          selectedId = obj.name;
          break;
        }
        obj = obj.parent ?? undefined;
      }
      if (selectedId) onSelect(selectedId);
    }
    down = null;
    wake();
  };
  const keyDown = (e: KeyboardEvent) => {
    if(builderActive){
      if((e.metaKey||e.ctrlKey)&&e.code==='KeyZ'){e.preventDefault();if(e.shiftKey)redoBuildPiece();else undoBuildPiece();}
      else if((e.metaKey||e.ctrlKey)&&e.code==='KeyD'){e.preventDefault();duplicateBuildPiece();}
      else if(e.code==='Delete'||e.code==='Backspace'){e.preventDefault();deleteBuildPiece();}
      else if(e.code==='KeyR'){e.preventDefault();rotateBuildPiece(90);}
      else if(e.code==='KeyG')setBuildTool('translate');
      else if(e.code==='KeyT')setBuildTool('rotate');
      else if(['KeyW','KeyA','KeyS','KeyD','KeyE','KeyQ','ArrowUp','ArrowDown','ArrowLeft','ArrowRight','ShiftLeft','ShiftRight'].includes(e.code)){e.preventDefault();pressed.add(e.code);wake();}
      else if(e.code==='Escape'){cancelPlacement();transform.reset();session?.cancel();selectBuild(null);}
      return;
    }
    if (
      [
        'KeyW',
        'KeyA',
        'KeyS',
        'KeyD',
        'ArrowUp',
        'ArrowDown',
        'ArrowLeft',
        'ArrowRight',
        'ShiftLeft',
        'ShiftRight',
        'KeyE', 'KeyQ',
      ].includes(e.code) &&
      mode !== 'overview'
    ) {
      e.preventDefault();
      pressed.add(e.code);
      wake();
    }
    if (e.code === 'Escape') pressed.clear();
  };
  const keyUp = (e: KeyboardEvent) => {
      pressed.delete(e.code);
      wake();
    },
    clearInput = () => {
      pressed.clear();
      drag = null;
      down = null;
      if(builderActive&&transform.dragging){transform.reset();session?.cancel();transform.dragging=false;}
      controls.enabled=false;gizmoPointer=false;
    };
  const visibilityChanged = () => {
    clearInput();
    if (document.hidden) {
      cancelAnimationFrame(frame);
      frame = 0;
    } else {
      lastTime = performance.now();
      wake();
    }
  };
  const contextLost = (event: Event) => {
    event.preventDefault();
    contextAvailable = false;
    cancelAnimationFrame(frame);
    frame = 0;
    onError(
      '3D graphics were interrupted. Reload the page to restore the campus.',
    );
  };
  canvas.addEventListener('pointerdown', pointerDown, true);
  canvas.addEventListener('pointermove', pointerMove);
  canvas.addEventListener('pointerup', pointerUp, true);
  canvas.addEventListener('pointercancel', clearInput);
  canvas.addEventListener('keydown', keyDown);
  canvas.addEventListener('webglcontextlost', contextLost);
  window.addEventListener('keyup', keyUp);
  window.addEventListener('blur', clearInput);
  canvas.addEventListener('blur', clearInput);
  document.addEventListener('visibilitychange', visibilityChanged);
  const labelVector = new THREE.Vector3();
  function animate(now: number) {
    frame = 0;
    if (disposed || !contextAvailable || document.hidden) return;
    const dt = Math.min((now - lastTime) / 1000, 0.05);
    lastTime = now;
    if (mode === 'overview' && !builderActive) {
      if (transition) {
        const ease = 1 - Math.exp(-8 * dt);
        camera.position.lerp(transition.position, ease);
        controls.target.lerp(transition.target, ease);
        if (camera.position.distanceTo(transition.position) < 0.3)
          transition = null;
      }
      controls.update();
      controls.target.x = THREE.MathUtils.clamp(controls.target.x, -330, 330);
      controls.target.z = THREE.MathUtils.clamp(controls.target.z, -250, 250);
    } else {
      let forward =
          (pressed.has('KeyW') || pressed.has('ArrowUp') ? 1 : 0) -
          (pressed.has('KeyS') || pressed.has('ArrowDown') ? 1 : 0),
        side =
          (pressed.has('KeyD') || pressed.has('ArrowRight') ? 1 : 0) -
          (pressed.has('KeyA') || pressed.has('ArrowLeft') ? 1 : 0);
      const norm = Math.hypot(forward, side) || 1;
      forward /= norm;
      side /= norm;
      if (mode === 'fly') {
        const vertical = Number(pressed.has('KeyE')) - Number(pressed.has('KeyQ'));
        camera.position.y = THREE.MathUtils.clamp(camera.position.y + vertical * dt * (pressed.has('ShiftLeft') ? 40 : 15), 1.8, 250);
      }
      if (forward || side) {
        const speed =
          (pressed.has('ShiftLeft') || pressed.has('ShiftRight') ? 14 : 7) * dt;
        const delta: Point = [
          (-Math.sin(yaw) * forward + Math.cos(yaw) * side) * speed,
          (-Math.cos(yaw) * forward - Math.sin(yaw) * side) * speed,
        ];
        const p = mode === 'fly' ? [
          THREE.MathUtils.clamp(camera.position.x + delta[0]*2, -500, 500),
          THREE.MathUtils.clamp(camera.position.z + delta[1]*2, -450, 450),
        ] : moveSafely(
          [camera.position.x, camera.position.z],
          delta,
          boundary,
          obstacles,
        );
        camera.position.x = p[0];
        camera.position.z = p[1];
      }
    }
    if (now - labelTime > 100) {
      labelTime = now;
      const occupied: { x: number; y: number }[] = [];
      let visibleCount = 0;
      onFrame(
        data.landmarks.map((p) => {
          const original=session?.object(p.id);
          const center=original?new THREE.Box3().setFromObject(original,true).getCenter(new THREE.Vector3()):null;
          const v = labelVector.set(center?.x??p.position[0], p.height + 5, center?.z??p.position[1]),
            distance = v.distanceTo(camera.position);
          v.project(camera);
          const x = (v.x * 0.5 + 0.5) * host.clientWidth;
          const y = (-0.5 * v.y + 0.5) * host.clientHeight;
          const visible =
            !builderActive && original?.visible!==false &&
            v.z < 1 &&
            v.z > -1 &&
            Math.abs(v.x) < 0.94 &&
            Math.abs(v.y) < 0.86 &&
            (mode === 'overview' || distance < 65) &&
            visibleCount < (touch ? 4 : 7) &&
            !occupied.some(
              (q) => Math.abs(q.x - x) < 155 && Math.abs(q.y - y) < 32,
            );
          if (visible) {
            occupied.push({ x, y });
            visibleCount++;
          }
          return {
            id: p.id,
            x,
            y,
            visible,
          };
        }),
      );
    }
    for(let i=0;i<savedMarkers.length;i++){
      const item=savedMarkers[i], sprite=markerGroup.children[i], owner=markerOwner(item.owner);
      sprite.visible=!!owner&&owner.visible;
      if(owner){owner.updateWorldMatrix(true,false);sprite.position.copy(owner.localToWorld(new THREE.Vector3(...item.point)));}
      const depth=-sprite.position.clone().applyMatrix4(camera.matrixWorldInverse).z;
      const size=Math.max(.02,depth)*2*Math.tan(THREE.MathUtils.degToRad(camera.fov/2))*16/host.clientHeight;
      sprite.scale.set(size,size,1);
    }
    if(hoveredMarker)showMarker(hoveredMarker);
    renderer.render(scene, camera);
    if (
      !frame &&
      needsFrame(
        now,
        lastActivity,
        pressed.size > 0 || !!transition || !!drag || transform.dragging,
        !document.hidden,
      )
    )
      frame = requestAnimationFrame(animate);
  }
  wake();
  return {
    setMode,
    focus,
    reset,
    zoom: (direction) => {
      if (mode === 'overview') {
        transition = null;
        camera.position
          .sub(controls.target)
          .multiplyScalar(direction > 0 ? 0.8 : 1.25)
          .add(controls.target);
        controls.update();
        wake();
      }
    },
    setInput: (key, active) => {
      if (active) pressed.add(key);
      else pressed.delete(key);
      wake();
    },
    addBuildPiece,
    undoBuildPiece,
    redoBuildPiece,
    setBuildMode,
    setMarkerMode,
    setMarkers,
    setBuildTool,
    setBuildSnap,
    duplicateBuildPiece,
    deleteBuildPiece,
    rotateBuildPiece,
    cancelPlacement,
    focusBuildPiece,
    importBuild,
    exportBuild,
    dispose: () => {
      disposed = true;
      clearMarkers();
      cancelAnimationFrame(frame);
      observer.disconnect();
      controls.removeEventListener('change', wake);
      controls.dispose();
      transform.dispose();
      cancelPlacement();clearBuildHighlight();
      canvas.removeEventListener('pointerdown', pointerDown, true);
      canvas.removeEventListener('pointermove', pointerMove);
      canvas.removeEventListener('pointerup', pointerUp, true);
      canvas.removeEventListener('pointercancel', clearInput);
      canvas.removeEventListener('keydown', keyDown);
      canvas.removeEventListener('webglcontextlost', contextLost);
      canvas.removeEventListener('blur', clearInput);
      window.removeEventListener('keyup', keyUp);
      window.removeEventListener('blur', clearInput);
      document.removeEventListener('visibilitychange', visibilityChanged);
      disposeObject(scene);
      renderer.dispose();
      canvas.remove();
    },
  };
}
function disposeObject(root: THREE.Object3D) {
  root.traverse((obj) => {
    if (obj instanceof THREE.Mesh || obj instanceof THREE.Line) {
      obj.geometry.dispose();
      const materials = Array.isArray(obj.material)
        ? obj.material
        : [obj.material];
      materials.forEach((m) => m.dispose());
    }
  });
}
