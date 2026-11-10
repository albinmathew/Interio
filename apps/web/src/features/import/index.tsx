/**
 * Import flow at /import: upload a PDF (drop it anywhere), pick the page, watch
 * it being read, review what was detected (plan over the drawing, layers, scale,
 * issues), then furnish the home straight away, review the plan first, or trace
 * it by hand over the drawing.
 */
import { LAYER_ROLES, deriveRooms, emptyLevel, type Id, type Issue, type LayerRole, type PlanDraft } from '@interio/core';
import {
  MM_PER_PT,
  attachPageImage,
  extractPage,
  importExtracted,
  isDivider,
  renderPdfPage,
  type Extracted,
  type ImportDetail,
} from '@interio/importer';
import { AlertTriangle, ArrowRight, CircleAlert, FileUp, Info, PencilRuler, RotateCcw, ScanSearch, Sparkles, X } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { dims, squareMetres } from '../../lib/format';
import { createFromDraft, furnishProject } from '../../lib/session';
import { isPdfFile, pdfHandoff, plural, useDocumentTitle } from '../../lib/shell';
import { Logo } from '../../pages/Dashboard';
import { Badge, Button, Dialog, DropOverlay, Field, Panel, PanelHeader, Segmented, Select, Spinner, TextInput, cn, toast, useFileDrop } from '../../ui';
import { analyzePlan, MAX_IMAGE_BYTES, type AiOutcome } from './analyze';
import { checkFile, describeImportError, type ImportProblem } from './errors';
import { PagePicker, usePageThumbs } from './PagePicker';
import { Legend, PlanPreview, lowConfidenceIds, type PreviewFocus } from './Preview';

/** What stays fixed while the user tunes roles and scale on the review screen. */
interface Session {
  file: File;
  /** The PDF bytes, kept so another page can be read without asking for the file again. */
  data: ArrayBuffer;
  pageNo: number;
  extracted: Extracted;
  page: { blob: Blob; widthPx: number; heightPx: number } | null;
  ai: AiOutcome;
}

type Stage = { kind: 'pick' } | { kind: 'working'; fileName: string; step: number; pageNo: number } | { kind: 'review' };

