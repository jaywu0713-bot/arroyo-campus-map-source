import fs from 'node:fs';
import { ShapeUtils, Vector2 } from 'three';
import {
  project,
  inside,
  walkable,
  distanceToEdge,
  type Point,
} from '../lib/spatial.ts';

const origin: Point = [-118.0231, 34.09445];
type FeatureBase = {
  id: string;
  properties: Record<string, string | undefined>;
};
type PolygonFeature = FeatureBase & {
  geometry: { type: 'Polygon'; coordinates: Point[][] };
};
type LineFeature = FeatureBase & {
  geometry: { type: 'LineString'; coordinates: Point[] };
};
type SourceFeature =
  | PolygonFeature
  | LineFeature
  | (FeatureBase & { geometry: { type: 'Point'; coordinates: Point } });
type BuildingInfo = {
  id: string;
  name: string;
  height: number;
  category?: string;
  landmark?: boolean;
  roof?: string;
  structure?: string;
};
type Building = BuildingInfo &
  ReturnType<typeof polygon> & {
    source: string;
    heightSource: string;
    points?: undefined;
  };
type BuildingTrace = BuildingInfo & { points: Point[] };
type ExteriorBuilding = BuildingInfo & {
  points?: Point[];
  keepExisting?: boolean;
  arrival?: Point;
};
type Exterior = {
  source: string;
  registration: { x: [number, number, number]; z: [number, number, number] };
  buildings: ExteriorBuilding[];
  walkways: { id: string; kind: 'covered' | 'eave'; points: Point[] }[];
  plazas: { id: string; points: Point[] }[];
};
const source: { features: SourceFeature[] } = JSON.parse(
  fs.readFileSync('data/sources/osm-campus.geojson', 'utf8'),
);
const sourcePolygons = source.features.filter(
  (f): f is PolygonFeature => f.geometry.type === 'Polygon',
);
const ring = (points: Point[]) => {
  const p = points.map(
    ([lon, lat]) =>
      project(lon, lat, origin).map((n) => Math.round(n * 100) / 100) as Point,
  );
  if (p.length > 1 && p[0][0] === p.at(-1)![0] && p[0][1] === p.at(-1)![1])
    p.pop();
  return p;
};
function polygon(rings: Point[][]) {
  const vertices = rings.flat();
  const triangles = ShapeUtils.triangulateShape(
    rings[0].map((p) => new Vector2(...p)),
    rings.slice(1).map((r) => r.map((p) => new Vector2(...p))),
  );
  return { rings, vertices, triangles };
}
const boundaryFeature = sourcePolygons.find((f) => f.id === 'way/29188066');
if (!boundaryFeature)
  throw new Error('Campus boundary missing from source data');
const boundary = ring(boundaryFeature.geometry.coordinates[0]);
const buildings: Building[] = sourcePolygons
  .filter((f) => f.properties.building && f.id !== 'relation/6935504')
  .map((f) => ({
    id: f.id.replace('/', '-'),
    name: f.properties.name || 'Campus building',
    height: Number(f.properties.height) || 4.5,
    source: f.properties.osm_url || `https://www.openstreetmap.org/${f.id}`,
    heightSource: 'OpenStreetMap height tag, not field-verified',
    ...polygon(f.geometry.coordinates.map(ring)),
  }));
