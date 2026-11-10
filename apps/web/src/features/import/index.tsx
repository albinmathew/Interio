/**
 * Import flow at /import: upload a PDF, watch it being read, review what was
 * detected (plan over the drawing, layers, scale, issues), create the project.
 */
import { LAYER_ROLES, deriveRooms, type LayerRole } from '@interio/core';
import {
  ImportError,
  MM_PER_PT,
  attachPageImage,
  extractPage,
  importExtracted,
  renderPdfPage,
  type Extracted,
  type ImportDetail,
} from '@interio/importer';
import { AlertTriangle, ArrowRight, CircleAlert, FileUp, Info, RotateCcw, Sparkles } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState, type DragEvent, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { dims, squareMetres } from '../../lib/format';
import { createFromDraft } from '../../lib/session';
import { Logo } from '../../pages/Dashboard';
import { Badge, Button, Field, Panel, PanelHeader, Segmented, Select, Spinner, TextInput, cn } from '../../ui';
import { analyzePlan, MAX_IMAGE_BYTES, type AiOutcome } from './analyze';
import { Legend, PlanPreview } from './Preview';

/** What stays fixed while the user tunes roles and scale on the review screen. */
interface Session {
  file: File;
  extracted: Extracted;
  page: { blob: Blob; widthPx: number; heightPx: number } | null;
  ai: AiOutcome;
}

type Stage = { kind: 'pick' } | { kind: 'working'; fileName: string; step: number } | { kind: 'review' };

const STEPS = ['Reading the drawing', 'Asking the assistant for room names', 'Finding walls, doors and rooms'];

const ROLE_LABEL: Record<LayerRole, string> = {
  wall: 'Walls',
  lowWall: 'Low walls / railings',
  door: 'Doors',
  window: 'Windows',
  furniture: 'Furniture',
  fixture: 'Fixtures',
  dimension: 'Dimensions',
  text: 'Text',
  tag: 'Door / window tags',
  hatch: 'Hatching',
  overhead: 'Overhead / outside',
  ignore: 'Ignore',
};

const SOURCE_LABEL = {
  dimension: 'labelled room sizes',
  wallThickness: 'wall thickness',
  titleBlock: 'the scale on the sheet',
  user: 'your setting',
} as const;

const ratio = (mmPerUnit: number): number => mmPerUnit / MM_PER_PT;
const shortLayer = (name: string): string => name.slice(name.lastIndexOf('$') + 1);

async function imageSize(blob: Blob): Promise<{ widthPx: number; heightPx: number }> {
  const bitmap = await createImageBitmap(blob);
  const size = { widthPx: bitmap.width, heightPx: bitmap.height };
  bitmap.close();
  return size;
}

function run(session: Session, roleOverrides: Record<string, LayerRole>, mmPerPdfUnit: number | null): ImportDetail {
  const detail = importExtracted(session.extracted, {
    fileName: session.file.name,
    vision: session.ai.vision,
    roleOverrides,
    mmPerPdfUnit: mmPerPdfUnit ?? undefined,
  });
  if (session.page) attachPageImage(detail, session.page.blob, session.page.widthPx, session.page.heightPx);
  return detail;
}

