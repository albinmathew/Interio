/// <reference path="./modules.d.ts" />
/** Builds the tracer's BVH off the main thread, so turning photo mode on never freezes the view. */
import type { BufferGeometry } from 'three';
import type { MeshBVH } from 'three-mesh-bvh';
import { GenerateMeshBVHWorker } from 'three-mesh-bvh/worker';
import { WorkerBase } from 'three-mesh-bvh/src/workers/utils/WorkerBase.js';

export class BvhWorker extends WorkerBase {
  constructor() {
    super(new Worker(new URL('./bvh.worker.ts', import.meta.url), { type: 'module' }));
    this.name = 'BvhWorker';
    // WorkerBase throws from its error handler, which would surface as an uncaught error; a failed
    // build is reported through the promise of `generate` instead.
    this.worker!.onerror = (e) => e.preventDefault();
  }

  override generate(geometry: BufferGeometry, options?: object): Promise<MeshBVH> {
    return super.generate(geometry, options) as Promise<MeshBVH>;
  }
}

// The task protocol (transfer, progress, deserialise) is three-mesh-bvh's own.
BvhWorker.prototype.runTask = (GenerateMeshBVHWorker.prototype as unknown as WorkerBase).runTask;
