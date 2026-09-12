'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Copy,
  Download,
  Eraser,
  Focus,
  RotateCcw,
  RotateCw,
  Trash2,
  Undo2,
  Redo2,
  Upload,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { BuildCategory, BuildTemplate } from '@/lib/build-session';
import type { BuildTool, BuilderState } from '@/lib/builder-types';
import { deleteStoredBuild, listStoredBuilds, loadStoredBuild, saveStoredBuild, type StoredBuild } from '@/lib/build-storage';

type Props = {
  state: BuilderState;
  onAdd: (templateId: string) => void;
  onTool: (tool: BuildTool) => void;
  onSnap: (snap: boolean) => void;
  onUndo: () => void;
  onRedo: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onRotate: (degrees: number) => void;
  onFocus: () => void;
  onCancel: () => void;
  onExport: () => void;
  onImport: (json: string) => void;
  currentJson: () => string;
  markerMode: boolean;
  markerMessage: string;
  onMarkerToggle: () => void;
};

const categories: { id: BuildCategory | 'all'; name: string }[] = [
  { id: 'all', name: '全部' },
  { id: 'building', name: '建筑' },
  { id: 'toilet', name: '厕所' },
  { id: 'tree', name: '树木' },
  { id: 'grass', name: '草地' },
  { id: 'fence', name: '铁栏杆' },
  { id: 'walkway', name: '连廊' },
  { id: 'decoration', name: '环境与装饰' },
];

function labelFor(category: BuildCategory) {
  return categories.find((item) => item.id === category)?.name || category;
}