/** Where the user goes once the project exists. */
type Next = 'furnish' | 'review' | 'trace';

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
  const [problem, setProblem] = useState<ImportProblem | null>(null);
  const [createError, setCreateError] = useState<string | null>(null);
  const [detail, setDetail] = useState<ImportDetail | null>(null);
  const [roles, setRoles] = useState<Record<string, LayerRole>>({});
  const [userScale, setUserScale] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [creating, setCreating] = useState<Next | null>(null);
  const [choosing, setChoosing] = useState(false);
  const [name, setName] = useState('');
  const [view, setView] = useState<'both' | 'drawing' | 'plan'>('both');
  /** The open PDF: its bytes and page count drive the page picker. */
  const [doc, setDoc] = useState<{ data: ArrayBuffer; pageCount: number } | null>(null);
  const thumbs = usePageThumbs(doc?.data ?? null, doc?.pageCount ?? 0);
  /** Guards against an older read finishing after a newer one started. */
  const reads = useRef(0);
  useDocumentTitle(stage.kind === 'review' && name.trim() ? `Import ${name.trim()}` : 'New from PDF');

  /** Reads one page of a PDF: extract the line work, render the page, ask the assistant, find the plan. */
  const read = useCallback(async (file: File, data: ArrayBuffer, pageNo: number) => {
    const token = ++reads.current;
    const live = () => reads.current === token;
    setProblem(null);
    setCreateError(null);
    setDetail(null);
    setRoles({});
    setUserScale(null);
    setChoosing(false);
    setStage({ kind: 'working', fileName: file.name, step: 0, pageNo });
    try {
      const extracted = await extractPage(data, pageNo);
      if (!live()) return;
      setDoc((d) => (d?.data === data ? d : { data, pageCount: extracted.pageCount }));
      let page: Session['page'] = null;
      try {
        let blob = await renderPdfPage(data, 2000, pageNo);
        if (blob.size > MAX_IMAGE_BYTES) blob = await renderPdfPage(data, 1400, pageNo);
        page = { blob, ...(await imageSize(blob)) };
      } catch {
        page = null; // the review still works on the line work alone
      }
      if (!live()) return;
      setStage({ kind: 'working', fileName: file.name, step: 1, pageNo });
      const ai: AiOutcome = page ? await analyzePlan(page.blob, file.name) : { status: 'failed', vision: null, detail: 'The page could not be rendered.' };
      if (!live()) return;
      setStage({ kind: 'working', fileName: file.name, step: 2, pageNo });
      // Let the progress step paint before the synchronous geometry pass.
      await new Promise((resolve) => setTimeout(resolve, 30));
      if (!live()) return;
      session.current = { file, data, pageNo, extracted, page, ai };
      setDetail(run(session.current, {}, null));
      setStage({ kind: 'review' });
    } catch (e) {
      if (!live()) return;
      session.current = null;
      setDoc(null);
      setStage({ kind: 'pick' });
      setProblem(describeImportError(e, file.name));
    }
  }, []);

  const start = useCallback(
    async (file: File) => {
      const fail = (found: ImportProblem) => {
        reads.current += 1;
        session.current = null;
        setDoc(null);
        setDetail(null);
        setStage({ kind: 'pick' });
        setProblem(found);
      };
      const blocked = checkFile(file);
      if (blocked) return fail(blocked);
      setName(file.name.replace(/\.pdf$/i, ''));
      setDoc(null);
      let data: ArrayBuffer;
      try {
        data = await file.arrayBuffer();
      } catch (e) {
        return fail(describeImportError(e, file.name));
      }
      await read(file, data, 1);
    },
    [read],
  );

  // A PDF dropped on the dashboard arrives here already chosen.
  useEffect(() => {
    const handed = pdfHandoff.take();
    if (handed) void start(handed);
  }, [start]);

  const dragging = useFileDrop(
    (files) => {
      const pdf = files.find(isPdfFile);
      if (pdf) void start(pdf);
      else if (stage.kind === 'review') toast.error('Drop a PDF file to import another plan.');
      else setProblem({ code: 'not-a-pdf', title: `${files[0]?.name ?? 'That file'} is not a PDF.`, hint: 'Drop the floor plan as a PDF file.' });
    },
    stage.kind !== 'working' && !creating,
  );

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

  /** Asks the assistant again after it failed, and re-reads the plan with its answer. */
  const retryAssistant = async () => {
    const current = session.current;
    if (!current?.page || busy) return;
    setBusy(true);
    try {
      const ai = await analyzePlan(current.page.blob, current.file.name);
      if (session.current !== current) return;
      current.ai = ai;
      setDetail(run(current, roles, userScale));
      if (ai.status !== 'used') toast.info('The assistant is still not answering.');
    } finally {
      setBusy(false);
    }
  };

  /** Creates the project and goes where the user chose. */
  const finish = async (next: Next) => {
    const current = session.current;
    if (!current || !detail || creating) return;
    setCreating(next);
    setCreateError(null);
    try {
      // Tracing starts from an empty plan; the drawing stays underneath as the guide.
      const draft: PlanDraft = next === 'trace' ? { ...detail.draft, level: emptyLevel(), confidence: {}, suggestedItems: [] } : detail.draft;
      const project = await createFromDraft(draft, name.trim() || 'Imported plan', current.file);
      if (next === 'furnish') {
        const { added } = await furnishProject(project);
        navigate(`/p/${project.id}/design`);
        if (added > 0) toast.success(`Furnished your home with ${plural(added, 'item')}. Undo takes them all back.`);
        else toast.info('Nothing could be placed automatically. Pick furniture from the catalog.');
      } else {
        navigate(`/p/${project.id}/plan`);
        if (next === 'trace') toast.info('Trace the walls over your drawing with the Wall tool.');
      }
    } catch (e) {
      setChoosing(false);
      setCreateError(e instanceof Error ? `The project could not be created: ${e.message}` : 'The project could not be created');
      setCreating(null);
    }
  };

  const reset = () => {
    reads.current += 1;
    session.current = null;
    setDoc(null);
    setDetail(null);
    setProblem(null);
    setCreateError(null);
    setChoosing(false);
    setStage({ kind: 'pick' });
  };

  const pickPage = (pageNo: number) => {
    const current = session.current;
    if (!current || pageNo === current.pageNo || busy || creating) return;
    void read(current.file, current.data, pageNo);
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
          <p className="mt-1 text-sm text-ink-soft">
            A PDF exported from CAD by your builder or architect works best: walls, doors and rooms are read from it automatically.
          </p>
          <div
            data-testid="drop-zone"
            className={cn(
              'mt-6 flex flex-col items-center gap-3 rounded-[var(--radius-panel)] border-2 border-dashed bg-surface p-12 text-center transition-colors',
              dragging ? 'border-accent bg-accent-soft' : 'border-line',
            )}
          >
            <FileUp className="h-8 w-8 text-ink-faint" />
            <p className="text-sm text-ink-soft">Drag a PDF anywhere on this page, or</p>
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
          {problem && (
            <div role="alert" className="mt-4 rounded-lg bg-danger-soft px-3 py-2.5 text-sm" data-testid="import-error" data-code={problem.code}>
              <p className="font-semibold text-danger">{problem.title}</p>
              <p className="mt-0.5 text-ink">{problem.hint}</p>
            </div>
          )}
          <div className="mt-6 flex items-start gap-3 rounded-[var(--radius-panel)] border border-line bg-surface p-4 text-sm" data-testid="scan-note">
            <ScanSearch className="mt-0.5 h-5 w-5 shrink-0 text-accent" />
            <div>
              <p className="font-medium text-ink">Only have a scan or a photo of the plan?</p>
              <p className="mt-0.5 text-ink-soft">
                Upload it as a PDF anyway. Walls cannot be read from a picture, so Interio puts the page under the editor and you trace it yourself: click along the walls and the
                rooms close as you go.
              </p>
            </div>
          </div>
        </main>
      )}

      {stage.kind === 'working' && (
        <main className="mx-auto w-full max-w-xl px-5 py-12" data-testid="import-progress">
          <h1 className="text-2xl font-semibold tracking-tight">
            Reading {stage.fileName}
            {stage.pageNo > 1 && <span className="text-ink-soft">, page {stage.pageNo}</span>}
          </h1>
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
            <div
              className="mt-5 h-1.5 overflow-hidden rounded-full bg-sunken"
              role="progressbar"
              aria-label="Import progress"
              aria-valuemin={0}
              aria-valuemax={STEPS.length}
              aria-valuenow={stage.step}
            >
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
          error={createError}
          pages={
            doc && doc.pageCount > 1 ? (
              <PagePicker pageCount={doc.pageCount} page={session.current.pageNo} thumbs={thumbs} disabled={busy || creating !== null} onPick={pickPage} />
            ) : null
          }
          onName={setName}
          onView={setView}
          onRole={(layer, role) => rerun({ ...roles, [layer]: role }, userScale)}
          onScale={(mm) => rerun(roles, mm)}
          onCreate={() => setChoosing(true)}
          onTrace={() => void finish('trace')}
          onRetryAssistant={() => void retryAssistant()}
        />
      )}

      {choosing && detail && <NextStep creating={creating} onPick={(next) => void finish(next)} onClose={() => creating === null && setChoosing(false)} />}

      <DropOverlay visible={dragging && stage.kind !== 'pick'} title="Drop to import this plan instead" body="The plan you are reviewing is replaced by the PDF you drop." />
    </div>
  );
}