const traces: { source: string; buildings: BuildingTrace[] } = JSON.parse(
  fs.readFileSync('data/building-traces.json', 'utf8'),
);
const mappedPixel = ([x, y]: Point): Point => [
  Math.round((215.55 + (x - 1071) * 0.43867 - (y - 316) * 0.053165) * 100) /
    100,
  Math.round((-121.28 + (x - 1071) * 0.06099 + (y - 316) * 0.462658) * 100) /
    100,
];
for (const b of traces.buildings) {
  const rings = [b.points.map(mappedPixel)];
  // Replace an imported outline if its center is covered by a separately traced building.
  for (let i = buildings.length - 1; i >= 0; i--) {
    const pts = buildings[i].rings[0];
    const c: Point = [
      pts.reduce((s: number, p: Point) => s + p[0], 0) / pts.length,
      pts.reduce((s: number, p: Point) => s + p[1], 0) / pts.length,
    ];
    if (inside(c, rings[0])) buildings.splice(i, 1);
  }
  buildings.push({
    ...b,
    points: undefined,
    source: traces.source,
    heightSource: 'Approximate exterior height; not surveyed',
    ...polygon(rings),
  });
}
// The annotated aerial, rather than the old PDF plan, is the shared reference
// for wall footprints AND corridors. These are approximate exterior dimensions.
const exterior: Exterior = JSON.parse(
  fs.readFileSync('data/exterior-layout.json', 'utf8'),
);
const aerialPoint = ([x, y]: Point): Point => {
  const { registration: r } = exterior;
  return [
    r.x[0] * x + r.x[1] * y + r.x[2],
    r.z[0] * x + r.z[1] * y + r.z[2],
  ].map((n) => Math.round(n * 100) / 100) as Point;
};
for (const update of exterior.buildings) {
  const existing = buildings.find((b) => b.id === update.id);
  if (update.keepExisting) {
    if (!existing)
      throw new Error(`Preserved building ${update.id} is missing`);
    Object.assign(existing, update);
    continue;
  }
  if (!update.points) throw new Error(`No wall trace for ${update.id}`);
  const geometry = polygon([update.points.map(aerialPoint)]);
  for (let i = buildings.length - 1; i >= 0; i--) {
    const old = buildings[i];
    const p: Point = [
      old.vertices.reduce((s: number, q: Point) => s + q[0], 0) /
        old.vertices.length,
      old.vertices.reduce((s: number, q: Point) => s + q[1], 0) /
        old.vertices.length,
    ];
    if (old.id === update.id || inside(p, geometry.rings[0]))
      buildings.splice(i, 1);
  }
  buildings.push({
    ...update,
    points: undefined,
    source: exterior.source,
    heightSource: 'Approximate exterior height; not surveyed',
    ...geometry,
  });
}
// The approved language-area correction uses metre coordinates so all walls,
// canopy clearance and walk collisions stay registered to the existing campus.
const language: {
  revision: string; source: string;
  buildings: (BuildingInfo & { ring: Point[] })[];
  trees: { p: Point; trunkRadius: number }[];
} = JSON.parse(fs.readFileSync('data/language-layout.json', 'utf8'));
for (const update of language.buildings) {
  const existing = buildings.find((b) => b.id === update.id);
  const replacement = {
    ...existing, id: update.id, name: update.name, height: update.height,
    roof: update.roof, category: existing?.category || 'Learning',
    source: language.source, heightSource: 'Approximate exterior height from user photographs',
    ...polygon([update.ring]),
  };
  if (existing) Object.assign(existing, replacement);
  else buildings.push(replacement);
}
const landscapeObstacles = language.trees.map(({ p, trunkRadius: r }) =>
  Array.from({ length: 8 }, (_, i): Point => [
    p[0] + r * Math.cos(i * Math.PI / 4),
    p[1] + r * Math.sin(i * Math.PI / 4),
  ]),
);
const walkways = exterior.walkways.map((w) => ({
  ...w,
  source: exterior.source,
  width: w.kind === 'covered' ? 3.6 : 2.6,
  clearHeight: 3.2,
  points: w.points.map(aerialPoint),
}));
const plazas = exterior.plazas.map((p) => ({
  id: p.id,
  ...polygon([p.points.map(aerialPoint)]),
}));
const walls = buildings.map((b) => b.rings[0]) as Point[][];
const segments: { pathId: string; a: Point; b: Point; width: number }[] =
  walkways.flatMap((w) =>
    w.points.slice(1).map((b: Point, i: number) => ({
      pathId: w.id,
      a: w.points[i],
      b,
      width: w.width,
    })),
  );
