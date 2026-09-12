import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  deleteStoredBuild,
  listStoredBuilds,
  loadStoredBuild,
  saveStoredBuild,
} from '../lib/build-storage.ts';

class MemoryStorage implements Storage {
  private values = new Map<string, string>();
  get length() { return this.values.size; }
  key(index: number) { return [...this.values.keys()][index] ?? null; }
  getItem(key: string) { return this.values.get(key) ?? null; }
  setItem(key: string, value: string) { this.values.set(key, value); }
  removeItem(key: string) { this.values.delete(key); }
  clear() { this.values.clear(); }
}

test('saves, lists, loads and deletes named local build saves', () => {
  const storage = new MemoryStorage();
  saveStoredBuild(storage, '数学区域', '{"objects":[]}');
  saveStoredBuild(storage, '语言中心', '{"objects":[1]}');
  assert.deepEqual(listStoredBuilds(storage).map((save) => save.name).sort(), ['数学区域', '语言中心'].sort());
  assert.equal(loadStoredBuild(storage, '数学区域'), '{"objects":[]}');
  deleteStoredBuild(storage, '数学区域');
  assert.equal(loadStoredBuild(storage, '数学区域'), null);
  assert.deepEqual(listStoredBuilds(storage).map((save) => save.name), ['语言中心']);
});

test('overwriting a save keeps one record and invalid names are rejected', () => {
  const storage = new MemoryStorage();
  saveStoredBuild(storage, '校园', 'one');
  saveStoredBuild(storage, '校园', 'two');
  assert.equal(listStoredBuilds(storage).length, 1);
  assert.equal(loadStoredBuild(storage, '校园'), 'two');
  assert.throws(() => saveStoredBuild(storage, '  ', 'bad'));
});
