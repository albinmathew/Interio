/**
 * Glue between the plan store and storage: opening, creating, autosaving,
 * exporting and importing projects.
 */
import {
  createProject,
  createSampleProject,
  migrate,
  planStore,
  serializeProject,
  type PlanDraft,
  type Project,
  type Underlay,
} from '@interio/core';
import { create } from 'zustand';
import { storage } from './storage';

export const useSaveStatus = create<{ status: 'saved' | 'saving' | 'error' }>(() => ({ status: 'saved' }));

export async function openProject(id: string): Promise<Project | null> {
  const current = planStore.getState().project;
  if (current?.id === id) return current;
  const project = await storage.getProject(id);
  if (project) planStore.getState().loadProject(project);
  return project;
}

export async function createBlankProject(name = 'Untitled plan'): Promise<Project> {
  const project = createProject(name);
  await storage.saveProject(project);
  return project;
}

export async function createFromSample(): Promise<Project> {
  const project = createSampleProject();
  await storage.saveProject(project);
  return project;
}

/** Makes a project from a reviewed import draft and stores its source PDF and underlay. */
export async function createFromDraft(draft: PlanDraft, name: string, pdf?: Blob): Promise<Project> {
  const project = planStore.getState().applyDraft(draft, name);
  await storage.saveProject(project);
  await saveUnderlay(project.id, draft.underlay);
  if (pdf) await storage.putAsset(project.id, 'pdf', pdf);
  return project;
}

export async function saveUnderlay(projectId: string, underlay: Underlay): Promise<void> {
  await storage.putAsset(projectId, 'underlay', underlay);
}

export async function loadUnderlay(projectId: string): Promise<Underlay | null> {
  return storage.getAsset<Underlay>(projectId, 'underlay');
}

/** Saves the open project shortly after every change. Returns the unsubscribe function. */
export function startAutosave(delayMs = 400): () => void {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let last = planStore.getState().project;
  const flush = async () => {
    const project = planStore.getState().project;
    if (!project) return;
    try {
      await storage.saveProject(project);
      useSaveStatus.setState({ status: 'saved' });
    } catch (error) {
      console.error('Autosave failed', error);
      useSaveStatus.setState({ status: 'error' });
    }
  };
  const unsubscribe = planStore.subscribe((state) => {
    if (state.project === last) return;
    last = state.project;
    if (!state.project) return;
    useSaveStatus.setState({ status: 'saving' });
    clearTimeout(timer);
    timer = setTimeout(flush, delayMs);
  });
  return () => {
    clearTimeout(timer);
    void flush();
    unsubscribe();
  };
}

export function exportProjectFile(project: Project): void {
  const blob = new Blob([serializeProject(project)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${project.name.replace(/[^\w.-]+/g, '-').replace(/^-+|-+$/g, '') || 'plan'}.interio.json`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Reads a project file. The copy gets a fresh id so it never overwrites an existing project. */
export async function importProjectFile(file: File): Promise<Project> {
  const parsed = migrate(JSON.parse(await file.text()));
  const project: Project = { ...parsed, id: createProject('').id, updatedAt: Date.now() };
  await storage.saveProject(project);
  return project;
}
