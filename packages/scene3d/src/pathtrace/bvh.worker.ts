/// <reference path="./modules.d.ts" />
/**
 * The BVH build worker. three-mesh-bvh ships this worker, but it creates it from a URL
 * relative to its own file, which does not survive Vite's dependency pre-bundling; this
 * entry point lives in our source, so Vite bundles it as a worker in dev and in builds.
 */
import 'three-mesh-bvh/src/workers/generateMeshBVH.worker.js';
