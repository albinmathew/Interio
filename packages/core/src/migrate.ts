import { ProjectSchema, SCHEMA_VERSION, type Level, type Project } from './schema';
import { emptyLevel, newId } from './ops';

/** Parses and upgrades a stored or imported project. Throws with a readable message when it is not one. */
export function migrate(json: unknown): Project {
  if (!json || typeof json !== 'object') throw new Error('Not an Interio project file');
  const version = (json as { schema?: unknown }).schema;
  if (version !== SCHEMA_VERSION) throw new Error(`Unsupported project version: ${String(version)}`);
  const parsed = ProjectSchema.safeParse(json);
  if (!parsed.success) throw new Error(`Invalid project file: ${parsed.error.issues[0]?.message ?? 'unknown error'}`);
  return parsed.data;
}

export function serializeProject(project: Project): string {
  return JSON.stringify(project);
}

export function createProject(name: string, level?: Level): Project {
  const now = Date.now();
  return {
    schema: SCHEMA_VERSION,
    id: newId('p'),
    name,
    createdAt: now,
    updatedAt: now,
    levels: [level ?? emptyLevel()],
    settings: {},
  };
}