/** The two ways on from a reviewed import. Nothing is created until one is picked. */
function NextStep({ creating, onPick, onClose }: { creating: Next | null; onPick: (next: Next) => void; onClose: () => void }) {
  const option = (next: 'furnish' | 'review', icon: ReactNode, title: string, body: string, primary: boolean) => (
    <button
      type="button"
      data-testid={`next-${next}`}
      data-autofocus={primary ? '' : undefined}
      disabled={creating !== null}
      onClick={() => onPick(next)}
      className={cn(
        'flex w-full items-start gap-3 rounded-[var(--radius-panel)] border p-3.5 text-left transition-colors disabled:opacity-60',
        primary ? 'border-accent bg-accent-soft hover:bg-accent-soft/70' : 'border-line bg-surface hover:bg-sunken',
      )}
    >
      <span className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-lg', primary ? 'bg-accent text-white' : 'bg-sunken text-ink-soft')}>
        {creating === next ? <Spinner className={primary ? 'text-white' : undefined} /> : icon}
      </span>
      <span className="min-w-0">
        <span className="block text-sm font-semibold text-ink">{title}</span>
        <span className="mt-0.5 block text-[13px] text-ink-soft">{body}</span>
      </span>
    </button>
  );
  return (
    <Dialog title="Your plan is ready. What next?" onClose={onClose}>
      <div className="flex flex-col gap-2.5" data-testid="next-step">
        {option(
          'furnish',
          <Sparkles className="h-4 w-4" />,
          'Furnish it for me',
          'Puts a suggested layout in every room and opens the 3D view. One undo takes it back, and everything can be moved or swapped.',
          true,
        )}
        {option(
          'review',
          <PencilRuler className="h-4 w-4" />,
          'Review the plan first',
          'Opens the 2D editor over your drawing to check walls, doors and room names before furnishing.',
          false,
        )}
      </div>
    </Dialog>
  );
}

