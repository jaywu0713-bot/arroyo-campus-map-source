# Arroyo Campus Walk

最后修改日期：2026-09-06（America/Los_Angeles）

Arroyo High School（4921 Cedar Ave, El Monte）的室外校园 3D 原型。进入网页即可旋转、缩放和平移；Walk around 模式支持拖动视角、WASD/方向键行走、触屏方向按钮。点击建筑显示名称，左侧地点列表可定位。室内未建模。

## 文件

- `model/arroyo-campus.blend`：可继续编辑的 Blender 源模型。
- `public/models/arroyo-campus.glb`：网页模型。
- `data/campus.json`：模型与碰撞检测共用的数据（X 向东、Z 向南，单位米）。
- `data/sources/osm-campus.geojson`：公开地图原始几何。
- `data/building-traces.json`：为保留室外通行空间而拆开的主要楼体语义数据。原始描图来自官方 G-101；当前校园整体布局以 OpenStreetMap 为主，并参考用户提供的航拍图调整绿地、步道和屋顶表达。楼体位置仍是近似值，需后续实景校准。
- `docs/SOURCES.md`：来源与准确度说明。

## 本地运行与修改

Windows 本地预览：运行 `npm install` 后运行 `npm run dev`，打开 `http://127.0.0.1:3001/`。本地预览使用静态客户端入口，不依赖 Sites 登录服务。旧的 8000 端口是另一个静态仓库，并不包含这些修改。

在飞行建造面板右上方开启标记模式，单击建筑/地面表面，填写教室编号（老师、教学种类选填）。New Building 必须选择楼层。标记绑定模型局部坐标，拖动视角不会创建标记；保存后点击标签可编辑或删除。标记存放在当前浏览器当前网址的本地存储中。

```sh
npm install
npm run dev -- --host 127.0.0.1
```

以服务打印的本地网址为准。更改建筑数据后重新生成模型：

GitHub Pages 静态版本的本地预览需要通过开发服务器打开，不能直接双击 `static/index.html`：

```sh
npm run preview:static
```

然后访问终端显示的本地网址。直接使用 `file://` 会被浏览器阻止模块和 3D 模型加载。

```sh
node --experimental-strip-types scripts/prepare-campus.mts
/Applications/Blender.app/Contents/MacOS/Blender --background --python scripts/build_campus.py
node scripts/verify-model.mjs
```

Blender 文件保留独立可编辑物体；GLB 按建筑和材质合并网格，降低网页绘制开销。可直接在 Blender 打开 .blend 修改，但再次运行生成脚本会覆盖生成文件，因此手工编辑版本应另存。

## 检查

```sh
node --experimental-strip-types --test tests/spatial.test.ts
npx tsc --noEmit
npm run build
```

空间测试覆盖米制投影、凹形院落、建筑阻挡、沿墙滑动和校园边界。模型校验使用 Three.js 实际解析 GLB，核对建筑 ID 和场景尺寸。当前版本未做实地测量；航拍图仅作为布局参考，未直接嵌入网页。请在实际手机和电脑上查看后继续校准外观与操作体验。
