import type { Vec3 } from './build-session';
export type RoomMarker = { id: string; owner: string; point: Vec3; room: string; teacher: string; subject: string; floor: string; building: string };
export type MarkerTarget = Pick<RoomMarker, 'owner' | 'point' | 'building'>;
export const markerKey = 'arroyo-surface-markers-v1';
export function readMarkers(value: string | null): RoomMarker[] {
  try { const items = JSON.parse(value || '[]'); return Array.isArray(items) ? items.filter(m => m && typeof m.id==='string' && typeof m.owner==='string' && Array.isArray(m.point) && m.point.length===3 && m.point.every(Number.isFinite) && ['room','teacher','subject','floor','building'].every(k=>typeof m[k]==='string')) : []; } catch { return []; }
}
