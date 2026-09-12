import { useState } from 'react';
import type { RoomMarker } from '../lib/room-markers';
export function MarkerEditor({marker,onSave,onCancel,onDelete}:{marker:RoomMarker;onSave:(m:RoomMarker)=>void;onCancel:()=>void;onDelete:()=>void}) {
  const [value,setValue]=useState(marker);
  const field=(key: 'room'|'teacher'|'subject'|'floor', text:string)=>setValue(v=>({...v,[key]:text}));
  return <form className="room-editor" onSubmit={e=>{e.preventDefault();if(value.room.trim())onSave({...value,room:value.room.trim()})}}>
    <strong>房间标记</strong><small>位置：{marker.building}（已贴附模型表面）</small>
    <label>教室编号<input autoFocus required maxLength={60} value={value.room} onChange={e=>field('room',e.target.value)}/></label>
    <label>老师（选填）<input maxLength={100} value={value.teacher} onChange={e=>field('teacher',e.target.value)}/></label>
    <label>教学种类（选填）<select value={value.subject} onChange={e=>field('subject',e.target.value)}><option value="">未指定</option><option value="数学">数学</option><option value="英语">英语</option><option value="历史">历史</option><option value="艺术">艺术</option><option value="科学">科学</option><option value="体育">体育</option><option value="音乐">音乐</option><option value="语言">语言</option><option value="计算机">计算机</option><option value="其他">其他</option></select></label>
    {/new building/i.test(marker.building) && <label>楼层<select required value={value.floor} onChange={e=>field('floor',e.target.value)}><option value="">请选择楼层</option><option value="一楼">一楼</option><option value="二楼">二楼</option></select></label>}
    <div className="room-actions"><button className="ui-button" type="submit">保存标记</button><button className="ui-button ui-outline" type="button" onClick={onCancel}>取消</button>{marker.room && <button className="ui-button ui-outline" type="button" onClick={onDelete}>删除</button>}</div>
  </form>;
}