export function BuilderPanel({
  state,
  onAdd,
  onTool,
  onSnap,
  onUndo,
  onRedo,
  onDuplicate,
  onDelete,
  onRotate,
  onFocus,
  onCancel,
  onExport,
  onImport,
  currentJson,
  markerMode,
  markerMessage,
  onMarkerToggle,
}: Props) {
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<BuildCategory | 'all'>('building');
  const [message, setMessage] = useState('');
  const [saveName, setSaveName] = useState('');
  const [saves, setSaves] = useState<StoredBuild[]>([]);
  const fileInput = useRef<HTMLInputElement>(null);
  const templates = useMemo(() => {
    const text = query.trim().toLowerCase();
    return state.catalog
      .filter((item) => category === 'all' || item.category === category)
      .filter((item) => !text || item.name.toLowerCase().includes(text))
      .slice(0, 80);
  }, [category, query, state.catalog]);

  const selected = state.selected;
  const refreshSaves = () => {
    if (typeof window !== 'undefined') setSaves(listStoredBuilds(window.localStorage));
  };
  useEffect(() => { refreshSaves(); }, []);
  const save = () => {
    try {
      saveStoredBuild(window.localStorage, saveName, currentJson());
      setMessage('存档已保存');
      setSaveName('');
      refreshSaves();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '存档保存失败');
    }
  };
  const load = (name: string) => {
    const json = loadStoredBuild(window.localStorage, name);
    if (!json) return setMessage('存档内容不可用');
    try { onImport(json); setMessage('存档已读取'); } catch (error) {
      setMessage(error instanceof Error ? error.message : '存档读取失败');
    }
  };
  const importFile = async (file?: File) => {
    if (!file) return;
    try {
      onImport(await file.text());
      setMessage('地图已导入');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '地图文件无法导入');
    } finally {
      if (fileInput.current) fileInput.current.value = '';
    }
  };

  return (
    <section className="builder-panel" aria-label="基础建造系统">
      <div className="builder-title">
        <div>
          <strong>建造模式</strong>
          <small>点击场景中的完整模型即可编辑</small>
        </div>
        <Button className="marker-toggle" size="sm" aria-pressed={markerMode} variant={markerMode ? 'default' : 'outline'} onClick={onMarkerToggle}>
          {markerMode ? '退出标记模式' : '开启标记模式'}
        </Button>
        <button className="builder-close" onClick={onCancel} aria-label="退出建造模式">
          <X size={17} />
        </button>
      </div>
      {markerMode && <p className="marker-instructions">单击建筑或地面添加圆点；拖动调整视角。鼠标移到圆点查看信息，可修改或删除。</p>}
      {markerMessage && <p role="status" className="marker-instructions">{markerMessage}</p>}

      <div className="builder-history">
        <Button size="sm" variant="outline" disabled={!state.canUndo} onClick={onUndo}>
          <Undo2 size={14} /> 撤销
        </Button>
        <Button size="sm" variant="outline" disabled={!state.canRedo} onClick={onRedo}>
          <Redo2 size={14} /> 重做
        </Button>
        <Button size="sm" variant="outline" onClick={onExport}>
          <Download size={14} /> 导出
        </Button>
        <Button size="sm" variant="outline" onClick={() => fileInput.current?.click()}>
          <Upload size={14} /> 导入
        </Button>
        <input
          ref={fileInput}
          className="builder-file"
          type="file"
          accept="application/json,.json"
          onChange={(event) => void importFile(event.target.files?.[0])}
        />
      </div>
      <div className="builder-save-row">
        <input
          className="builder-search"
          value={saveName}
          onChange={(event) => setSaveName(event.target.value)}
          placeholder="输入存档名称"
          aria-label="存档名称"
        />
        <Button size="sm" onClick={save} disabled={!saveName.trim()}>保存存档</Button>
      </div>
      <div className="builder-saves">
        <div className="builder-library-heading"><strong>本地存档</strong><button onClick={refreshSaves}>刷新</button></div>
        {saves.length ? saves.map((item) => (
          <div className="builder-save-item" key={item.name}>
            <button onClick={() => load(item.name)}>{item.name}</button>
            <small>{new Date(item.savedAt).toLocaleString()}</small>
            <button className="builder-save-delete" onClick={() => { deleteStoredBuild(window.localStorage, item.name); refreshSaves(); }}>删除</button>
          </div>
        )) : <small>还没有本地存档</small>}
      </div>

      <div className="builder-stats">
        <span>新增 {state.added}</span>
        <span>已修改 {state.changed}</span>
        {selected && <span className="builder-selected">已选：{selected.name}</span>}
      </div>

      {selected ? (
        <div className="builder-inspector">
          <div className="builder-inspector-heading">
            <div>
              <strong>{selected.name}</strong>
              <small>{selected.origin === 'original' ? '原有模型' : '新放置模型'}</small>
            </div>
            <span>{labelFor(state.catalog.find((item) => item.id === selected.templateId)?.category || 'building')}</span>
          </div>
          <div className="builder-tool-row" role="toolbar" aria-label="模型工具">
            <Button size="sm" variant={state.tool === 'translate' ? 'default' : 'outline'} onClick={() => onTool('translate')}>移动</Button>
            <Button size="sm" variant={state.tool === 'rotate' ? 'default' : 'outline'} onClick={() => onTool('rotate')}>旋转</Button>
            <Button size="sm" variant={state.tool === 'scale' ? 'default' : 'outline'} onClick={() => onTool('scale')}>缩放</Button>
            <Button size="sm" variant="outline" onClick={() => onSnap(!state.snap)}>{state.snap ? '吸附开' : '吸附关'}</Button>
          </div>
          <div className="builder-action-row">
            <Button size="sm" variant="outline" onClick={() => onRotate(-90)}><RotateCcw size={14} /> -90°</Button>
            <Button size="sm" variant="outline" onClick={() => onRotate(90)}><RotateCw size={14} /> +90°</Button>
            <Button size="sm" variant="outline" onClick={onDuplicate}><Copy size={14} /> 复制</Button>
            <Button size="sm" variant="outline" onClick={onFocus}><Focus size={14} /> 聚焦</Button>
            <Button size="sm" variant="outline" className="builder-delete" onClick={onDelete}><Trash2 size={14} /> 删除</Button>
          </div>
          {state.warnings.map((warning) => <p className="builder-warning" key={warning}>{warning}</p>)}
        </div>
      ) : (
        <p className="builder-empty">先点击下方模型放置，或点击场景中的已有模型。</p>
      )}

      <div className="builder-library-heading">
        <strong>模型库</strong>
        <small>{state.catalog.length} 个原始模型</small>
      </div>
      <input
        className="builder-search"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder="搜索模型名称"
        aria-label="搜索模型"
      />
      <div className="builder-categories" role="tablist" aria-label="模型分类">
        {categories.map((item) => (
          <button
            key={item.id}
            className={category === item.id ? 'active' : ''}
            onClick={() => setCategory(item.id)}
            role="tab"
            aria-selected={category === item.id}
          >
            {item.name}
          </button>
        ))}
      </div>
      <div className="builder-list">
        {templates.map((template: BuildTemplate) => (
          <button
            key={template.id}
            className="builder-model"
            onClick={() => { setMessage('点击场景确认放置位置'); onAdd(template.id); }}
            title={`放置 ${template.name}`}
          >
            <span>{template.name}</span>
            <small>{labelFor(template.category)} · {template.size.map((value) => Math.round(value)).join('×')}m</small>
          </button>
        ))}
        {!templates.length && <small className="builder-no-results">没有匹配的模型</small>}
      </div>

      <div className="builder-help">
        <span><Eraser size={14} /> Delete 删除 · R 旋转 · G 移动 · T 旋转</span>
        <span>拖动手柄调整；橙色提示是软警告，可以继续放置</span>
      </div>
      {message && <button className="builder-message" onClick={() => setMessage('')}>{message}</button>}
    </section>
  );
}
