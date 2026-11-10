import { planStore, selectCanRedo, selectCanUndo, usePlanStore } from '@interio/core';
import { ArrowLeft, Check, CircleHelp, CloudAlert, Download, Redo2, TriangleAlert, Undo2 } from 'lucide-react';
import { Suspense, useEffect, useState } from 'react';
import { Navigate, useNavigate, useParams } from 'react-router-dom';
import { create } from 'zustand';
import { WORKSPACE_FEATURES, type WorkspaceFeature, type WorkspaceMode } from '../features/registry';
import { fileSize } from '../lib/format';
import { exportProjectFile, openProject, startAutosave, useSaveStatus } from '../lib/session';
import { useDocumentTitle } from '../lib/shell';
import { Button, ErrorBoundary, IconButton, Panel, Segmented, Spinner, toast } from '../ui';
import { HelpDialog } from './Help';
import { ProjectNotFound } from './NotFound';

function isTyping(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  return !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable);
}

/* Development hook: lets tests and the console make the open mode fail while rendering, to see the recovery screen. */
const useCrashProbe = create<{ armed: boolean }>(() => ({ armed: false }));

function CrashProbe() {
  if (useCrashProbe((s) => s.armed)) throw new Error('This mode was made to fail by the development hook.');
  return null;
}

declare global {
  interface Window {
    __interioShell?: { crashFeature(): void };
  }
}

if (import.meta.env.DEV && typeof window !== 'undefined') {
  window.__interioShell = { crashFeature: () => useCrashProbe.setState({ armed: true }) };
}

/** Shown in place of a mode that crashed. The header stays usable around it. */
function FeatureCrash({ feature, error, onRetry, onHome }: { feature: WorkspaceFeature; error: Error; onRetry: () => void; onHome: () => void }) {
  return (
    <div className="flex h-full items-center justify-center overflow-auto bg-canvas p-6" role="alert" data-testid="feature-error">
      <Panel className="w-[min(92vw,480px)] p-6 text-center">
        <span className="mx-auto flex h-11 w-11 items-center justify-center rounded-full bg-warn-soft text-warn">
          <TriangleAlert className="h-5 w-5" />
        </span>
        <h2 className="mt-3 text-base font-semibold text-ink">{feature.label} mode ran into a problem</h2>
        <p className="mt-1.5 text-sm text-ink-soft">
          Your home is safe: it is saved in this browser, and the other modes still open from the tabs above. Try this mode again, or go back to your homes.
        </p>
        <div className="mt-4 flex flex-wrap justify-center gap-2">
          <Button variant="primary" onClick={onRetry} data-testid="feature-retry">
            Try again
          </Button>
          <Button onClick={onHome} data-testid="feature-home">
            Back to your homes
          </Button>
        </div>
        <details className="mt-4 text-left text-xs text-ink-faint">
          <summary className="cursor-pointer text-center">Technical details</summary>
          <pre className="mt-2 max-h-32 overflow-auto rounded-md bg-sunken p-2 font-mono whitespace-pre-wrap text-ink-soft" data-testid="feature-error-detail">
            {error.message || String(error)}
          </pre>
        </details>
      </Panel>
    </div>
  );
}