const posts: { point: Point; ring: Point[]; height: number }[] = [];
for (const segment of segments) {
  const { a, b, width } = segment;
  const length = Math.hypot(b[0] - a[0], b[1] - a[1]);
  const nx = -(b[1] - a[1]) / length,
    nz = (b[0] - a[0]) / length;
  for (let d = 2.5; d < length - 1.5; d += 6)
    for (const side of [-1, 1]) {
      const point: Point = [
        a[0] + ((b[0] - a[0]) * d) / length + nx * (width / 2 + 0.05) * side,
        a[1] + ((b[1] - a[1]) * d) / length + nz * (width / 2 + 0.05) * side,
      ];
      if (!walkable(point, boundary, walls, 0.3)) continue;
      // Leave intersections and adjacent routes free of columns.
      if (
        segments.some(
          (s) =>
            s !== segment &&
            distanceToEdge(point, s.a, s.b) < s.width / 2 + 0.4,
        )
      )
        continue;
      if (
        posts.some(
          (p) => Math.hypot(point[0] - p.point[0], point[1] - p.point[1]) < 1,
        )
      )
        continue;
      const r = 0.16;
      posts.push({
        point,
        height: 3.2,
        ring: [
          [point[0] - r, point[1] - r],
          [point[0] + r, point[1] - r],
          [point[0] + r, point[1] + r],
          [point[0] - r, point[1] + r],
        ],
      });
    }
}
const surfaces = sourcePolygons
  .filter(
    (f) =>
      f.geometry.type === 'Polygon' &&
      !f.properties.building &&
      f.properties.amenity !== 'school',
  )
  .map((f) => ({
    id: f.id.replace('/', '-'),
    kind:
      (f.properties.sport === 'soccer'
        ? 'baseball-outfield'
        : f.properties.sport) ||
      f.properties.leisure ||
      f.properties.landuse ||
      'paving',
    ...polygon(f.geometry.coordinates.map(ring)),
  }));
const rectangle = (center: Point, size: Point, rotation = 0.12): Point[] => {
  const [x, y] = center,
    [width, height] = size;
  const corners: Point[] = [
    [x - width / 2, y - height / 2],
    [x + width / 2, y - height / 2],
    [x + width / 2, y + height / 2],
    [x - width / 2, y + height / 2],
  ];
  return corners.map(([px, pz]) => [
    x + (px - x) * Math.cos(rotation) - (pz - y) * Math.sin(rotation),
    y + (px - x) * Math.sin(rotation) + (pz - y) * Math.cos(rotation),
  ]);
};
// OSM tags these smaller hard courts and diamonds as point features. Preserve
// their outdoor footprint so the north and east recreation areas read like the
// aerial reference instead of empty lawn.
const extraSports = [
  {
    id: 'hard-court-apron',
    kind: 'hardcourt',
    center: [150.0, -40.0] as Point,
    size: [120, 36] as Point,
  },
  {
    id: 'basketball-court-1',
    kind: 'basketball',
    center: [120.8, -43.0] as Point,
    size: [14, 26] as Point,
  },
  {
    id: 'basketball-court-2',
    kind: 'basketball',
    center: [-218.4, -28.0] as Point,
    size: [24, 14] as Point,
  },
  {
    id: 'basketball-court-3',
    kind: 'basketball',
    center: [197.1, -33.4] as Point,
    size: [14, 26] as Point,
  },
  {
    id: 'basketball-court-5',
    kind: 'basketball',
    center: [101.3, -45.1] as Point,
    size: [14, 26] as Point,
  },
  {
    id: 'volleyball-court-1',
    kind: 'volleyball',
    center: [143.5, -40.0] as Point,
    size: [9, 18] as Point,
  },
  {
    id: 'volleyball-court-2',
    kind: 'volleyball',
    center: [159.5, -38.0] as Point,
    size: [9, 18] as Point,
  },
  {
    id: 'volleyball-court-3',
    kind: 'volleyball',
    center: [175.5, -36.0] as Point,
    size: [9, 18] as Point,
  },
];
surfaces.push(
  ...extraSports.map((s) => ({
    id: s.id,
    kind: s.kind,
    ...polygon([rectangle(s.center, s.size)]),
  })),
);
// Rounded dirt infields read like the supplied aerial without adding textures.
// Their sizes are approximate; the shared surrounding lawn remains walkable.
for (const [id, cx, cz, radius] of [
  ['baseball-diamond-1', 159.6, -73.3, 18],
  ['baseball-diamond-2', 65.9, -126.7, 21],
  ['baseball-diamond-3', 173.2, -168.1, 18],
] as [string, number, number, number][]) {
  const pts: Point[] =
    id === 'baseball-diamond-1'
      ? Array.from({ length: 32 }, (_, i) => [
          cx + radius * Math.cos((i * Math.PI) / 16),
          cz + radius * Math.sin((i * Math.PI) / 16),
        ])
      : [
          [cx - radius, cz - radius],
          ...Array.from({ length: 20 }, (_, i) => {
            const angle = ((i / 19) * Math.PI) / 2;
            return [
              cx - radius + 2 * radius * Math.cos(angle),
              cz - radius + 2 * radius * Math.sin(angle),
            ] as Point;
          }),
        ];
  surfaces.push({ id, kind: 'baseball', ...polygon([pts]) });
}
surfaces.push({
  id: 'west-baseball-infield-grass',
  kind: 'baseball-grass',
  ...polygon([
    [
      [-71, -55],
      [-49, -53],
      [-51, -32],
      [-73, -34],
    ],
  ]),
});
const paths = source.features
  .filter(
    (f): f is LineFeature =>
      f.geometry.type === 'LineString' && !!f.properties.highway,
  )
  .map((f) => ({
    id: f.id,
    kind: f.properties.highway,
    points: ring(f.geometry.coordinates),
  }));
