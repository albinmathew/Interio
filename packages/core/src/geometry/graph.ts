import type { Id, Level, Pt } from '../schema';
import { openingFrame } from './footprints';
import { deriveRooms, type RoomGeom } from './rooms';
import { add, dist, pointInPolygon, scale } from './vec';

export interface RoomGraph {
  nodes: { roomId: Id; centroid: Pt }[];
  /** A walkable connection between two rooms through a door, sliding door or passage. */
  edges: { a: Id; b: Id; openingId: Id; door: Pt }[];
  /** Doors that lead outside: the home's entrances. */
  entrances: { roomId: Id; openingId: Id; door: Pt }[];
}

export function roomGraph(level: Level): RoomGraph {
  const rooms = deriveRooms(level).filter((r): r is RoomGeom & { roomId: Id } => r.roomId !== null);
  const graph: RoomGraph = {
    nodes: rooms.map((r) => ({ roomId: r.roomId, centroid: r.centroid })),
    edges: [],
    entrances: [],
  };
  for (const o of Object.values(level.openings)) {
    if (o.kind === 'window') continue;
    const f = openingFrame(level, o.id);
    if (!f) continue;
    const reach = f.thickness / 2 + 150;
    const left = rooms.find((r) => pointInPolygon(add(f.center, scale(f.normal, reach)), r.polygon));
    const right = rooms.find((r) => pointInPolygon(add(f.center, scale(f.normal, -reach)), r.polygon));
    if (left && right && left.roomId !== right.roomId) {
      graph.edges.push({ a: left.roomId, b: right.roomId, openingId: o.id, door: f.center });
    } else if ((left || right) && !(left && right) && o.kind === 'door') {
      graph.entrances.push({ roomId: (left ?? right)!.roomId, openingId: o.id, door: f.center });
    }
  }
  return graph;
}

export interface TourStop {
  roomId: Id;
  /** Where the camera stands, plan mm. */
  eye: Pt;
  /** Where it looks. */
  lookAt: Pt;
  /** Waypoints from the previous stop to this one (door centres and room centres on the way). */
  via: Pt[];
}

function shortestPath(graph: RoomGraph, from: Id, to: Id): { room: Id; door: Pt }[] | null {
  const prev = new Map<Id, { room: Id; door: Pt } | null>([[from, null]]);
  const queue = [from];
  while (queue.length) {
    const cur = queue.shift()!;
    if (cur === to) break;
    for (const e of graph.edges) {
      const other = e.a === cur ? e.b : e.b === cur ? e.a : null;
      if (!other || prev.has(other)) continue;
      prev.set(other, { room: cur, door: e.door });
      queue.push(other);
    }
  }
  if (!prev.has(to)) return null;
  const steps: { room: Id; door: Pt }[] = [];
  for (let cur = to; ; ) {
    const p = prev.get(cur);
    if (!p) break;
    steps.unshift({ room: cur, door: p.door });
    cur = p.room;
  }
  return steps;
}

/**
 * A walk through every room: depth-first from the entrance (or `startRoomId`),
 * with door-to-door waypoints between consecutive stops. Rooms not reachable
 * through an opening are appended at the end with an empty `via` (a jump).
 */
export function tourPath(level: Level, startRoomId?: Id): TourStop[] {
  const graph = roomGraph(level);
  const rooms = new Map(deriveRooms(level).flatMap((r) => (r.roomId ? [[r.roomId, r] as const] : [])));
  if (graph.nodes.length === 0) return [];
  const start = startRoomId && rooms.has(startRoomId) ? startRoomId : (graph.entrances[0]?.roomId ?? graph.nodes[0]!.roomId);

  const order: Id[] = [];
  const seen = new Set<Id>();
  const visit = (id: Id) => {
    seen.add(id);
    order.push(id);
    const next = graph.edges
      .filter((e) => e.a === id || e.b === id)
      .map((e) => (e.a === id ? e.b : e.a))
      .filter((x) => !seen.has(x));
    for (const n of next) if (!seen.has(n)) visit(n);
  };
  visit(start);
  for (const n of graph.nodes) if (!seen.has(n.roomId)) visit(n.roomId);

  const centre = (id: Id) => rooms.get(id)!.centroid;
  return order.map((roomId, i) => {
    const geom = rooms.get(roomId)!;
    const eye = geom.centroid;
    const lookAt = geom.interior.reduce((far, p) => (dist(p, eye) > dist(far, eye) ? p : far), geom.interior[0] ?? eye);
    const via: Pt[] = [];
    if (i > 0) {
      const steps = shortestPath(graph, order[i - 1]!, roomId);
      steps?.forEach((s, k) => {
        via.push(s.door);
        if (k < steps.length - 1) via.push(centre(s.room));
      });
    }
    return { roomId, eye, lookAt, via };
  });
}
