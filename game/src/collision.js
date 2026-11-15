// Geometry queries the simulation needs, allocation-free: box overlap for
// movement, ray-vs-box for line of sight, and segment-vs-sphere for smoke.
import * as THREE from 'three';

const probe = new THREE.Box3();

// Does an upright box (feet at y, radius r, height h) overlap any collider?
// lift trims the tested span so standing on a floor is not a wall hit.
export function overlapsAny(colliders, x, y, z, radius, height, lift) {
  probe.min.set(x - radius, y + lift, z - radius);
  probe.max.set(x + radius, y + height - lift, z + radius);
  for (let i = 0; i < colliders.length; i += 1) {
    if (probe.intersectsBox(colliders[i])) return colliders[i];
  }
  return null;
}

// Slab test: does the ray (origin, dir) hit box before maxDist? Returns the
// distance or Infinity. dir must be normalized.
export function rayBoxDistance(origin, dir, box, maxDist) {
  let tmin = 0;
  let tmax = maxDist;
  const axes = ['x', 'y', 'z'];
  for (let i = 0; i < 3; i += 1) {
    const axis = axes[i];
    const d = dir[axis];
    const o = origin[axis];
    if (Math.abs(d) < 1e-9) {
      if (o < box.min[axis] || o > box.max[axis]) return Infinity;
    } else {
      const inv = 1 / d;
      let t0 = (box.min[axis] - o) * inv;
      let t1 = (box.max[axis] - o) * inv;
      if (t0 > t1) { const tmp = t0; t0 = t1; t1 = tmp; }
      if (t0 > tmin) tmin = t0;
      if (t1 < tmax) tmax = t1;
      if (tmin > tmax) return Infinity;
    }
  }
  return tmin;
}

const losDir = new THREE.Vector3();

// True when nothing solid stands between a and b. Smoke spheres block sight
// too: a bot cannot see through a smoke cloud.
export function hasLineOfSight(colliders, smokes, a, b) {
  losDir.subVectors(b, a);
  const dist = losDir.length();
  if (dist < 1e-6) return true;
  losDir.multiplyScalar(1 / dist);
  for (let i = 0; i < colliders.length; i += 1) {
    const hit = rayBoxDistance(a, losDir, colliders[i], dist);
    if (hit < dist) return false;
  }
  if (smokes) {
    for (let i = 0; i < smokes.length; i += 1) {
      if (segmentSphere(a, losDir, dist, smokes[i].pos, smokes[i].radius)) return false;
    }
  }
  return true;
}

// Does the segment origin + t*dir (t in [0, maxDist]) pass through the sphere?
export function segmentSphere(origin, dir, maxDist, center, radius) {
  const ox = center.x - origin.x;
  const oy = center.y - origin.y;
  const oz = center.z - origin.z;
  const tca = ox * dir.x + oy * dir.y + oz * dir.z;
  if (tca < 0 || tca > maxDist) return false;
  const d2 = ox * ox + oy * oy + oz * oz - tca * tca;
  return d2 < radius * radius;
}

const tmpDelta = new THREE.Vector3();

// Horizontal distance between two points, ignoring height.
export function flatDistance(a, b) {
  tmpDelta.subVectors(a, b);
  tmpDelta.y = 0;
  return tmpDelta.length();
}

// Yaw (radians, three.js YXZ convention) that looks from a toward b.
export function yawTo(a, b) {
  return Math.atan2(-(b.x - a.x), -(b.z - a.z));
}

// Index of the waypoint nearest to a point (horizontal distance).
export function nearestNode(pos, waypoints) {
  let best = 0;
  let bestDist = Infinity;
  for (let i = 0; i < waypoints.length; i += 1) {
    const dx = waypoints[i].x - pos.x;
    const dz = waypoints[i].z - pos.z;
    const d = dx * dx + dz * dz;
    if (d < bestDist) { bestDist = d; best = i; }
  }
  return best;
}

// Breadth-first shortest path over the waypoint graph. Returns node indices
// from start to goal inclusive, or null when no route exists.
export function findPath(start, goal, adjacency) {
  if (start === goal) return [start];
  const prev = new Int32Array(adjacency.length).fill(-1);
  const queue = [start];
  prev[start] = start;
  for (let head = 0; head < queue.length; head += 1) {
    const node = queue[head];
    for (const next of adjacency[node]) {
      if (prev[next] !== -1) continue;
      prev[next] = node;
      if (next === goal) {
        const path = [goal];
        let cur = goal;
        while (cur !== start) {
          cur = prev[cur];
          path.push(cur);
        }
        path.reverse();
        return path;
      }
      queue.push(next);
    }
  }
  return null;
}