interface ReviewProps {
  detail: ImportDetail;
  ai: AiOutcome;
  roles: Record<string, LayerRole>;
  userScale: number | null;
  busy: boolean;
  creating: Next | null;
  name: string;
  view: 'both' | 'drawing' | 'plan';
  error: string | null;
  /** The page picker, for PDFs with more than one page. */
  pages: ReactNode;
  onName: (name: string) => void;
  onView: (view: 'both' | 'drawing' | 'plan') => void;
  onRole: (layer: string, role: LayerRole) => void;
  onScale: (mmPerPdfUnit: number | null) => void;
  onCreate: () => void;
  onTrace: () => void;
  onRetryAssistant: () => void;
}

/** An entry of "Things to check": an importer issue, or one the review adds itself. */
interface Check extends Issue {
  key: string;
}

function Review({ detail, ai, roles, userScale, busy, creating, name, view, error, pages, onName, onView, onRole, onScale, onCreate, onTrace, onRetryAssistant }: ReviewProps) {
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
  // Open-plan dividers carry a passage each; those are not doors.
  const openings = Object.values(level.openings).filter((o) => !isDivider(level.walls[o.wallId]));
  const count = (kind: string) => openings.filter((o) => o.kind === kind).length;
  const layers = useMemo(
    () => [...draft.layers].sort((a, b) => Number(a.role === 'ignore') - Number(b.role === 'ignore') || b.segments - a.segments),
    [draft.layers],
  );

  const unsure = useMemo(() => lowConfidenceIds(draft), [draft]);
  const unsureCount = unsure.walls.length + unsure.openings.length;
  const checks = useMemo<Check[]>(() => {
    const list: Check[] = draft.issues.map((issue, i) => ({ ...issue, key: `${issue.code}-${i}` }));
    if (unsureCount > 0) {
      const parts = [unsure.walls.length > 0 && plural(unsure.walls.length, 'wall'), unsure.openings.length > 0 && plural(unsure.openings.length, 'opening')].filter(Boolean);
      list.push({
        key: 'low-confidence',
        severity: 'info',
        code: 'low-confidence',
        message: `${parts.join(' and ')} ${unsureCount === 1 ? 'was' : 'were'} read with low confidence and ${unsureCount === 1 ? 'is' : 'are'} marked in amber. Compare ${unsureCount === 1 ? 'it' : 'them'} with the drawing.`,
        refs: [...unsure.walls, ...unsure.openings],
      });
    }
    const rank = (c: Check) => (c.severity === 'info' ? 1 : 0);
    return list.sort((a, b) => rank(a) - rank(b));
  }, [draft.issues, unsure, unsureCount]);
  const blocking = checks.filter((c) => c.severity !== 'info');

  // Pointing the preview at one issue. A changed draft has new element ids, so the pointer is dropped.
  const [focusKey, setFocusKey] = useState<string | null>(null);
  useEffect(() => setFocusKey(null), [draft]);
  const known = (id: Id) => !!(level.walls[id] || level.openings[id] || level.rooms[id]);
  const focusOf = (c: Check): PreviewFocus | null => {
    const refs = (c.refs ?? []).filter(known);
    return refs.length > 0 || c.at ? { refs, at: c.at } : null;
  };
  const focused = checks.find((c) => c.key === focusKey);
  const focus = focused ? focusOf(focused) : null;

  const traceOnly = rooms.length === 0;
  const scan = detail.mode === 'none';
  const working = busy || creating !== null;

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
        {pages}
        <div className="relative min-h-0 flex-1">
          <PlanPreview draft={draft} showDrawing={view !== 'plan'} showPlan={view !== 'drawing'} focus={focus} />
          {focus && (
            <Button size="sm" className="absolute top-3 right-3 shadow-[var(--shadow-panel)]" icon={<X className="h-4 w-4" />} onClick={() => setFocusKey(null)} data-testid="preview-reset">
              Show the whole plan
            </Button>
          )}
          {busy && (
            <div className="absolute inset-0 flex items-center justify-center bg-surface/60">
              <Spinner className="h-6 w-6" />
            </div>
          )}
        </div>
        <div className="border-t border-line px-3 py-2">
          <Legend unsure={unsureCount} />
        </div>
      </Panel>

      <div className="flex min-h-0 flex-col gap-4">
        <div className="flex min-h-0 flex-1 flex-col gap-4 lg:overflow-auto">
          <Panel>
            <PanelHeader title="Summary" />
            <div className="flex flex-col gap-3 p-3">
              <div className="grid grid-cols-3 gap-2 text-center">
                <Stat label="Rooms" value={rooms.length} testId="room-count" />
                <Stat label="Doors" value={count('door') + count('sliding') + count('passage')} testId="door-count" />
                <Stat label="Windows" value={count('window')} testId="window-count" />
              </div>
              <AssistantStatus ai={ai} busy={busy} onRetry={onRetryAssistant} />
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
            <ul className="flex flex-col gap-1 p-2 text-sm" data-testid="issue-list">
              {checks.length === 0 && <li className="px-1 py-1 text-ink-soft">Nothing needs your attention.</li>}
              {checks.map((check) => {
                const target = focusOf(check);
                const active = check.key === focusKey;
                const body = (
                  <>
                    {check.severity === 'error' ? (
                      <CircleAlert className="mt-0.5 h-4 w-4 shrink-0 text-danger" />
                    ) : check.severity === 'warning' || check.code === 'low-confidence' ? (
                      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warn" />
                    ) : (
                      <Info className="mt-0.5 h-4 w-4 shrink-0 text-ink-faint" />
                    )}
                    <span className={cn('min-w-0 flex-1', check.severity === 'info' ? 'text-ink-soft' : 'text-ink')}>{check.message}</span>
                  </>
                );
                return (
                  <li key={check.key} data-severity={check.severity} data-code={check.code}>
                    {target ? (
                      <button
                        type="button"
                        aria-pressed={active}
                        title={active ? 'Show the whole plan again' : 'Show this on the plan'}
                        onClick={() => setFocusKey(active ? null : check.key)}
                        data-testid="issue-button"
                        className={cn(
                          'flex w-full items-start gap-2 rounded-md px-1.5 py-1.5 text-left transition-colors',
                          active ? 'bg-warn-soft ring-1 ring-warn/40' : 'hover:bg-sunken',
                        )}
                      >
                        {body}
                        <span className={cn('mt-0.5 shrink-0 text-xs font-medium', active ? 'text-warn' : 'text-accent')}>{active ? 'Showing' : 'Show'}</span>
                      </button>
                    ) : (
                      <div className="flex items-start gap-2 px-1.5 py-1.5">{body}</div>
                    )}
                  </li>
                );
              })}
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
        </div>

        <Panel className="shrink-0">
          <div className="flex flex-col gap-3 p-3">
            <Field label="Project name">
              <TextInput value={name} onChange={(e) => onName(e.currentTarget.value)} aria-label="Project name" />
            </Field>
            {error && (
              <p role="alert" className="text-sm text-danger">
                {error}
              </p>
            )}
            {traceOnly ? (
              <div className="flex flex-col gap-2" data-testid="trace-callout">
                <p className="text-[13px] text-ink-soft">
                  {scan
                    ? 'This page is a picture, not line work, so there are no walls to read. Trace it yourself: the page is placed under the editor and you click along its walls.'
                    : 'No closed rooms were found. Trace the plan yourself over the drawing, or try another layer as walls above.'}
                </p>
                <Button
                  variant="primary"
                  disabled={working}
                  icon={creating === 'trace' ? <Spinner className="text-white" /> : <PencilRuler className="h-4 w-4" />}
                  onClick={onTrace}
                  data-testid="trace-yourself"
                >
                  Trace it yourself
                </Button>
              </div>
            ) : (
              <>
                <Button variant="primary" disabled={working} icon={<ArrowRight className="h-4 w-4" />} onClick={onCreate} data-testid="create-project">
                  Create project
                </Button>
                <button
                  type="button"
                  disabled={working}
                  onClick={onTrace}
                  data-testid="trace-yourself"
                  className="inline-flex items-center justify-center gap-1.5 rounded-md py-0.5 text-[13px] text-ink-soft hover:text-ink disabled:text-ink-faint"
                >
                  {creating === 'trace' ? <Spinner className="h-3.5 w-3.5" /> : <PencilRuler className="h-3.5 w-3.5" />}
                  Detection looks wrong? <span className="font-medium text-accent underline underline-offset-2">Trace it yourself</span>
                </button>
              </>
            )}
          </div>
        </Panel>
      </div>
    </main>
  );
}

