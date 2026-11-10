/**
 * Browser side of the catalog render scripts. Bundled with esbuild and driven
 * from Node through Playwright (`window.interioRender`).
 */
import type { CatalogEntry, Item, Level } from '@interio/core';
import { planDegToWorldYaw, wallFootprints, deriveRooms } from '@interio/core';
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { buildParametric, fitToDims, getEntry } from '../../src/index';

export interface ThumbOptions {
  /** Output edge in px. */
  size: number;
  /** Camera azimuth from the front (+Z) towards +X, degrees. */
  azimuth?: number;
  /** Camera elevation above the horizon, degrees. */
  elevation?: number;
  /** Draw +X (red) and +Z front (blue) arrows. For checking source models. */
  axes?: boolean;
  mime?: 'image/webp' | 'image/png';
  background?: string;
}

const SUPERSAMPLE = 3;
const loader = new GLTFLoader();
const cache = new Map<string, Promise<THREE.Object3D>>();

function loadGlb(url: string): Promise<THREE.Object3D> {
  let p = cache.get(url);
  if (!p) {
    p = loader.loadAsync(url).then((gltf) => gltf.scene);
    cache.set(url, p);
  }
  return p.then((scene) => scene.clone(true));
}

async function entryObject(entry: CatalogEntry): Promise<THREE.Object3D> {
  if (entry.model.kind === 'parametric') return buildParametric(entry);
  return fitToDims(await loadGlb(entry.model.url), entry);
}

function prepare(object: THREE.Object3D): void {
  object.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    const transparent = mats.some((m) => m.transparent && m.opacity < 0.9);
    mesh.castShadow = !transparent;
    mesh.receiveShadow = true;
  });
}

class Studio {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly key: THREE.DirectionalLight;
  readonly ground: THREE.Mesh;
  readonly content = new THREE.Group();

