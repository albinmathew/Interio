// Untyped files of three-mesh-bvh used to run its BVH builder in our own worker (see bvhWorker.ts).
declare module 'three-mesh-bvh/src/workers/generateMeshBVH.worker.js';
declare module 'three-mesh-bvh/src/workers/utils/WorkerBase.js' {
  export class WorkerBase {
    constructor(worker: Worker);
    name: string;
    running: boolean;
    worker: Worker | null;
    runTask(worker: Worker, ...args: unknown[]): Promise<unknown>;
    generate(...args: unknown[]): Promise<unknown>;
    dispose(): void;
  }
}