export default function ImportPage() {
  const navigate = useNavigate();
  const input = useRef<HTMLInputElement>(null);
  const session = useRef<Session | null>(null);
  const [stage, setStage] = useState<Stage>({ kind: 'pick' });
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [detail, setDetail] = useState<ImportDetail | null>(null);
  const [roles, setRoles] = useState<Record<string, LayerRole>>({});
  const [userScale, setUserScale] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  const [view, setView] = useState<'both' | 'drawing' | 'plan'>('both');

  const start = useCallback(async (file: File) => {
    setError(null);
    setDetail(null);
    setRoles({});
    setUserScale(null);
    setName(file.name.replace(/\.pdf$/i, ''));
    setStage({ kind: 'working', fileName: file.name, step: 0 });
    try {
      const data = await file.arrayBuffer();
      const extracted = await extractPage(data);
      let page: Session['page'] = null;
      try {
        let blob = await renderPdfPage(data, 2000);
        if (blob.size > MAX_IMAGE_BYTES) blob = await renderPdfPage(data, 1400);
        page = { blob, ...(await imageSize(blob)) };
      } catch {
        page = null; // the review still works on the line work alone
      }
      setStage({ kind: 'working', fileName: file.name, step: 1 });
      const ai: AiOutcome = page ? await analyzePlan(page.blob, file.name) : { status: 'failed', vision: null, detail: 'The page could not be rendered.' };
      setStage({ kind: 'working', fileName: file.name, step: 2 });
      // Let the progress step paint before the synchronous geometry pass.
      await new Promise((resolve) => setTimeout(resolve, 30));
      session.current = { file, extracted, page, ai };
      setDetail(run(session.current, {}, null));
      setStage({ kind: 'review' });
    } catch (e) {
      session.current = null;
      setStage({ kind: 'pick' });
      setError(e instanceof ImportError ? e.message : e instanceof Error ? `Import failed: ${e.message}` : 'Import failed');
    }
  }, []);

  /** Re-runs the geometry after a role or scale change. */
  const rerun = useCallback((nextRoles: Record<string, LayerRole>, nextScale: number | null) => {
    const current = session.current;
    if (!current) return;
    setRoles(nextRoles);
    setUserScale(nextScale);
    setBusy(true);
    setTimeout(() => {
      try {
        setDetail(run(current, nextRoles, nextScale));
      } finally {
        setBusy(false);
      }
    }, 20);
  }, []);

  const create = async () => {
    const current = session.current;
    if (!current || !detail) return;
    setCreating(true);
    try {
      const project = await createFromDraft(detail.draft, name.trim() || 'Imported plan', current.file);
      navigate(`/p/${project.id}/plan`);
    } catch (e) {
      setError(e instanceof Error ? `The project could not be created: ${e.message}` : 'The project could not be created');
      setCreating(false);
    }
  };

  const reset = () => {
    session.current = null;
    setDetail(null);
    setError(null);
    setStage({ kind: 'pick' });
  };

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const file = [...e.dataTransfer.files].find((f) => f.type === 'application/pdf' || /\.pdf$/i.test(f.name));
    if (file) void start(file);
    else setError('Drop a PDF file.');
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="flex h-14 shrink-0 items-center justify-between border-b border-line bg-surface px-5">
        <Logo />
        {stage.kind === 'review' && (
          <Button variant="ghost" size="sm" icon={<RotateCcw className="h-4 w-4" />} onClick={reset}>
            Choose another file
          </Button>
        )}
      </header>

      {stage.kind === 'pick' && (
        <main className="mx-auto w-full max-w-xl px-5 py-12">
          <h1 className="text-2xl font-semibold tracking-tight">Upload a floor plan</h1>
          <p className="mt-1 text-sm text-ink-soft">A PDF exported from CAD by your builder or architect works best. Scans can be traced by hand.</p>
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={onDrop}
            data-testid="drop-zone"
            className={cn(
              'mt-6 flex flex-col items-center gap-3 rounded-[var(--radius-panel)] border-2 border-dashed bg-surface p-12 text-center transition-colors',
              dragging ? 'border-accent bg-accent-soft' : 'border-line',
            )}
          >
            <FileUp className="h-8 w-8 text-ink-faint" />
            <p className="text-sm text-ink-soft">Drag a PDF here, or</p>
            <Button variant="primary" onClick={() => input.current?.click()}>
              Choose PDF
            </Button>
            <input
              ref={input}
              type="file"
              accept="application/pdf,.pdf"
              className="hidden"
              data-testid="pdf-input"
              onChange={(e) => {
                const file = e.currentTarget.files?.[0];
                e.currentTarget.value = '';
                if (file) void start(file);
              }}
            />
          </div>
          {error && (
            <p role="alert" className="mt-4 rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">
              {error}
            </p>
          )}
        </main>
      )}

      {stage.kind === 'working' && (
        <main className="mx-auto w-full max-w-xl px-5 py-12" data-testid="import-progress">
          <h1 className="text-2xl font-semibold tracking-tight">Reading {stage.fileName}</h1>
          <Panel className="mt-6 p-5">
            <ol className="flex flex-col gap-3">
              {STEPS.map((label, i) => (
                <li key={label} className={cn('flex items-center gap-3 text-sm', i > stage.step ? 'text-ink-faint' : 'text-ink')}>
                  <span className="flex h-5 w-5 items-center justify-center">
                    {i < stage.step ? <span className="h-2 w-2 rounded-full bg-accent" /> : i === stage.step ? <Spinner /> : <span className="h-2 w-2 rounded-full bg-line" />}
                  </span>
                  {label}
                </li>
              ))}
            </ol>
            <div className="mt-5 h-1.5 overflow-hidden rounded-full bg-sunken" role="progressbar" aria-valuemin={0} aria-valuemax={STEPS.length} aria-valuenow={stage.step}>
              <div className="h-full rounded-full bg-accent transition-all" style={{ width: `${((stage.step + 0.5) / STEPS.length) * 100}%` }} />
            </div>
          </Panel>
        </main>
      )}

      {stage.kind === 'review' && detail && session.current && (
        <Review
          detail={detail}
          ai={session.current.ai}
          roles={roles}
          userScale={userScale}
          busy={busy}
          creating={creating}
          name={name}
          view={view}
          error={error}
          onName={setName}
          onView={setView}
          onRole={(layer, role) => rerun({ ...roles, [layer]: role }, userScale)}
          onScale={(mm) => rerun(roles, mm)}
          onCreate={() => void create()}
        />
      )}
    </div>
  );
}