  constructor() {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
    this.renderer.setPixelRatio(1);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.NeutralToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.setClearColor(0x000000, 0);

    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    this.scene.environmentIntensity = 0.55;

    this.scene.add(new THREE.HemisphereLight('#ffffff', '#c9c2b6', 0.9));
    this.key = new THREE.DirectionalLight('#fff6ea', 2.1);
    this.key.castShadow = true;
    this.key.shadow.mapSize.set(2048, 2048);
    this.key.shadow.bias = -0.0005;
    this.key.shadow.normalBias = 0.02;
    this.key.shadow.radius = 6;
    this.scene.add(this.key, this.key.target);
    const fill = new THREE.DirectionalLight('#e6efff', 0.55);
    fill.position.set(-4, 3, 5);
    this.scene.add(fill);

    this.ground = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.ShadowMaterial({ opacity: 0.22 }));
    this.ground.rotation.x = -Math.PI / 2;
    this.ground.receiveShadow = true;
    this.scene.add(this.ground, this.content);
  }

  /** Points the key light at a box and sizes its shadow frustum around it. */
  aimLight(box: THREE.Box3, direction = new THREE.Vector3(-0.55, 1, 0.75)): void {
    const centre = box.getCenter(new THREE.Vector3());
    const radius = Math.max(0.2, box.getSize(new THREE.Vector3()).length() / 2);
    this.key.target.position.copy(centre);
    this.key.position.copy(centre).addScaledVector(direction.clone().normalize(), radius * 4);
    const cam = this.key.shadow.camera;
    cam.left = -radius * 1.6;
    cam.right = radius * 1.6;
    cam.top = radius * 1.6;
    cam.bottom = -radius * 1.6;
    cam.near = radius * 0.5;
    cam.far = radius * 9;
    cam.updateProjectionMatrix();
    this.key.target.updateMatrixWorld();
  }

  frame(camera: THREE.PerspectiveCamera, box: THREE.Box3, azimuthDeg: number, elevationDeg: number, margin: number): void {
    const az = THREE.MathUtils.degToRad(azimuthDeg);
    const el = THREE.MathUtils.degToRad(elevationDeg);
    const dir = new THREE.Vector3(Math.sin(az) * Math.cos(el), Math.sin(el), Math.cos(az) * Math.cos(el));
    const centre = box.getCenter(new THREE.Vector3());
    const corners: THREE.Vector3[] = [];
    for (let i = 0; i < 8; i++)
      corners.push(new THREE.Vector3(i & 1 ? box.max.x : box.min.x, i & 2 ? box.max.y : box.min.y, i & 4 ? box.max.z : box.min.z));
    const target = centre.clone();
    const tanV = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
    const tanH = tanV * camera.aspect;
    // Start far enough away that every corner is in front of the camera, then
    // alternate between fitting the distance and re-centring on the projected bounds.
    let distance = box.getSize(new THREE.Vector3()).length() * 10 + 1;
    for (let pass = 0; pass < 4; pass++) {
      camera.position.copy(target).addScaledVector(dir, distance);
      camera.lookAt(target);
      camera.updateMatrixWorld(true);
      const inv = camera.matrixWorldInverse.copy(camera.matrixWorld).invert();
      let need = 0;
      let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
      for (const c of corners) {
        const p = c.clone().applyMatrix4(inv);
        const depth = -p.z;
        minX = Math.min(minX, p.x / depth);
        maxX = Math.max(maxX, p.x / depth);
        minY = Math.min(minY, p.y / depth);
        maxY = Math.max(maxY, p.y / depth);
        need = Math.max(need, distance - depth + Math.abs(p.x) / tanH, distance - depth + Math.abs(p.y) / tanV);
      }
      // Shift the target so the projected bounds are centred.
      const right = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 0);
      const up = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 1);
      target.addScaledVector(right, ((minX + maxX) / 2) * distance).addScaledVector(up, ((minY + maxY) / 2) * distance);
      distance = need * margin;
    }
    camera.position.copy(target).addScaledVector(dir, distance);
    camera.near = Math.max(0.01, distance / 50);
    camera.far = distance * 20;
    camera.lookAt(target);
    camera.updateProjectionMatrix();
  }

  render(width: number, height: number, camera: THREE.PerspectiveCamera): HTMLCanvasElement {
    this.renderer.setSize(width, height, false);
    this.renderer.render(this.scene, camera);
    return this.renderer.domElement;
  }

  clear(): void {
    this.content.clear();
  }
}

let studio: Studio | null = null;
const getStudio = (): Studio => (studio ??= new Studio());

function downscale(source: HTMLCanvasElement, width: number, height: number, background?: string): HTMLCanvasElement {
  const out = document.createElement('canvas');
  out.width = width;
  out.height = height;
  const ctx = out.getContext('2d')!;
  if (background) {
    ctx.fillStyle = background;
    ctx.fillRect(0, 0, width, height);
  }
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(source, 0, 0, width, height);
  return out;
}

function arrow(dir: THREE.Vector3, colour: number, length: number): THREE.Object3D {
  return new THREE.ArrowHelper(dir, new THREE.Vector3(0, 0.01, 0), length, colour, length * 0.25, length * 0.12);
}