const landmarks = buildings
  .filter((b) => b.landmark)
  .map((b) => {
    const p = b.rings[0];
    const position: Point = [
      p.reduce((s: number, q: Point) => s + q[0], 0) / p.length,
      p.reduce((s: number, q: Point) => s + q[1], 0) / p.length,
    ];
    return {
      id: b.id,
      name: b.name,
      category: b.category,
      description: `${b.name}, identified from the supplied campus references. Explore its outdoor surroundings.`,
      position,
      height: b.height,
    };
  });
const field = surfaces.find((s) => s.kind === 'american_football');
if (field) {
  const p = field.rings[0];
  landmarks.push({
    id: 'athletic-field',
    name: 'Stadium',
    category: 'Athletics',
    description:
      'The running track and playing field on the west side of campus.',
    position: [
      p.reduce((s: number, q: Point) => s + q[0], 0) / p.length,
      p.reduce((s: number, q: Point) => s + q[1], 0) / p.length,
    ],
    height: 0,
  });
}
for (const [id, name, kind] of [
  ['tennis', 'Tennis Courts', 'tennis'],
  ['baseball', 'Baseball Fields', 'baseball'],
]) {
  const s = surfaces.find((s) => s.kind === kind);
  if (s)
    landmarks.push({
      id,
      name,
      category: 'Athletics',
      description: `The ${name.toLowerCase()} outdoor area.`,
      position: [
        s.vertices.reduce((n: number, p: Point) => n + p[0], 0) /
          s.vertices.length,
        s.vertices.reduce((n: number, p: Point) => n + p[1], 0) /
          s.vertices.length,
      ],
      height: 0,
    });
}
const obstacles = [...walls, ...posts.map((p) => p.ring), ...landscapeObstacles];
const walkSpawns: Record<string, Point> = {};
function safeArrival(p: Point): Point {
  if (walkable(p, boundary, obstacles, 0.75)) return p;
  for (let radius = 1; radius < 40; radius += 1)
    for (let i = 0; i < 32; i++) {
      const q: Point = [
        p[0] + radius * Math.cos((i * Math.PI) / 16),
        p[1] + radius * Math.sin((i * Math.PI) / 16),
      ];
      if (walkable(q, boundary, obstacles, 0.75)) return q;
    }
  throw new Error(`No outdoor arrival near ${p.join(', ')}`);
}
walkSpawns.entrance = safeArrival(aerialPoint([1700, 662]));
for (const landmark of landmarks) {
  const b = exterior.buildings.find((b) => b.id === landmark.id);
  const preferred = b?.arrival
    ? aerialPoint(b.arrival)
    : (landmark.position as Point);
  walkSpawns[landmark.id] = safeArrival(preferred);
}
const result = {
  origin,
  boundary,
  ground: polygon([boundary]),
  buildings,
  surfaces,
  paths,
  landmarks,
  walkways,
  plazas,
  posts,
  landscapeObstacles,
  modelRevision: language.revision,
  walkSpawns,
  layoutReference:
    'OSM provides the campus boundary and sports footprints; user aerial photos and red/blue annotations calibrate teaching buildings, covered links and walkable classroom eaves. All dimensions remain approximate.',
  date: '2026-09-06',
};
fs.mkdirSync('data', { recursive: true });
fs.writeFileSync('data/campus.json', JSON.stringify(result));
console.log(
  JSON.stringify({
    buildings: buildings.length,
    surfaces: surfaces.length,
    paths: paths.length,
  }),
);
