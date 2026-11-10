import { deriveRooms, type Project } from '@interio/core';
import { Copy, FileUp, FolderOpen, Home, LayoutTemplate, Pencil, Plus, Sparkles, Trash2 } from 'lucide-react';
import { useCallback, useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { squareFeet, timeAgo } from '../lib/format';
import { PlanSvg } from '../lib/PlanSvg';
import {
  createBlankProject,
  createFromSample,
  deleteStoredProject,
  duplicateProject,
  furnishProject,
  importProjectFile,
  isProjectFile,
  renameStoredProject,
} from '../lib/session';
import { isPdfFile, pdfHandoff, plural, useDocumentTitle } from '../lib/shell';
import { storage } from '../lib/storage';
import { Button, Dialog, DropOverlay, Field, IconButton, Spinner, TextInput, toast, useFileDrop } from '../ui';

export function Logo() {
  return (
    <Link to="/" className="flex items-center gap-2 rounded-lg text-ink" aria-label="Interio home">
      <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-accent text-white">
        <Home className="h-4 w-4" />
      </span>
      <span className="text-[15px] font-semibold tracking-tight">Interio</span>
    </Link>
  );
}

const message = (error: unknown, fallback: string): string => (error instanceof Error && error.message ? error.message : fallback);

interface CardProps {
  project: Project;
  onRename: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
}

function ProjectCard({ project, onRename, onDuplicate, onDelete }: CardProps) {
  const level = project.levels[0]!;
  const rooms = deriveRooms(level);
  const area = rooms.reduce((s, r) => s + r.interiorArea, 0);
  const items = Object.keys(level.items).length;
  return (
    <div
      className="group relative overflow-hidden rounded-[var(--radius-panel)] border border-line bg-surface transition-shadow focus-within:shadow-[var(--shadow-panel)] hover:shadow-[var(--shadow-panel)]"
      data-testid="project-tile"
      data-project-id={project.id}
    >
      <Link to={`/p/${project.id}/design`} className="block rounded-[var(--radius-panel)]" data-testid="project-card">
        <div className="flex h-44 items-center justify-center bg-canvas p-3">
          {rooms.length > 0 ? (
            <PlanSvg level={level} labels={false} className="h-full w-full" />
          ) : (
            <span className="text-sm text-ink-faint">Empty plan</span>
          )}
        </div>
        <div className="border-t border-line p-3">
          <div className="truncate text-sm font-semibold text-ink" data-testid="card-name">
            {project.name}
          </div>
          <div className="mt-0.5 truncate text-xs text-ink-soft">
            {plural(rooms.length, 'room')}
            {area > 0 && ` · ${squareFeet(area)}`} ·{' '}
            <span data-testid="card-items" data-count={items}>
              {items === 0 ? 'unfurnished' : plural(items, 'item')}
            </span>{' '}
            · {timeAgo(project.updatedAt)}
          </div>
        </div>
      </Link>
      {/* Shown on hover and keyboard focus; always there on touch screens, which have no hover. */}
      <div className="absolute top-2 right-2 flex gap-0.5 rounded-lg bg-surface/95 p-0.5 opacity-0 shadow-[var(--shadow-panel)] transition-opacity group-focus-within:opacity-100 group-hover:opacity-100 [@media(hover:none)]:opacity-100">
        <IconButton label={`Rename ${project.name}`} size="sm" onClick={onRename}>
          <Pencil className="h-4 w-4" />
        </IconButton>
        <IconButton label={`Duplicate ${project.name}`} size="sm" onClick={onDuplicate}>
          <Copy className="h-4 w-4" />
        </IconButton>
        <IconButton label={`Delete ${project.name}`} size="sm" onClick={onDelete}>
          <Trash2 className="h-4 w-4" />
        </IconButton>
      </div>
    </div>
  );
}

function RenameDialog({ project, onClose, onDone }: { project: Project; onClose: () => void; onDone: () => void }) {
  const [name, setName] = useState(project.name);
  const trimmed = name.trim();
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!trimmed) return;
    try {
      if (trimmed !== project.name) await renameStoredProject(project.id, trimmed);
      onDone();
    } catch (error) {
      toast.error(message(error, 'The project could not be renamed'));
    }
  };
  return (
    <Dialog
      title="Rename project"
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" type="submit" form="rename-project" disabled={!trimmed}>
            Rename
          </Button>
        </>
      }
    >
      <form id="rename-project" onSubmit={(e) => void submit(e)}>
        <Field label="Name">
          <TextInput value={name} onChange={(e) => setName(e.currentTarget.value)} onFocus={(e) => e.currentTarget.select()} data-autofocus maxLength={120} />
        </Field>
      </form>
    </Dialog>
  );
}