function thumbnail(object: THREE.Object3D, opts: ThumbOptions): string {
  const s = getStudio();
  s.clear();
  prepare(object);
  s.content.add(object);
  object.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(object, true);
  if (opts.axes) {
    const size = box.getSize(new THREE.Vector3());
    const len = Math.max(size.x, size.z) * 0.75;
    const helpers = new THREE.Group();
    helpers.position.set((box.min.x + box.max.x) / 2, box.min.y, (box.min.z + box.max.z) / 2);
    helpers.add(arrow(new THREE.Vector3(1, 0, 0), 0xff2222, len), arrow(new THREE.Vector3(0, 0, 1), 0x2244ff, len));
    s.content.add(helpers);
    box.expandByObject(helpers);
  }
  const size = box.getSize(new THREE.Vector3());
  const reach = Math.max(size.x, size.y, size.z, 0.05);
  s.ground.position.set((box.min.x + box.max.x) / 2, box.min.y - 0.0005, (box.min.z + box.max.z) / 2);
  s.ground.scale.setScalar(reach * 6);
  s.ground.visible = true;
  s.aimLight(box);
  const camera = new THREE.PerspectiveCamera(22, 1, 0.01, 100);
  s.frame(camera, box, opts.azimuth ?? 32, opts.elevation ?? 24, 1.06);
  const px = opts.size * SUPERSAMPLE;
  const canvas = downscale(s.render(px, px, camera), opts.size, opts.size, opts.background);
  s.clear();
  return canvas.toDataURL(opts.mime ?? 'image/webp', 0.92);
}

async function thumbEntry(id: string, opts: ThumbOptions): Promise<string> {
  const entry = getEntry(id);
  if (!entry) throw new Error(`Unknown catalog entry ${id}`);
  return thumbnail(await entryObject(entry), opts);
}

async function thumbGlb(url: string, opts: ThumbOptions): Promise<string> {
  return thumbnail(await loadGlb(url), opts);
}

async function contactSheet(cells: { label: string; src: string }[], cols: number, cell: number, background = '#f3f1ec'): Promise<string> {
  const rows = Math.ceil(cells.length / cols);
  const labelH = 30;
  const canvas = document.createElement('canvas');
  canvas.width = cols * cell;
  canvas.height = rows * (cell + labelH);
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = background;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (let i = 0; i < cells.length; i++) {
    const c = cells[i]!;
    const x = (i % cols) * cell;
    const y = Math.floor(i / cols) * (cell + labelH);
    const img = new Image();
    img.src = c.src;
    await img.decode();
    ctx.drawImage(img, x + 4, y + 4, cell - 8, cell - 8);
    ctx.strokeStyle = '#d9d5cc';
    ctx.strokeRect(x + 0.5, y + 0.5, cell - 1, cell + labelH - 1);
    ctx.fillStyle = '#222';
    const lines = c.label.split('\n');
    ctx.font = `${lines.length > 1 ? 11 : 12}px -apple-system, Helvetica, Arial, sans-serif`;
    lines.forEach((line, k) => ctx.fillText(line, x + cell / 2, y + cell + labelH / 2 + (k - (lines.length - 1) / 2) * 12, cell - 6));
  }
  return canvas.toDataURL('image/png');
}

/* ------------------------------------------------------ furnished level */

export interface LevelRenderOptions {
  width: number;
  height: number;
  azimuth?: number;
  elevation?: number;
  /** Restrict the view to one room. */
  roomId?: string;
  /** Wall height cap in mm, so interiors stay visible. */
  wallHeight?: number;
}

const FLOOR_COLOURS: Record<string, string> = {
  bathroom: '#d9dee0',
  kitchen: '#d8d2c6',
  balcony: '#c9c5bd',
  utility: '#d5d5d2',
};

