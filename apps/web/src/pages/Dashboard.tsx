import { deriveRooms, type Project } from '@interio/core';
import { FileUp, FolderOpen, Home, LayoutTemplate, Plus, Trash2 } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { squareFeet, timeAgo } from '../lib/format';
import { PlanSvg } from '../lib/PlanSvg';
import { createBlankProject, createFromSample, importProjectFile } from '../lib/session';
import { storage } from '../lib/storage';
import { Button, Dialog, IconButton, Spinner, toast } from '../ui';

export function Logo() {
  return (
    <Link to="/" className="flex items-center gap-2 text-ink" aria-label="Interio home">
      <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-accent text-white">
        <Home className="h-4 w-4" />
      </span>
      <span className="text-[15px] font-semibold tracking-tight">Interio</span>
    </Link>
  );
}

function ProjectCard({ project, onDelete }: { project: Project; onDelete: () => void }) {
  const level = project.levels[0]!;
  const rooms = deriveRooms(level);
  const area = rooms.reduce((s, r) => s + r.interiorArea, 0);
  return (
    <div className="group relative overflow-hidden rounded-[var(--radius-panel)] border border-line bg-surface transition-shadow hover:shadow-[var(--shadow-panel)]">
      <Link to={`/p/${project.id}/design`} className="block" data-testid="project-card">
        <div className="flex h-44 items-center justify-center bg-canvas p-3">
          {rooms.length > 0 ? (
            <PlanSvg level={level} labels={false} className="h-full w-full" />
          ) : (
            <span className="text-sm text-ink-faint">Empty plan</span>
          )}
        </div>
        <div className="border-t border-line p-3">
          <div className="truncate text-sm font-semibold text-ink">{project.name}</div>
          <div className="mt-0.5 text-xs text-ink-soft">
            {rooms.length} {rooms.length === 1 ? 'room' : 'rooms'}
            {area > 0 && ` · ${squareFeet(area)}`} · {timeAgo(project.updatedAt)}
          </div>
        </div>
      </Link>
      <IconButton
        label={`Delete ${project.name}`}
        size="sm"
        className="absolute top-2 right-2 bg-surface/90 opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
        onClick={onDelete}
      >
        <Trash2 className="h-4 w-4" />
      </IconButton>
    </div>
  );
}

export function Dashboard() {
  const navigate = useNavigate();
  const [projects, setProjects] = useState<Project[] | null>(null);
  const [pendingDelete, setPendingDelete] = useState<Project | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const refresh = () => storage.listProjects().then(setProjects);
  useEffect(() => {
    void refresh();
  }, []);

  const open = (p: Project, mode = 'design') => navigate(`/p/${p.id}/${mode}`);

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
            accept=".json,application/json"
            className="hidden"
            onChange={async (e) => {
              const file = e.currentTarget.files?.[0];
              e.currentTarget.value = '';
              if (!file) return;
              try {
                open(await importProjectFile(file));
              } catch (error) {
                toast.error(error instanceof Error ? error.message : 'Could not open that file');
              }
            }}
          />
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-5 py-8">
        <h1 className="text-2xl font-semibold tracking-tight text-ink">Your homes</h1>
        <p className="mt-1 text-sm text-ink-soft">Upload a floor plan, furnish it in 3D, and walk through every room.</p>

        <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-3">
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
            body="A three-bedroom apartment, ready to furnish"
            onClick={async () => open(await createFromSample())}
            testId="start-sample"
          />
          <StartCard
            icon={<Plus className="h-5 w-5" />}
            title="Draw from scratch"
            body="Start with an empty plan"
            onClick={async () => open(await createBlankProject(), 'plan')}
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
              <ProjectCard key={p.id} project={p} onDelete={() => setPendingDelete(p)} />
            ))}
          </div>
        )}
      </main>

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
                  await storage.deleteProject(pendingDelete.id);
                  setPendingDelete(null);
                  void refresh();
                }}
              >
                Delete
              </Button>
            </>
          }
        >
          Delete “{pendingDelete.name}”? This removes it from this browser and cannot be undone.
        </Dialog>
      )}
    </div>
  );
}

function StartCard(props: { icon: React.ReactNode; title: string; body: string; onClick: () => void; testId: string }) {
  return (
    <button
      type="button"
      data-testid={props.testId}
      onClick={props.onClick}
      className="flex items-center gap-3 rounded-[var(--radius-panel)] border border-line bg-surface p-4 text-left transition-shadow hover:shadow-[var(--shadow-panel)]"
    >
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-accent-soft text-accent-strong">{props.icon}</span>
      <span>
        <span className="block text-sm font-semibold text-ink">{props.title}</span>
        <span className="block text-xs text-ink-soft">{props.body}</span>
      </span>
    </button>
  );
}