export function Dashboard() {
  const navigate = useNavigate();
  const [projects, setProjects] = useState<Project[] | null>(null);
  const [pendingDelete, setPendingDelete] = useState<Project | null>(null);
  const [renaming, setRenaming] = useState<Project | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  useDocumentTitle('Your homes');

  const refresh = useCallback(() => storage.listProjects().then(setProjects), []);
  useEffect(() => {
    void refresh();
  }, [refresh]);

  const open = useCallback((p: Project, mode = 'design') => navigate(`/p/${p.id}/${mode}`), [navigate]);

  const openFile = useCallback(
    async (file: File) => {
      try {
        open(await importProjectFile(file));
      } catch (error) {
        toast.error(message(error, 'Could not open that file'));
      }
    },
    [open],
  );

  // A PDF dropped anywhere starts an import; a project file is opened.
  const dragging = useFileDrop((files) => {
    const pdf = files.find(isPdfFile);
    const project = files.find(isProjectFile);
    if (pdf) {
      pdfHandoff.put(pdf);
      navigate('/import');
    } else if (project) void openFile(project);
    else toast.error('Drop a floor-plan PDF or an Interio project file.');
  });

  /** Runs one of the start actions, with a spinner on its card and a toast if it fails. */
  const start = async (id: string, action: () => Promise<void>) => {
    if (busy) return;
    setBusy(id);
    try {
      await action();
    } catch (error) {
      toast.error(message(error, 'That did not work. Try again.'));
      setBusy(null);
    }
  };

  const furnishedSample = async () => {
    const { project, added } = await furnishProject(await createFromSample());
    open(project);
    toast.success(added > 0 ? `Furnished the sample home with ${plural(added, 'item')}` : 'The sample home is ready');
  };

  return (
    <div className="min-h-full">
      <header className="flex h-14 items-center justify-between border-b border-line bg-surface px-5">
        <Logo />
        <div className="flex items-center gap-2">
          <Button icon={<FolderOpen className="h-4 w-4" />} onClick={() => fileInput.current?.click()}>
            Open file
          </Button>
          <Button variant="primary" icon={<FileUp className="h-4 w-4" />} onClick={() => navigate('/import')}>
            New from PDF
          </Button>
          <input
            ref={fileInput}
            type="file"
            accept=".interio,.json,application/json"
            className="hidden"
            data-testid="project-file-input"
            onChange={(e) => {
              const file = e.currentTarget.files?.[0];
              e.currentTarget.value = '';
              if (file) void openFile(file);
            }}
          />
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-5 py-8">
        <h1 className="text-2xl font-semibold tracking-tight text-ink">Your homes</h1>
        <p className="mt-1 text-sm text-ink-soft">Upload a floor plan, furnish it in 3D, and walk through every room. Drop a PDF anywhere on this page to start.</p>

        <div className="mt-6 grid grid-cols-1 gap-3 md:grid-cols-3">
          <StartCard
            icon={<FileUp className="h-5 w-5" />}
            title="Upload a floor plan"
            body="PDF from your builder or architect"
            onClick={() => navigate('/import')}
            testId="start-import"
          />
          <StartCard
            icon={<LayoutTemplate className="h-5 w-5" />}
            title="Try the sample home"
            body="A three-bedroom apartment"
            busy={busy === 'sample'}
            onClick={() => void start('sample', async () => open(await createFromSample()))}
            testId="start-sample"
            extra={{
              label: 'Furnish it for me',
              hint: 'Open the sample home with a suggested layout in every room',
              busy: busy === 'sample-furnished',
              onClick: () => void start('sample-furnished', furnishedSample),
              testId: 'start-sample-furnished',
            }}
          />
          <StartCard
            icon={<Plus className="h-5 w-5" />}
            title="Draw from scratch"
            body="Start with an empty plan"
            busy={busy === 'blank'}
            onClick={() => void start('blank', async () => open(await createBlankProject(), 'plan'))}
            testId="start-blank"
          />
        </div>

        <h2 className="mt-10 text-sm font-semibold text-ink">Recent</h2>
        {projects === null ? (
          <div className="mt-6 flex justify-center">
            <Spinner />
          </div>
        ) : projects.length === 0 ? (
          <p className="mt-3 text-sm text-ink-soft">Nothing here yet. Projects are saved in this browser.</p>
        ) : (
          <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {projects.map((p) => (
              <ProjectCard
                key={p.id}
                project={p}
                onRename={() => setRenaming(p)}
                onDelete={() => setPendingDelete(p)}
                onDuplicate={async () => {
                  try {
                    const copy = await duplicateProject(p.id);
                    await refresh();
                    if (copy) toast.success(`Made “${copy.name}”`);
                  } catch (error) {
                    toast.error(message(error, 'The project could not be duplicated'));
                  }
                }}
              />
            ))}
          </div>
        )}
      </main>

      {renaming && (
        <RenameDialog
          project={renaming}
          onClose={() => setRenaming(null)}
          onDone={() => {
            setRenaming(null);
            void refresh();
          }}
        />
      )}

      {pendingDelete && (
        <Dialog
          title="Delete project"
          onClose={() => setPendingDelete(null)}
          footer={
            <>
              <Button onClick={() => setPendingDelete(null)}>Cancel</Button>
              <Button
                variant="danger"
                onClick={async () => {
                  await deleteStoredProject(pendingDelete.id);
                  setPendingDelete(null);
                  void refresh();
                }}
              >
                Delete
              </Button>
            </>
          }
        >
          Delete “{pendingDelete.name}”? This removes it from this browser and cannot be undone. Export it first if you want to keep a copy.
        </Dialog>
      )}

      <DropOverlay visible={dragging} title="Drop to open" body="A floor-plan PDF starts a new home. An Interio project file opens as it was saved." />
    </div>
  );
}

