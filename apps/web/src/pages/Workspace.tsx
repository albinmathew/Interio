import { planStore, selectCanRedo, selectCanUndo, usePlanStore } from '@interio/core';
import { ArrowLeft, Check, CloudAlert, Download, Redo2, Undo2 } from 'lucide-react';
import { Suspense, useEffect, useState } from 'react';
import { Navigate, useNavigate, useParams } from 'react-router-dom';
import { WORKSPACE_FEATURES, type WorkspaceMode } from '../features/registry';
import { exportProjectFile, openProject, startAutosave, useSaveStatus } from '../lib/session';
import { EmptyState, IconButton, Segmented, Spinner } from '../ui';

function isTyping(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  return !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable);
}

/** The project shell: header (name, mode tabs, undo/redo, save state) around one feature. */
export function Workspace() {
  const { projectId, mode } = useParams();
  const navigate = useNavigate();
  const project = usePlanStore((s) => s.project);
  const canUndo = usePlanStore(selectCanUndo);
  const canRedo = usePlanStore(selectCanRedo);
  const save = useSaveStatus((s) => s.status);
  const [state, setState] = useState<'loading' | 'ready' | 'missing'>('loading');

  useEffect(() => {
    let alive = true;
    setState('loading');
    void openProject(projectId!).then((p) => alive && setState(p ? 'ready' : 'missing'));
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
  if (!feature) return <Navigate to={`/p/${projectId}/design`} replace />;
  if (state === 'missing')
    return <EmptyState title="Project not found" body="It may have been deleted from this browser." action={<a className="text-accent underline" href="/">Back to your homes</a>} />;
  if (state === 'loading' || !project || project.id !== projectId)
    return (
      <div className="flex h-full items-center justify-center">
        <Spinner className="h-6 w-6" />
      </div>
    );

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
            value={project.name}
            onChange={(e) => planStore.getState().renameProject(e.currentTarget.value)}
          />
        </div>
        <Segmented<WorkspaceMode>
          value={feature.mode}
          onChange={(m) => navigate(`/p/${projectId}/${m}`)}
          options={WORKSPACE_FEATURES.map((f) => ({
            value: f.mode,
            title: f.hint,
            label: (
              <>
                <f.icon className="h-4 w-4" />
                {f.label}
              </>
            ),
          }))}
        />
        <div className="flex items-center justify-end gap-1">
          <span className="mr-1 flex items-center gap-1 text-xs text-ink-faint" data-testid="save-status" data-status={save}>
            {save === 'saving' ? <Spinner className="h-3.5 w-3.5" /> : save === 'error' ? <CloudAlert className="h-3.5 w-3.5 text-danger" /> : <Check className="h-3.5 w-3.5" />}
            {save === 'saving' ? 'Saving' : save === 'error' ? 'Not saved' : 'Saved'}
          </span>
          <IconButton label="Undo (⌘Z)" disabled={!canUndo} onClick={() => planStore.getState().undo()}>
            <Undo2 className="h-4 w-4" />
          </IconButton>
          <IconButton label="Redo (⇧⌘Z)" disabled={!canRedo} onClick={() => planStore.getState().redo()}>
            <Redo2 className="h-4 w-4" />
          </IconButton>
          <IconButton label="Export project file" onClick={() => exportProjectFile(project)}>
            <Download className="h-4 w-4" />
          </IconButton>
        </div>
      </header>
      <main className="relative min-h-0 flex-1 overflow-hidden" data-testid={`feature-${feature.mode}`}>
        <Suspense
          fallback={
            <div className="flex h-full items-center justify-center">
              <Spinner className="h-6 w-6" />
            </div>
          }
        >
          <Feature />
        </Suspense>
      </main>
    </div>
  );
}