function extrude(outline: { x: number; y: number }[], height: number, material: THREE.Material, base = 0): THREE.Mesh {
  const shape = new THREE.Shape(outline.map((p) => new THREE.Vector2(p.x / 1000, p.y / 1000)));
  const geom = new THREE.ExtrudeGeometry(shape, { depth: height / 1000, bevelEnabled: false });
  // Shape lies in XY with extrusion along +Z: rotate so plan y maps to world -Z and height to +Y.
  geom.rotateX(-Math.PI / 2);
  const mesh = new THREE.Mesh(geom, material);
  mesh.position.y = base / 1000;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

async function renderLevel(level: Level, items: Omit<Item, 'id'>[], opts: LevelRenderOptions): Promise<string> {
  const s = getStudio();
  s.clear();
  const root = new THREE.Group();
  const rooms = deriveRooms(level);
  const wallMat = new THREE.MeshStandardMaterial({ color: '#f1eee8', roughness: 0.9 });
  const railMat = new THREE.MeshStandardMaterial({ color: '#8f989c', roughness: 0.6 });
  const cap = opts.wallHeight ?? 1100;
  for (const fp of wallFootprints(level)) {
    const wall = level.walls[fp.wallId];
    if (!wall) continue;
    root.add(extrude(fp.polygon, Math.min(wall.height, cap), wall.kind === 'railing' ? railMat : wallMat));
  }
  for (const room of rooms) {
    const type = room.roomId ? level.rooms[room.roomId]?.type : undefined;
    const mat = new THREE.MeshStandardMaterial({ color: FLOOR_COLOURS[type ?? ''] ?? '#d9c3a3', roughness: 0.85 });
    const floor = extrude(room.polygon, 20, mat, -20);
    floor.castShadow = false;
    root.add(floor);
  }
  // Openings: tint the floor strip so doors and windows read in the render.
  for (const o of Object.values(level.openings)) {
    const wall = level.walls[o.wallId];
    const a = wall && level.vertices[wall.a];
    const b = wall && level.vertices[wall.b];
    if (!wall || !a || !b) continue;
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    const dx = (b.x - a.x) / len;
    const dy = (b.y - a.y) / len;
    const cx = a.x + dx * o.offset;
    const cy = a.y + dy * o.offset;
    const isWindow = o.kind === 'window';
    const marker = new THREE.Mesh(
      new THREE.BoxGeometry(o.width / 1000, isWindow ? (o.height / 1000) * 0.2 : 0.03, (wall.thickness + 40) / 1000),
      new THREE.MeshStandardMaterial({ color: isWindow ? '#7fb6d9' : o.kind === 'passage' ? '#c8b89c' : '#a7714a', roughness: 0.5 }),
    );
    marker.position.set(cx / 1000, isWindow ? Math.min(o.sill, cap) / 1000 + 0.1 : Math.min(wall.height, cap) / 1000 + 0.015, -cy / 1000);
    marker.rotation.y = Math.atan2(dy, dx);
    root.add(marker);
  }
  for (const item of items) {
    const entry = getEntry(item.catalogId);
    if (!entry) continue;
    const obj = await entryObject(entry);
    const holder = new THREE.Group();
    holder.position.set(item.x / 1000, (item.z ?? 0) / 1000, -item.y / 1000);
    holder.rotation.y = planDegToWorldYaw(item.rotationDeg ?? 0);
    holder.add(obj);
    root.add(holder);
  }
  prepare(root);
  s.content.add(root);
  root.updateMatrixWorld(true);

  let box = new THREE.Box3().setFromObject(root);
  if (opts.roomId) {
    const room = rooms.find((r) => r.roomId === opts.roomId);
    if (room) {
      box = new THREE.Box3();
      for (const p of room.polygon) {
        box.expandByPoint(new THREE.Vector3(p.x / 1000, 0, -p.y / 1000));
        box.expandByPoint(new THREE.Vector3(p.x / 1000, cap / 1000, -p.y / 1000));
      }
    }
  }
  s.ground.visible = false;
  s.aimLight(new THREE.Box3().setFromObject(root), new THREE.Vector3(-0.5, 1.4, 0.6));
  const camera = new THREE.PerspectiveCamera(26, opts.width / opts.height, 0.05, 500);
  s.frame(camera, box, opts.azimuth ?? 20, opts.elevation ?? 55, 1.04);
  const canvas = downscale(s.render(opts.width * 2, opts.height * 2, camera), opts.width, opts.height, '#f6f4ef');
  s.clear();
  s.ground.visible = true;
  return canvas.toDataURL('image/png');
}

const api = { thumbEntry, thumbGlb, contactSheet, renderLevel };
export type RenderApi = typeof api;
(window as unknown as { interioRender: RenderApi }).interioRender = api;