interface StartCardProps {
  icon: ReactNode;
  title: string;
  body: string;
  onClick: () => void;
  testId: string;
  busy?: boolean;
  /** A second way to start from the same card. */
  extra?: { label: string; hint: string; onClick: () => void; testId: string; busy?: boolean };
}

function StartCard({ icon, title, body, onClick, testId, busy, extra }: StartCardProps) {
  return (
    <div className="flex items-stretch overflow-hidden rounded-[var(--radius-panel)] border border-line bg-surface transition-shadow focus-within:shadow-[var(--shadow-panel)] hover:shadow-[var(--shadow-panel)]">
      <button type="button" data-testid={testId} onClick={onClick} className="flex min-w-0 flex-1 items-center gap-3 p-4 text-left hover:bg-sunken/60">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-accent-soft text-accent-strong">{busy ? <Spinner /> : icon}</span>
        <span className="min-w-0">
          <span className="block text-sm font-semibold text-ink">{title}</span>
          <span className="block text-xs text-ink-soft">{body}</span>
        </span>
      </button>
      {extra && (
        <button
          type="button"
          data-testid={extra.testId}
          title={extra.hint}
          onClick={extra.onClick}
          className="flex w-[124px] shrink-0 flex-col items-center justify-center gap-1 border-l border-line px-2 text-center text-xs leading-tight font-medium text-accent-strong hover:bg-accent-soft"
        >
          {extra.busy ? <Spinner /> : <Sparkles className="h-4 w-4" />}
          {extra.label}
        </button>
      )}
    </div>
  );
}
