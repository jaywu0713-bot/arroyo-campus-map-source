export type StoredBuild = { name: string; savedAt: number };
const prefix = 'arroyo-campus-build:';

function key(name: string) {
  const clean = name.trim();
  if (!clean || clean.length > 80) throw new Error('存档名称不能为空或过长');
  return prefix + clean;
}

export function saveStoredBuild(storage: Storage, name: string, json: string) {
  const storageKey = key(name);
  storage.setItem(storageKey, JSON.stringify({ name: name.trim(), savedAt: Date.now(), json }));
}

export function listStoredBuilds(storage: Storage): StoredBuild[] {
  const saves: StoredBuild[] = [];
  for (let index = 0; index < storage.length; index += 1) {
    const storageKey = storage.key(index);
    if (!storageKey?.startsWith(prefix)) continue;
    try {
      const parsed = JSON.parse(storage.getItem(storageKey) || '');
      if (typeof parsed.name === 'string' && typeof parsed.savedAt === 'number')
        saves.push({ name: parsed.name, savedAt: parsed.savedAt });
    } catch {
      // Ignore a corrupt entry so other saves remain usable.
    }
  }
  return saves.sort((a, b) => b.savedAt - a.savedAt);
}

export function loadStoredBuild(storage: Storage, name: string): string | null {
  const raw = storage.getItem(key(name));
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    return typeof parsed.json === 'string' ? parsed.json : null;
  } catch {
    return null;
  }
}

export function deleteStoredBuild(storage: Storage, name: string) {
  storage.removeItem(key(name));
}
