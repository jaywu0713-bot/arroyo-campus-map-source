'use client';
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import Link from 'next/link';
import {
  Footprints,
  RotateCcw,
  Plus,
  Minus,
  Info,
  ArrowUp,
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  MapPin,
  ChevronRight,
  Compass,
  ExternalLink,
  PanelLeftClose,
  PanelLeftOpen,
} from 'lucide-react';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import {
  createCampusEngine,
  type CampusController,
  type ViewMode,
  type LabelPosition,
} from '@/lib/campus-engine';
import { BuilderPanel } from '@/components/builder-panel';
import { emptyBuilderState, type BuilderState } from '@/lib/builder-types';
import data from '../data/campus.json';
const places = [...data.landmarks].sort((a, b) =>
  a.id === 'admin' ? -1 : b.id === 'admin' ? 1 : 0,
);
const smallScreenQuery = '(max-width: 640px)';
function subscribeToScreen(callback: () => void) {
  const media = window.matchMedia(smallScreenQuery);
  media.addEventListener('change', callback);
  return () => media.removeEventListener('change', callback);
}
export default function CampusViewer() {
  const host = useRef<HTMLDivElement>(null),
    engine = useRef<CampusController | null>(null);
  const [mode, setMode] = useState<ViewMode>('fly'),
    [status, setStatus] = useState('loading'),
    [error, setError] = useState('');
  const [selected, setSelected] = useState<string | null>(null),
    [info, setInfo] = useState(false),
    [panelChoice, setPanel] = useState<boolean | null>(null),
    [builder, setBuilder] = useState<BuilderState>(emptyBuilderState);
  const smallScreen = useSyncExternalStore(
    subscribeToScreen,
    () => window.matchMedia(smallScreenQuery).matches,
    () => false,
  );
  const panel = builder.active ? false : panelChoice ?? !smallScreen;
  const labelElements = useRef(new globalThis.Map<string, HTMLSpanElement>());
  const placeLabels = (positions: LabelPosition[]) => {
    for (const label of positions) {
      const el = labelElements.current.get(label.id);
      if (!el) continue;
      el.style.visibility = label.visible ? 'visible' : 'hidden';
      if (label.visible)
        el.style.transform = `translate(${label.x.toFixed(1)}px, ${label.y.toFixed(1)}px) translate(-50%,-100%)`;
    }
  };
  useEffect(() => {
    // Let the loading interface paint before creating the WebGL context.
    const startFrame = requestAnimationFrame(() => {
      try {
        const controller = createCampusEngine(
          host.current!,
          () => setStatus('ready'),
          (message) => {
            setError(message);
            setStatus('error');
          },
          setSelected,
          placeLabels,
          (state) => {
            setBuilder(state);
            // Build mode is a free-flight editor. Closing it should return to
            // the same fly camera family instead of resetting to campus view.
            setMode('fly');
          },
        );
        engine.current = controller;
        // Campus view is intentionally removed from the product. Start in
        // the fly camera before the first rendered frame can expose overview.
        controller.setMode('fly');
      } catch {
        setError(
          'This browser could not start 3D graphics. Try a current browser with hardware acceleration enabled.',
        );
        setStatus('error');
      }
    });
    return () => {
      cancelAnimationFrame(startFrame);
      engine.current?.dispose();
      engine.current = null;
    };
  }, []);
  const choose = (id: string) => {
    setSelected(id);
    engine.current?.focus(id);
    if (mode === 'walk') setPanel(false);
  };
  const place = data.landmarks.find((p) => p.id === selected),
    building = data.buildings.find((p) => p.id === selected);
  const changeMode = (value: unknown) => {
    if (value === 'fly') {
      engine.current?.setBuildMode(true);
      return;
    }
    const m = value as ViewMode;
    setMode(m);
    if (builder.active) engine.current?.setBuildMode(false);
    engine.current?.setMode(m);
    if (m !== 'overview') setPanel(false);
  };
  const toggleBuildMode = () => engine.current?.setBuildMode(!builder.active);
  const activeName = place?.name || building?.name;
  return (
    <main className="campus-app">
      <div className="scene" ref={host} />
      {status === 'ready' && (
        <div className="scene-labels" aria-hidden="true">
          {places.map((l) => (
            <span
              key={l.id}
              ref={(el) => {
                if (el) labelElements.current.set(l.id, el);
                else labelElements.current.delete(l.id);
              }}
              style={{ visibility: 'hidden' }}
              className={selected === l.id ? 'map-label active' : 'map-label'}
            >
              {l.name}
            </span>
          ))}
        </div>
      )}
      <header className="campus-header">
        <Link className="brand" href="/" aria-label="Arroyo Campus Walk home">
          <span className="brand-emblem">A</span>
          <span>
            <strong>Arroyo</strong>
            <small>Campus Walk</small>
          </span>
        </Link>
        <Tabs value={builder.active ? 'fly' : mode} onValueChange={changeMode} className="mode-control">
          <TabsList>
            <TabsTrigger value="walk" disabled={status !== 'ready'}>
              <Footprints size={16} />
              Walk around
            </TabsTrigger>
            <TabsTrigger value="fly" disabled={status !== 'ready'}>Fly / 飞行</TabsTrigger>
          </TabsList>
        </Tabs>
        <Button
          className="about-button"
          variant="outline"
          onClick={() => setInfo(true)}
        >
          <Info size={17} />
          <span>About this model</span>
        </Button>
      </header>
      {builder.active && status === 'ready' && (
        <BuilderPanel
          state={builder}
          onAdd={(templateId) => engine.current?.addBuildPiece(templateId)}
          onTool={(tool) => engine.current?.setBuildTool(tool)}
          onSnap={(snap) => engine.current?.setBuildSnap(snap)}
          onUndo={() => engine.current?.undoBuildPiece()}
          onRedo={() => engine.current?.redoBuildPiece()}
          onDuplicate={() => engine.current?.duplicateBuildPiece()}
          onDelete={() => engine.current?.deleteBuildPiece()}
          onRotate={(degrees) => engine.current?.rotateBuildPiece(degrees)}
          onFocus={() => engine.current?.focusBuildPiece()}
          onCancel={toggleBuildMode}
          onExport={() => {
            const blob = new Blob([engine.current?.exportBuild() || '{}'], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const anchor = document.createElement('a');
            anchor.href = url;
            anchor.download = 'arroyo-campus-build.json';
            anchor.click();
            window.setTimeout(() => URL.revokeObjectURL(url), 1000);
          }}
          onImport={(json) => engine.current?.importBuild(json)}
          currentJson={() => engine.current?.exportBuild() || ''}
        />
      )}
      <aside className={`places-panel ${panel ? '' : 'collapsed'}`}>
        <div className="panel-heading">
          <span>
            <small>El Monte, California</small>
            <h1>Explore Arroyo</h1>
          </span>
          <button
            className="icon-button panel-toggle"
            onClick={() => setPanel(!panel)}
            aria-label={panel ? 'Collapse places' : 'Show places'}
          >
            {panel ? <PanelLeftClose size={19} /> : <PanelLeftOpen size={19} />}
          </button>
        </div>
        {panel && (
          <>
            <p className="panel-intro">
              Take a look around the outdoor campus.
            </p>
            <nav aria-label="Campus places" className="place-list">
              {places.map((p) => (
                <button
                  className={`place-button ${selected === p.id ? 'selected' : ''}`}
                  key={p.id}
                  onClick={() => choose(p.id)}
                  disabled={status !== 'ready'}
                >
                  <span className="place-icon">
                    <MapPin size={17} />
                  </span>
                  <span>
                    <strong>{p.name}</strong>
                    <small>{p.category}</small>
                  </span>
                  <ChevronRight size={16} />
                </button>
              ))}
            </nav>
            <div className="panel-note">
              <span className="status-dot" />
              Outdoor campus · Covered walkways
            </div>
          </>
        )}
      </aside>
      {status === 'loading' && (
        <output className="loading-state">
          <span className="loading-orbit" />
          <strong>Opening the campus</strong>
          <span>Preparing the 3D model…</span>
        </output>
      )}
      {status === 'error' && (
        <div className="loading-state error-state" role="alert">
          <Info />
          <strong>3D view unavailable</strong>
          <p>{error}</p>
          <Button onClick={() => window.location.reload()}>Reload</Button>
          <a
            href="https://ahs.emuhsd.org/bellschedule"
            target="_blank"
            rel="noreferrer"
          >
            View the official campus map
          </a>
        </div>
      )}
      {!builder.active && selected && activeName && (
        <section className="selection-card" aria-live="polite">
          <div>
            <MapPin size={18} />
            <strong>{activeName}</strong>
            <button
              className="icon-button"
              aria-label="Close building details"
              onClick={() => setSelected(null)}
            >
              ×
            </button>
          </div>
          <p>
            {place?.description ||
              'An exterior building shown in the public campus map. Interior spaces are not modeled.'}
          </p>
          <small>Approximate exterior · Building details may differ</small>
        </section>
      )}
      <div className="view-controls">
        <button
          className="compass-control"
          onClick={() => engine.current?.reset()}
          aria-label="Reset campus view"
        >
          <Compass size={25} />
          <span>N</span>
        </button>
        <div className="zoom-controls">
          <button
            aria-label="Zoom in"
            disabled={mode !== 'overview'}
            onClick={() => engine.current?.zoom(1)}
          >
            <Plus size={20} />
          </button>
          <button
            aria-label="Zoom out"
            disabled={mode !== 'overview'}
            onClick={() => engine.current?.zoom(-1)}
          >
            <Minus size={20} />
          </button>
        </div>
        <button
          className="reset-control"
          aria-label="Reset view"
          onClick={() => engine.current?.reset()}
        >
          <RotateCcw size={19} />
        </button>
      </div>
      {mode !== 'overview' && (
        <div className="walk-controls" aria-label="Walk controls">
          {[
            { key: 'KeyW', label: 'Move forward', icon: ArrowUp },
            { key: 'KeyA', label: 'Move left', icon: ArrowLeft },
            { key: 'KeyS', label: 'Move backward', icon: ArrowDown },
            { key: 'KeyD', label: 'Move right', icon: ArrowRight },
            ...(mode === 'fly' ? [{ key: 'KeyE', label: 'Ascend / 上升', icon: ArrowUp }, { key: 'KeyQ', label: 'Descend / 下降', icon: ArrowDown }] : []),
          ].map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              className={key}
              aria-label={label}
              onPointerDown={(e) => {
                e.preventDefault();
                e.currentTarget.setPointerCapture(e.pointerId);
                engine.current?.setInput(key, true);
              }}
              onPointerUp={() => engine.current?.setInput(key, false)}
              onPointerCancel={() => engine.current?.setInput(key, false)}
              onLostPointerCapture={() => engine.current?.setInput(key, false)}
              onKeyDown={(e) => {
                if (e.key === ' ' || e.key === 'Enter') {
                  e.preventDefault();
                  engine.current?.setInput(key, true);
                }
              }}
              onKeyUp={() => engine.current?.setInput(key, false)}
              onBlur={() => engine.current?.setInput(key, false)}
            >
              {key === 'KeyE' ? '升' : key === 'KeyQ' ? '降' : <Icon size={21} />}
            </button>
          ))}
        </div>
      )}
      <footer className="campus-footer">
        <p className="control-hint">
          {builder.active ? (
            <>飞行建造 · 鼠标看向 · WASD 移动 · E 上升 / Q 下降 · Shift 加速</>
          ) : mode === 'overview' ? (
            <>
              Drag to orbit <i /> Scroll to zoom <i /> Right-drag to pan
            </>
          ) : mode === 'fly' ? (
            <>Drag to look · WASD 移动 · E 上升 / Q 下降 · Shift 加速</>
          ) : (
            <>
              Drag to look <i /> W A S D / arrows to walk <i /> Shift to move
              faster
            </>
          )}
        </p>
        <p className="source-credit">
          <a
            href="https://www.openstreetmap.org/copyright"
            target="_blank"
            rel="noreferrer"
          >
            © OpenStreetMap contributors
          </a>
          <span> · </span>
          <button onClick={() => setInfo(true)}>Sources & accuracy</button>
        </p>
      </footer>
      <Dialog open={info} onOpenChange={setInfo}>
        <DialogContent className="about-dialog">
          <DialogTitle>About this campus model</DialogTitle>
          <DialogDescription>
            An independent outdoor prototype of Arroyo High School, 4921 Cedar
            Avenue, El Monte. Not an official school map.
          </DialogDescription>
          <div className="about-content">
            <h3>What is based on maps?</h3>
            <p>
              The campus boundary and sports footprints use OpenStreetMap.
              Teaching buildings and covered walkways are aligned to aerial
              photos and annotated routes supplied for this project. Both
              connecting canopies and classroom corridors under the eaves remain
              open for outdoor walking.
            </p>
            <h3>What is simplified?</h3>
            <p>
              Building heights include older map records and estimates. Roofs,
              windows, trees and ground surfaces are simplified. There are no
              interiors. This prototype is for exploring; it is not a surveyed
              or current navigation map.
            </p>
            <h3>Source material</h3>
            <a
              href="https://ahs.emuhsd.org/bellschedule"
              target="_blank"
              rel="noreferrer"
            >
              Official campus map <ExternalLink size={14} />
            </a>
            <a
              href="https://files.smartsites.parentsquare.com/8223/arroyo_hs-03-122086_dwg_a.pdf"
              target="_blank"
              rel="noreferrer"
            >
              District site plan, G-101 (2022) <ExternalLink size={14} />
            </a>
            <a
              href="https://www.openstreetmap.org/way/29188066"
              target="_blank"
              rel="noreferrer"
            >
              OpenStreetMap campus data <ExternalLink size={14} />
            </a>
            <p>
              The aerial image supplied for this project is used as a visual
              layout reference and is not embedded in the site.
            </p>
            <p className="source-date">
              Model prepared September 6, 2026. Map data © OpenStreetMap
              contributors, ODbL.
            </p>
          </div>
        </DialogContent>
      </Dialog>
    </main>
  );
}
