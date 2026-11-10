/**
 * Local-first persistence on IndexedDB. Projects are plain JSON; assets
 * (source PDF, vector underlay) are stored next to them under `<projectId>/<name>`.
 * Everything goes through this module so a cloud backend can replace it later.
 */
import { migrate, type Project } from '@interio/core';
import { openDB, type IDBPDatabase } from 'idb';

export interface ProjectMeta {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
}

let dbPromise: Promise<IDBPDatabase> | null = null;

function db(): Promise<IDBPDatabase> {
  dbPromise ??= openDB('interio', 1, {
    upgrade(database) {
      database.createObjectStore('projects', { keyPath: 'id' });
      database.createObjectStore('assets');
    },
  });
  return dbPromise;
}

export const storage = {
  async listProjects(): Promise<Project[]> {
    const all = (await (await db()).getAll('projects')) as unknown[];
    const projects: Project[] = [];
    for (const raw of all) {
      try {
        projects.push(migrate(raw));
      } catch {
        // Skip records this version cannot read rather than break the dashboard.
      }
    }
    return projects.sort((a, b) => b.updatedAt - a.updatedAt);
  },

  async getProject(id: string): Promise<Project | null> {
    const raw = await (await db()).get('projects', id);
    return raw ? migrate(raw) : null;
  },

  async saveProject(project: Project): Promise<void> {
    await (await db()).put('projects', project);
  },

  async deleteProject(id: string): Promise<void> {
    const database = await db();
    const tx = database.transaction(['projects', 'assets'], 'readwrite');
    await tx.objectStore('projects').delete(id);
    const assets = tx.objectStore('assets');
    for (const key of await assets.getAllKeys()) {
      if (typeof key === 'string' && key.startsWith(`${id}/`)) await assets.delete(key);
    }
    await tx.done;
  },

  /** Stores any structured-cloneable value (Blob, typed arrays, plain objects). */
  async putAsset(projectId: string, name: string, value: unknown): Promise<void> {
    await (await db()).put('assets', value, `${projectId}/${name}`);
  },

  async getAsset<T>(projectId: string, name: string): Promise<T | null> {
    return ((await (await db()).get('assets', `${projectId}/${name}`)) as T | undefined) ?? null;
  },

  /** Every asset of a project, keyed by asset name. */
  async getAssets(projectId: string): Promise<Record<string, unknown>> {
    const database = await db();
    const prefix = `${projectId}/`;
    const range = IDBKeyRange.bound(prefix, `${prefix}\uffff`);
    const [keys, values] = await Promise.all([database.getAllKeys('assets', range), database.getAll('assets', range)]);
    const assets: Record<string, unknown> = {};
    keys.forEach((key, i) => {
      if (typeof key === 'string') assets[key.slice(prefix.length)] = values[i];
    });
    return assets;
  },

  /** Stores a project together with its assets in one transaction, so a failed write leaves nothing half-saved. */
  async saveProjectWithAssets(project: Project, assets: Record<string, unknown>): Promise<void> {
    const tx = (await db()).transaction(['projects', 'assets'], 'readwrite');
    const writes: Promise<unknown>[] = [tx.objectStore('projects').put(project)];
    for (const [name, value] of Object.entries(assets)) writes.push(tx.objectStore('assets').put(value, `${project.id}/${name}`));
    await Promise.all([...writes, tx.done]);
  },
};