/** What the assistant did for this import, and how to switch it on when it is off. */
function AssistantStatus({ ai, busy, onRetry }: { ai: AiOutcome; busy: boolean; onRetry: () => void }) {
  const code = 'rounded bg-surface px-1 py-0.5 font-mono text-[12px] text-ink';
  return (
    <div
      className={cn('flex items-start gap-2 rounded-lg px-3 py-2 text-sm', ai.status === 'used' ? 'bg-accent-soft text-accent-strong' : 'bg-sunken text-ink-soft')}
      data-testid="ai-status"
      data-status={ai.status}
    >
      <Sparkles className="mt-0.5 h-4 w-4 shrink-0" />
      {ai.status === 'used' ? (
        <span>Room names and sizes were read from the drawing by the assistant.</span>
      ) : ai.status === 'unavailable' ? (
        <div className="min-w-0">
          <p className="font-medium text-ink">The assistant is switched off</p>
          <p className="mt-0.5">
            This import used the line work only: walls, doors and windows come from the drawing, but room names and types are guesses. You can carry on and rename rooms in the editor.
          </p>
          <details className="mt-1.5" data-testid="ai-help">
            <summary className="cursor-pointer font-medium text-accent">How to switch it on</summary>
            <ol className="mt-1.5 flex list-decimal flex-col gap-1 pl-5">
              <li>
                Copy <code className={code}>.env.example</code> to <code className={code}>.env</code> in the Interio folder.
              </li>
              <li>
                Set <code className={code}>ANTHROPIC_API_KEY</code> in that file to your Anthropic API key.
              </li>
              <li>
                Restart <code className={code}>pnpm dev</code> and upload the plan again.
              </li>
            </ol>
            <p className="mt-1.5 text-xs">With a key, a picture of the page is sent to Anthropic to read room names, labelled sizes and door tags. Without one, nothing leaves your computer.</p>
          </details>
        </div>
      ) : (
        <div className="min-w-0">
          <p>
            The assistant could not help this time ({ai.detail ?? 'no reply'}), so this import used the line work only. Room names and types are guesses: rename them in the editor, or
            ask again.
          </p>
          <button type="button" disabled={busy} onClick={onRetry} className="mt-1 font-medium text-accent underline underline-offset-2 disabled:text-ink-faint" data-testid="ai-retry">
            Ask the assistant again
          </button>
        </div>
      )}
    </div>
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
      <PanelHeader
        title="Scale"
        actions={
          // With no estimate at all the importer falls back to a nominal value: say so instead of naming a source.
          scale.source === 'titleBlock' && c.titleBlock === null ? (
            <Badge tone="warn">not found: set it below</Badge>
          ) : (
            <Badge tone={scale.spreadPct > 1 && scale.source !== 'user' ? 'warn' : 'neutral'}>from {SOURCE_LABEL[scale.source]}</Badge>
          )
        }
      />
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