interface ReviewProps {
  detail: ImportDetail;
  ai: AiOutcome;
  roles: Record<string, LayerRole>;
  userScale: number | null;
  busy: boolean;
  creating: boolean;
  name: string;
  view: 'both' | 'drawing' | 'plan';
  error: string | null;
  onName: (name: string) => void;
  onView: (view: 'both' | 'drawing' | 'plan') => void;
  onRole: (layer: string, role: LayerRole) => void;
  onScale: (mmPerPdfUnit: number | null) => void;
  onCreate: () => void;
}

function Review({ detail, ai, roles, userScale, busy, creating, name, view, error, onName, onView, onRole, onScale, onCreate }: ReviewProps) {
  const { draft } = detail;
  const level = draft.level;
  const rooms = useMemo(
    () =>
      deriveRooms(level)
        .map((g) => ({ g, room: g.roomId ? level.rooms[g.roomId] : undefined }))
        .filter((x) => x.room)
        .sort((a, b) => b.g.interiorArea - a.g.interiorArea),
    [level],
  );
  const openings = Object.values(level.openings);
  const count = (kind: string) => openings.filter((o) => o.kind === kind).length;
  const layers = useMemo(
    () => [...draft.layers].sort((a, b) => Number(a.role === 'ignore') - Number(b.role === 'ignore') || b.segments - a.segments),
    [draft.layers],
  );
  const blocking = draft.issues.filter((i) => i.severity !== 'info');
  const notes = draft.issues.filter((i) => i.severity === 'info');

  return (
    <main className="grid min-h-0 flex-1 grid-cols-1 gap-4 overflow-auto bg-canvas p-4 lg:grid-cols-[minmax(0,1fr)_400px] lg:overflow-hidden" data-testid="import-review">
      <Panel className="flex min-h-[420px] flex-col overflow-hidden">
        <PanelHeader
          title="Detected plan"
          actions={
            <Segmented
              size="sm"
              value={view}
              onChange={onView}
              options={[
                { value: 'both', label: 'Overlay' },
                { value: 'drawing', label: 'Drawing' },
                { value: 'plan', label: 'Plan' },
              ]}
            />
          }
        />
        <div className="relative min-h-0 flex-1">
          <PlanPreview draft={draft} showDrawing={view !== 'plan'} showPlan={view !== 'drawing'} />
          {busy && (
            <div className="absolute inset-0 flex items-center justify-center bg-surface/60">
              <Spinner className="h-6 w-6" />
            </div>
          )}
        </div>
        <div className="border-t border-line px-3 py-2">
          <Legend />
        </div>
      </Panel>

      <div className="flex min-h-0 flex-col gap-4 lg:overflow-auto">
        <Panel>
          <PanelHeader title="Summary" />
          <div className="flex flex-col gap-3 p-3">
            <div className="grid grid-cols-3 gap-2 text-center">
              <Stat label="Rooms" value={rooms.length} testId="room-count" />
              <Stat label="Doors" value={count('door') + count('sliding') + count('passage')} testId="door-count" />
              <Stat label="Windows" value={count('window')} testId="window-count" />
            </div>
            <div
              className={cn('flex items-start gap-2 rounded-lg px-3 py-2 text-sm', ai.status === 'used' ? 'bg-accent-soft text-accent-strong' : 'bg-sunken text-ink-soft')}
              data-testid="ai-status"
              data-status={ai.status}
            >
              <Sparkles className="mt-0.5 h-4 w-4 shrink-0" />
              <span>
                {ai.status === 'used'
                  ? 'Room names and sizes were read from the drawing by the assistant.'
                  : ai.status === 'unavailable'
                    ? 'The assistant is not available, so this import used the line work only. Room names and types are guesses: rename them in the editor.'
                    : `The assistant could not help this time (${ai.detail ?? 'no reply'}), so this import used the line work only. Room names and types are guesses.`}
              </span>
            </div>
            {rooms.length > 0 && (
              <ul className="max-h-44 overflow-auto text-sm" data-testid="room-list">
                {rooms.map(({ g, room }) => (
                  <li key={room!.id} className="flex items-baseline justify-between gap-2 border-b border-line py-1 last:border-b-0">
                    <span className="truncate text-ink">{room!.name}</span>
                    <span className="shrink-0 text-xs text-ink-faint">
                      {dims(g.width, g.depth)} · {squareMetres(g.interiorArea)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </Panel>

        <ScalePanel detail={detail} userScale={userScale} onScale={onScale} />

        <Panel>
          <PanelHeader title="Things to check" actions={<Badge tone={blocking.length ? 'warn' : 'accent'}>{blocking.length ? `${blocking.length} to check` : 'All clear'}</Badge>} />
          <ul className="flex flex-col gap-2 p-3 text-sm" data-testid="issue-list">
            {draft.issues.length === 0 && <li className="text-ink-soft">Nothing needs your attention.</li>}
            {[...blocking, ...notes].map((issue, i) => (
              <li key={`${issue.code}-${i}`} className="flex items-start gap-2" data-severity={issue.severity}>
                {issue.severity === 'error' ? (
                  <CircleAlert className="mt-0.5 h-4 w-4 shrink-0 text-danger" />
                ) : issue.severity === 'warning' ? (
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warn" />
                ) : (
                  <Info className="mt-0.5 h-4 w-4 shrink-0 text-ink-faint" />
                )}
                <span className={issue.severity === 'info' ? 'text-ink-soft' : 'text-ink'}>{issue.message}</span>
              </li>
            ))}
          </ul>
        </Panel>

        <Panel>
          <PanelHeader title="Layers" actions={<span className="text-xs text-ink-faint">{layers.length} in this drawing</span>} />
          {layers.length === 0 ? (
            <p className="p-3 text-sm text-ink-soft">This PDF has no CAD layers. Walls were read from the heaviest lines.</p>
          ) : (
            <div className="max-h-72 overflow-auto">
              <table className="w-full text-sm" data-testid="layer-table">
                <thead className="sticky top-0 bg-surface text-left text-xs text-ink-faint">
                  <tr>
                    <th className="px-3 py-1.5 font-medium">Layer</th>
                    <th className="px-2 py-1.5 text-right font-medium">Lines</th>
                    <th className="px-3 py-1.5 font-medium">Used as</th>
                  </tr>
                </thead>
                <tbody>
                  {layers.map((layer) => (
                    <tr key={layer.name} className="border-t border-line" data-testid="layer-row" data-layer={layer.name}>
                      <td className="max-w-[150px] truncate px-3 py-1" title={layer.name}>
                        {shortLayer(layer.name)}
                        {roles[layer.name] && <span className="ml-1 text-xs text-accent">edited</span>}
                      </td>
                      <td className="px-2 py-1 text-right text-ink-soft tabular-nums">{layer.segments}</td>
                      <td className="px-3 py-1">
                        <Select
                          aria-label={`Role of layer ${shortLayer(layer.name)}`}
                          value={layer.role}
                          disabled={busy}
                          onChange={(e) => onRole(layer.name, e.currentTarget.value as LayerRole)}
                          className="h-7"
                        >
                          {LAYER_ROLES.map((role) => (
                            <option key={role} value={role}>
                              {ROLE_LABEL[role]}
                            </option>
                          ))}
                        </Select>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Panel>

        <Panel className="sticky bottom-0">
          <div className="flex flex-col gap-3 p-3">
            <Field label="Project name">
              <TextInput value={name} onChange={(e) => onName(e.currentTarget.value)} aria-label="Project name" />
            </Field>
            {error && (
              <p role="alert" className="text-sm text-danger">
                {error}
              </p>
            )}
            <Button
              variant="primary"
              disabled={busy || creating}
              icon={creating ? <Spinner className="text-white" /> : <ArrowRight className="h-4 w-4" />}
              onClick={onCreate}
              data-testid="create-project"
            >
              Create project
            </Button>
            {rooms.length === 0 && <p className="text-xs text-ink-soft">No rooms were detected. You can still create the project and trace the plan over the drawing.</p>}
          </div>
        </Panel>
      </div>
    </main>
  );
}

function Stat({ label, value, testId }: { label: string; value: number; testId: string }) {
  return (
    <div className="rounded-lg bg-sunken px-2 py-2">
      <div className="text-xl font-semibold text-ink tabular-nums" data-testid={testId}>
        {value}
      </div>
      <div className="text-xs text-ink-soft">{label}</div>
    </div>
  );
}

function ScalePanel({ detail, userScale, onScale }: { detail: ImportDetail; userScale: number | null; onScale: (mm: number | null) => void }) {
  const { scale } = detail.draft;
  const c = detail.scaleCandidates;
  const [text, setText] = useState(ratio(scale.mmPerPdfUnit).toFixed(1));
  useEffect(() => setText(ratio(scale.mmPerPdfUnit).toFixed(1)), [scale.mmPerPdfUnit]);
  const submit = (e: FormEvent) => {
    e.preventDefault();
    const n = Number(text);
    if (Number.isFinite(n) && n > 0) onScale(n * MM_PER_PT);
  };
  const rows: [string, number | null][] = [
    ['Labelled room sizes', c.dimension],
    ['Wall thickness', c.wallThickness],
    ['Scale on the sheet', c.titleBlock],
  ];
  return (
    <Panel>
      <PanelHeader title="Scale" actions={<Badge tone={scale.spreadPct > 1 && scale.source !== 'user' ? 'warn' : 'neutral'}>from {SOURCE_LABEL[scale.source]}</Badge>} />
      <div className="flex flex-col gap-3 p-3 text-sm">
        <p className="text-ink" data-testid="scale-estimate" data-mm-per-unit={scale.mmPerPdfUnit.toFixed(4)}>
          Using <span className="font-semibold">1 : {ratio(scale.mmPerPdfUnit).toFixed(1)}</span>
          {scale.spreadPct > 0 && <span className="text-ink-soft"> · estimates differ by {scale.spreadPct.toFixed(1)}%</span>}
        </p>
        <ul className="text-xs text-ink-soft">
          {rows.map(([label, value]) => (
            <li key={label} className="flex justify-between">
              <span>{label}</span>
              <span className="tabular-nums">{value ? `1 : ${ratio(value).toFixed(1)}` : 'not found'}</span>
            </li>
          ))}
        </ul>
        <form onSubmit={submit} className="flex items-end gap-2">
          <Field label="Set the scale yourself (1 : n)">
            <TextInput inputMode="decimal" value={text} onChange={(e) => setText(e.currentTarget.value)} aria-label="Scale override" data-testid="scale-override" />
          </Field>
          <Button type="submit" size="sm">
            Apply
          </Button>
          {userScale !== null && (
            <Button size="sm" variant="ghost" onClick={() => onScale(null)}>
              Automatic
            </Button>
          )}
        </form>
      </div>
    </Panel>
  );
}
