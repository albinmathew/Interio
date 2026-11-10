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
import { PROJECT_FILE_EXTENSION, ProjectFileError, decodeProjectFile, encodeProjectFile } from './projectFile';
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

/**
 * Opens a stored project in the plan store, furnishes every empty room and saves
 * the result. Furnishing is one undo step, so the user can take it back in Design mode.
 */
export async function furnishProject(project: Project): Promise<{ project: Project; added: number }> {
  // The catalog brings three.js with it: load it only when it is needed, not with the dashboard.
  const { furnishHome } = await import('./furnish');
  if (planStore.getState().project !== project) planStore.getState().loadProject(project);
  const added = furnishHome();
  const furnished = planStore.getState().project ?? project;
  if (added > 0) await storage.saveProject(furnished);
  return { project: furnished, added };
}

/** Drops the project from the plan store when it is the open one, so the next open reads storage again. */
function forget(id: string): void {
  if (planStore.getState().project?.id === id) planStore.getState().closeProject();
}

export async function renameStoredProject(id: string, name: string): Promise<Project | null> {
  const project = await storage.getProject(id);
  if (!project) return null;
  const renamed: Project = { ...project, name, updatedAt: Date.now() };
  await storage.saveProject(renamed);
  forget(id);
  return renamed;
}

/** "Flat" -> "Flat copy" -> "Flat copy 2", skipping names already taken. */
export function copyName(name: string, taken: Iterable<string>): string {
  const used = new Set(taken);
  const base = name.replace(/ copy( \d+)?$/, '');
  let candidate = `${base} copy`;
  for (let n = 2; used.has(candidate); n++) candidate = `${base} copy ${n}`;
  return candidate;
}

/** Copies a project and its assets (underlay, source PDF) under a new id. */
export async function duplicateProject(id: string): Promise<Project | null> {
  const project = await storage.getProject(id);
  if (!project) return null;
  const others = await storage.listProjects();
  const now = Date.now();
  const copy: Project = { ...structuredClone(project), id: createProject('').id, name: copyName(project.name, others.map((p) => p.name)), createdAt: now, updatedAt: now };
  await storage.saveProjectWithAssets(copy, await storage.getAssets(id));
  return copy;
}

export async function deleteStoredProject(id: string): Promise<void> {
  await storage.deleteProject(id);
  forget(id);
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

/* ------------------------------------------------------------ project files */

/** Assets that travel with an exported project. */
const PORTABLE_ASSETS = ['underlay', 'pdf'] as const;
/** A source PDF larger than this stays behind: the plan and its underlay are what the project needs. */
export const MAX_EMBEDDED_PDF_BYTES = 25_000_000;

const isFloat32 = (v: unknown): v is Float32Array => v instanceof Float32Array;

/** A stored or imported underlay is only used when it has the shape the editor expects. */
function asUnderlay(value: unknown): Underlay | null {
  if (!value || typeof value !== 'object') return null;
  const u = value as Partial<Underlay>;
  if (!isFloat32(u.segments) || !isFloat32(u.snapPoints)) return null;
  const underlay: Underlay = { segments: u.segments, snapPoints: u.snapPoints };
  const image = u.image;
  if (
    image &&
    image.blob instanceof Blob &&
    Number.isFinite(image.widthPx) &&
    Number.isFinite(image.heightPx) &&
    Array.isArray(image.planFromImage) &&
    image.planFromImage.length === 6 &&
    image.planFromImage.every((n) => Number.isFinite(n))
  ) {
    underlay.image = { blob: image.blob, widthPx: image.widthPx, heightPx: image.heightPx, planFromImage: image.planFromImage };
  }
  return underlay;
}

export const projectFileName = (name: string): string =>
  `${name.replace(/[^\w.-]+/g, '-').replace(/^-+|-+$/g, '') || 'plan'}${PROJECT_FILE_EXTENSION}`;

/** The bytes of a project file: the project plus its underlay and source PDF when it has them. */
export async function buildProjectFile(project: Project): Promise<{ bytes: Uint8Array; assets: string[]; skipped: string[] }> {
  const stored = await storage.getAssets(project.id);
  const assets: Record<string, unknown> = {};
  const skipped: string[] = [];
  for (const name of PORTABLE_ASSETS) {
    const value = stored[name];
    if (value === undefined || value === null) continue;
    if (name === 'pdf' && value instanceof Blob && value.size > MAX_EMBEDDED_PDF_BYTES) skipped.push(name);
    else assets[name] = value;
  }
  // The JSON round trip drops anything that is not plain data, exactly like the stored record.
  const bytes = await encodeProjectFile({ project: JSON.parse(serializeProject(project)), assets });
  return { bytes, assets: Object.keys(assets), skipped };
}

/** Downloads the project as a single `.interio` file. */
export async function exportProjectFile(project: Project): Promise<{ fileName: string; size: number; assets: string[]; skipped: string[] }> {
  const { bytes, assets, skipped } = await buildProjectFile(project);
  const fileName = projectFileName(project.name);
  const url = URL.createObjectURL(new Blob([bytes.slice().buffer], { type: 'application/octet-stream' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return { fileName, size: bytes.byteLength, assets, skipped };
}

/** Whether a dropped or chosen file looks like a project file (current or legacy extension). */
export const isProjectFile = (file: File): boolean => /\.(interio|json)$/i.test(file.name) || file.type === 'application/json';

/**
 * Reads a project file (current `.interio` or the older plain JSON). The copy gets
 * a fresh id so it never overwrites an existing project; its assets come with it.
 */
export async function importProjectFile(file: Blob): Promise<Project> {
  let contents;
  try {
    contents = await decodeProjectFile(await file.arrayBuffer());
  } catch (error) {
    if (error instanceof ProjectFileError) throw error;
    throw new ProjectFileError('This file could not be read.');
  }
  const parsed = migrate(contents.project);
  const project: Project = { ...parsed, id: createProject('').id, updatedAt: Date.now() };
  const assets: Record<string, unknown> = {};
  const underlay = asUnderlay(contents.assets.underlay);
  if (underlay) assets.underlay = underlay;
  if (contents.assets.pdf instanceof Blob) assets.pdf = contents.assets.pdf;
  await storage.saveProjectWithAssets(project, assets);
  return project;
}