/** The project shell: header (name, mode tabs, undo/redo, save state, help, export) around one feature. */
export function Workspace() {
  const { projectId, mode } = useParams();
  const navigate = useNavigate();
  const project = usePlanStore((s) => s.project);
  const canUndo = usePlanStore(selectCanUndo);
  const canRedo = usePlanStore(selectCanRedo);
  const save = useSaveStatus((s) => s.status);
  const [state, setState] = useState<'loading' | 'ready' | 'missing'>('loading');
  const [helpOpen, setHelpOpen] = useState(false);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    let alive = true;
    setState('loading');
    void openProject(projectId!).then(
      (p) => alive && setState(p ? 'ready' : 'missing'),
      () => alive && setState('missing'),
    );
    return () => {
      alive = false;
    };
  }, [projectId]);

  useEffect(() => startAutosave(), []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isTyping(e.target) || !(e.metaKey || e.ctrlKey) || e.key.toLowerCase() !== 'z') return;
      e.preventDefault();
      if (e.shiftKey) planStore.getState().redo();
      else planStore.getState().undo();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const feature = WORKSPACE_FEATURES.find((f) => f.mode === mode);
  const open = state === 'ready' && project && project.id === projectId ? project : null;
  useDocumentTitle(open ? `${open.name.trim() || 'Untitled plan'} · ${feature?.label ?? ''}`.replace(/ · $/, '') : state === 'missing' ? 'Project not found' : null);

  if (!feature) return <Navigate to={`/p/${projectId}/design`} replace />;
  if (state === 'missing') return <ProjectNotFound />;
  if (!open)
    return (
      <div className="flex h-full items-center justify-center">
        <Spinner className="h-6 w-6" />
      </div>
    );

  const exportFile = async () => {
    if (exporting) return;
    setExporting(true);
    try {
      const { fileName, size, skipped } = await exportProjectFile(open);
      if (skipped.includes('pdf')) toast.info(`Saved ${fileName} (${fileSize(size)}) without the source PDF, which is too large to include.`);
      else toast.success(`Saved ${fileName} (${fileSize(size)}) to your downloads`);
    } catch (error) {
      toast.error(error instanceof Error && error.message ? `The project could not be exported: ${error.message}` : 'The project could not be exported');
    } finally {
      setExporting(false);
    }
  };

  const Feature = feature.component;
  return (
    <div className="flex h-full flex-col">
      <header className="grid h-12 shrink-0 grid-cols-[1fr_auto_1fr] items-center border-b border-line bg-surface px-2">
        <div className="flex min-w-0 items-center gap-1">
          <IconButton label="Back to your homes" onClick={() => navigate('/')}>
            <ArrowLeft className="h-4 w-4" />
          </IconButton>
          <input
            aria-label="Project name"
            className="h-8 min-w-0 flex-1 truncate rounded-md border border-transparent bg-transparent px-2 text-sm font-semibold text-ink hover:border-line focus:border-line"
            value={open.name}
            onChange={(e) => planStore.getState().renameProject(e.currentTarget.value)}
          />
        </div>
        <nav aria-label="Modes">
          <Segmented<WorkspaceMode>
            value={feature.mode}
            onChange={(m) => navigate(`/p/${projectId}/${m}`)}
            options={WORKSPACE_FEATURES.map((f) => ({
              value: f.mode,
              title: f.hint,
              label: (
                <>
                  <f.icon className="h-4 w-4" aria-hidden="true" />
                  {f.label}
                </>
              ),
            }))}
          />
        </nav>
        <div className="flex items-center justify-end gap-1">
          <span className="mr-1 flex items-center gap-1 text-xs text-ink-faint" role="status" data-testid="save-status" data-status={save}>
            {save === 'saving' ? (
              <Spinner className="h-3.5 w-3.5" />
            ) : save === 'error' ? (
              <CloudAlert className="h-3.5 w-3.5 text-danger" aria-hidden="true" />
            ) : (
              <Check className="h-3.5 w-3.5" aria-hidden="true" />
            )}
            {save === 'saving' ? 'Saving' : save === 'error' ? 'Not saved' : 'Saved'}
          </span>
          <IconButton label="Undo (⌘Z)" disabled={!canUndo} onClick={() => planStore.getState().undo()}>
            <Undo2 className="h-4 w-4" />
          </IconButton>
          <IconButton label="Redo (⇧⌘Z)" disabled={!canRedo} onClick={() => planStore.getState().redo()}>
            <Redo2 className="h-4 w-4" />
          </IconButton>
          <IconButton label="Help" active={helpOpen} onClick={() => setHelpOpen(true)} data-testid="help-open">
            <CircleHelp className="h-4 w-4" />
          </IconButton>
          <IconButton label="Export project file" disabled={exporting} onClick={() => void exportFile()} data-testid="export-project">
            {exporting ? <Spinner /> : <Download className="h-4 w-4" />}
          </IconButton>
        </div>
      </header>
      <main className="relative min-h-0 flex-1 overflow-hidden" data-testid={`feature-${feature.mode}`}>
        <ErrorBoundary
          resetKey={`${projectId}/${feature.mode}`}
          onError={(error) => {
            console.error(`${feature.label} mode crashed`, error);
            // A crash requested through the development hook happens once, so trying again recovers.
            useCrashProbe.setState({ armed: false });
          }}
          fallback={(error, reset) => (
            <FeatureCrash
              feature={feature}
              error={error}
              onHome={() => navigate('/')}
              onRetry={reset}
            />
          )}
        >
          <Suspense
            fallback={
              <div className="flex h-full items-center justify-center">
                <Spinner className="h-6 w-6" />
              </div>
            }
          >
            <CrashProbe />
            <Feature />
          </Suspense>
        </ErrorBoundary>
      </main>
      {helpOpen && <HelpDialog mode={feature.mode} onClose={() => setHelpOpen(false)} />}
    </div>
  );
}
