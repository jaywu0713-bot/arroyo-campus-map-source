import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readMarkers } from '../lib/room-markers.ts';
test('saved surface markers survive serialization with optional information',()=>{
  const marker={id:'1',owner:'building',point:[1,2,3],room:'101',teacher:'',subject:'',floor:'二楼',building:'New Building'};
  assert.deepEqual(readMarkers(JSON.stringify([marker])),[marker]);
});
test('invalid local storage does not crash the viewer or create invalid markers',()=>{
  for(const input of ['bad json','{}','null','[null]', '[{"id":"x","point":[null,0,0]}]'])assert.deepEqual(readMarkers(input),[]);
});
