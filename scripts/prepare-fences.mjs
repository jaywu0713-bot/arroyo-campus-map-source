import fs from 'node:fs';
import { createHash } from 'node:crypto';

const root = new URL('../', import.meta.url);
const trace = JSON.parse(fs.readFileSync(new URL('data/fence-traces.json', root), 'utf8'));
const campus = JSON.parse(fs.readFileSync(new URL('data/campus.json', root), 'utf8'));
const round = (n) => Math.round(n * 100) / 100;
const project = ([u, v]) => {
  const m = trace.imageToGround;
  const d = m[2][0] * u + m[2][1] * v + m[2][2];
  return [0, 1].map(i => round((m[i][0] * u + m[i][1] * v + m[i][2]) / d));
};

// A line drawn against a roof edge attaches to the ground-level wall.
function attach(point, buildingId) {
  if (!buildingId) return point;
  const ring = campus.buildings.find(b => b.id === buildingId)?.rings[0];
  if (!ring) throw new Error(`Unknown attachment building: ${buildingId}`);
  let best, distance = Infinity;
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i], b = ring[(i + 1) % ring.length];
    const dx = b[0] - a[0], dz = b[1] - a[1];
    const t = Math.max(0, Math.min(1, ((point[0] - a[0]) * dx + (point[1] - a[1]) * dz) / (dx * dx + dz * dz)));
    const q = [a[0] + dx * t, a[1] + dz * t];
    const d = Math.hypot(q[0] - point[0], q[1] - point[1]);
    if (d < distance) { best = q; distance = d; }
  }
  if (distance > 6) throw new Error(`Attachment to ${buildingId} is ${distance.toFixed(2)} m away; review trace`);
  return best.map(round);
}

const ids = new Set();
const fences = trace.fences.map(f => {
  if (ids.has(f.id)) throw new Error(`Duplicate fence ${f.id}`);
  ids.add(f.id);
  const points = f.points.map(project);
  points[0] = attach(points[0], f.startBuilding);
  points[points.length - 1] = attach(points.at(-1), f.endBuilding);
  if (f.closed) points.push([...points[0]]);
  return { id: f.id, label: f.label, points, kind: f.kind, height: f.height, closed: !!f.closed, source: trace.source };
});
const revision = `blue-overview-${createHash('sha256').update(JSON.stringify(fences)).digest('hex').slice(0, 12)}`;
const output = { revision, note: 'Generated from fence-traces.json. Only these blue-reference paths are fences. Collision derives from these same points at runtime.', walkArrivalOverrides: trace.walkArrivalOverrides, fences };
fs.writeFileSync(new URL('data/fences.json', root), JSON.stringify(output, null, 2) + '\n');
console.log(JSON.stringify({ revision, fences: fences.length, segments: fences.reduce((n, f) => n + f.points.length - 1, 0) }));
