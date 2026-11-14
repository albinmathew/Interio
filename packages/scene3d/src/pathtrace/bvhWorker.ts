/** Builds the tracer's BVH off the main thread, so turning photo mode on never freezes the view. */
import type { BufferGeometry } from 'three';
import type { MeshBVH } from 'three-mesh-bvh';
import { GenerateMeshBVHWorker } from 'three-mesh-bvh/worker';

type RunTask = (worker: Worker, geometry: BufferGeometry, options?: object) => Promise<MeshBVH>;

// The task protocol (transfer, progress, deserialise) is three-mesh-bvh's own; only the worker differs.
const runTask = (GenerateMeshBVHWorker.prototype as unknown as { runTask: RunTask }).runTask;

/**
 * three-mesh-bvh's `GenerateMeshBVHWorker`, with the worker started from our own entry point
 * (`bvh.worker.ts`): the library creates it from a URL relative to its own file, which does
 * not survive Vite's dependency pre-bundling. Same `generate(geometry, options)` interface.
 */
export class BvhWorker {
  private worker: Worker | null;
  private running = false;

  constructor() {
    this.worker = new Worker(new URL('./bvh.worker.ts', import.meta.url), { type: 'module' });
    // A failed build is reported through the promise of `generate`, not as an uncaught error.
    this.worker.onerror = (e) => e.preventDefault();
  }

  generate(geometry: BufferGeometry, options?: object): Promise<MeshBVH> {
    if (!this.worker) return Promise.reject(new Error('BvhWorker: disposed'));
    if (this.running) return Promise.reject(new Error('BvhWorker: already building'));
    this.running = true;
    const task = runTask(this.worker, geometry, options);
    void task.finally(() => {
      this.running = false;
    }).catch(() => {});
    return task;
  }

  dispose(): void {
    this.worker?.terminate();
    this.worker = null;
  }
}
