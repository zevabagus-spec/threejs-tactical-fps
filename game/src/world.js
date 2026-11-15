// MERIDIAN DEPOT, Sector 7: an original three-lane map built from boxes,
// cylinders and canvas-painted textures. No models, no image files: every
// surface is procedural. This module owns the static geometry, the lights,
// the waypoint graph the bots navigate, the bomb sites and the spawns.
//
//   north (-z) ── DEF spawn (NE) · Site A (NW) · A-lane (west) · B-lane (east)
//   mid corridor through the depot buildings · Site B (SE) · ATK spawn (SW)
import * as THREE from 'three';
import { PALETTE } from './config.js';
import { mulberry32 } from './state.js';

const rng = mulberry32(1337);

function canvasTex(size, draw, rx = 1, ry = 1) {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  draw(canvas.getContext('2d'), size);
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(rx, ry);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

function speckle(ctx, size, base, flecks, count, maxR) {
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, size, size);
  for (let i = 0; i < count; i += 1) {
    ctx.fillStyle = flecks[Math.floor(rng() * flecks.length)];
    ctx.globalAlpha = 0.12 + rng() * 0.25;
    const r = 1 + rng() * maxR;
    ctx.beginPath();
    ctx.arc(rng() * size, rng() * size, r, 0, 7);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

function makeTextures() {
  const ground = canvasTex(512, (ctx, s) => {
    speckle(ctx, s, '#8a7d6b', ['#7a6e5e', '#96897a', '#6e6355'], 2600, 7);
    ctx.strokeStyle = 'rgba(40,34,26,0.55)';
    ctx.lineWidth = 3;
    for (let i = 0; i <= 4; i += 1) {
      ctx.beginPath(); ctx.moveTo((i * s) / 4, 0); ctx.lineTo((i * s) / 4, s); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, (i * s) / 4); ctx.lineTo(s, (i * s) / 4); ctx.stroke();
    }
    for (let i = 0; i < 14; i += 1) {
      ctx.fillStyle = 'rgba(30,26,20,0.16)';
      ctx.beginPath();
      ctx.ellipse(rng() * s, rng() * s, 20 + rng() * 60, 12 + rng() * 40, rng() * 3, 0, 7);
      ctx.fill();
    }
  }, 10, 8);
  const concrete = canvasTex(256, (ctx, s) => {
    speckle(ctx, s, '#9a938a', ['#8a837a', '#a89f94', '#7d766c'], 1500, 4);
    ctx.strokeStyle = 'rgba(60,54,46,0.35)';
    ctx.lineWidth = 2;
    ctx.strokeRect(4, 4, s - 8, s - 8);
  }, 2, 2);
  const sand = canvasTex(256, (ctx, s) => {
    speckle(ctx, s, '#a89880', ['#97866e', '#b5a78d', '#8a7a62'], 1400, 5);
    ctx.fillStyle = 'rgba(70,60,44,0.25)';
    for (let y = 0; y < 4; y += 1) ctx.fillRect(0, y * 64 + 30, s, 3);
  }, 3, 2);
  const metal = canvasTex(256, (ctx, s) => {
    speckle(ctx, s, '#6f7a7d', ['#5f696c', '#7f8a8d'], 500, 3);
    for (let x = 0; x < s; x += 16) {
      ctx.fillStyle = 'rgba(20,24,26,0.4)';
      ctx.fillRect(x, 0, 3, s);
      ctx.fillStyle = 'rgba(255,255,255,0.08)';
      ctx.fillRect(x + 3, 0, 2, s);
    }
  }, 2, 1);
  const rustMetal = canvasTex(256, (ctx, s) => {
    speckle(ctx, s, '#b4622d', ['#9a5224', '#c67436', '#7e4218'], 900, 6);
    for (let x = 0; x < s; x += 16) {
      ctx.fillStyle = 'rgba(40,18,6,0.45)';
      ctx.fillRect(x, 0, 3, s);
    }
  }, 2, 1);
  const tealMetal = canvasTex(256, (ctx, s) => {
    speckle(ctx, s, '#3e7d7a', ['#356b68', '#4a8d89', '#2c5a57'], 900, 6);
    for (let x = 0; x < s; x += 16) {
      ctx.fillStyle = 'rgba(8,26,24,0.45)';
      ctx.fillRect(x, 0, 3, s);
    }
  }, 2, 1);
  const wood = canvasTex(256, (ctx, s) => {
    speckle(ctx, s, '#7d6248', ['#6d5339', '#8d7054'], 600, 3);
    ctx.strokeStyle = 'rgba(40,28,14,0.6)';
    ctx.lineWidth = 3;
    for (let y = 0; y <= 4; y += 1) {
      ctx.beginPath(); ctx.moveTo(0, (y * s) / 4); ctx.lineTo(s, (y * s) / 4); ctx.stroke();
    }
    ctx.strokeStyle = 'rgba(40,28,14,0.3)';
    ctx.lineWidth = 1;
    for (let i = 0; i < 26; i += 1) {
      const y = rng() * s;
      ctx.beginPath(); ctx.moveTo(rng() * s, y); ctx.lineTo(rng() * s, y + 2); ctx.stroke();
    }
  }, 1, 1);
  const hazard = canvasTex(128, (ctx, s) => {
    ctx.fillStyle = '#d8a722';
    ctx.fillRect(0, 0, s, s);
    ctx.fillStyle = '#1c1a17';
    for (let x = -s; x < s * 2; x += 32) {
      ctx.beginPath();
      ctx.moveTo(x, s); ctx.lineTo(x + 16, s); ctx.lineTo(x + 16 + s, 0); ctx.lineTo(x + s, 0);
      ctx.closePath(); ctx.fill();
    }
  }, 4, 1);
  const dark = canvasTex(256, (ctx, s) => {
    speckle(ctx, s, '#5d564c', ['#524b42', '#6a6257'], 900, 4);
  }, 2, 2);
  return { ground, concrete, sand, metal, rustMetal, tealMetal, wood, hazard, dark };
}

function letterTexture(letter, color) {
  return canvasTex(256, (ctx, s) => {
    ctx.clearRect(0, 0, s, s);
    ctx.fillStyle = color;
    ctx.font = 'bold 190px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(letter, s / 2, s / 2 + 8);
  });
}

function signTexture(text, sub) {
  return canvasTex(512, (ctx, s) => {
    ctx.fillStyle = '#2a2723';
    ctx.fillRect(0, 0, s, s);
    ctx.fillStyle = '#e8e2d4';
    ctx.font = 'bold 64px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(text, s / 2, s / 2 - 8);
    ctx.fillStyle = '#f0a830';
    ctx.font = 'bold 34px system-ui, sans-serif';
    ctx.fillText(sub, s / 2, s / 2 + 52);
    ctx.strokeStyle = '#f0a830';
    ctx.lineWidth = 6;
    ctx.strokeRect(14, 14, s - 28, s - 28);
  });
}

// Waypoint graph: nodes on walkable ground, edges with clear sightlines.
// Bots run BFS over it; every edge was checked against the walls below.
const WAYPOINTS = [
  [-25, 16], [-22, 18.5], [-24, 8], [-25, 0], [-24, -6], [-20, -9],
  [-18, -13], [-23, -16], [-26, -13], [-16, -18], [-8, -9], [-1, 9],
  [0, 4], [0, -4], [1, -10], [8, 11], [13, 11], [18, 14],
  [23, 16], [26, 13], [16, 18], [22, 6], [25, 0], [24, -6],
  [21, -10], [16, -13], [25, -16], [22, -18], [-13, -10], [-21, 11],
  [-9, -15], [9, 15],
];
const EDGES = [
  [0, 1], [0, 2], [1, 29], [2, 3], [2, 29], [3, 4], [4, 5], [5, 6], [5, 28],
  [6, 7], [6, 8], [7, 8], [9, 30], [28, 10], [30, 10], [10, 14],
  [14, 13], [13, 12], [12, 11], [11, 15], [11, 29], [15, 16],
  [15, 31], [16, 31], [16, 21], [31, 17], [17, 18], [17, 19], [17, 20],
  [18, 19], [21, 22], [22, 23], [23, 24], [24, 25], [24, 26], [25, 27],
  [25, 14], [26, 27], [27, 9],
];

export const SITES = {
  A: {
    letter: 'A', color: PALETTE.siteA,
    rect: { minX: -28, maxX: -13, minZ: -21, maxZ: -10 },
    center: new THREE.Vector3(-20.5, 0, -15.5),
    plantSpots: [[-21, -15], [-24, -17], [-18, -16]],
    holdSpots: [[-26, -13], [-23, -16], [-16, -18], [-20, -9]],
  },
  B: {
    letter: 'B', color: PALETTE.siteB,
    rect: { minX: 13, maxX: 28, minZ: 10, maxZ: 21 },
    center: new THREE.Vector3(20.5, 0, 15.5),
    plantSpots: [[21, 15], [24, 17], [18, 16]],
    holdSpots: [[26, 13], [23, 16], [16, 18], [20, 9]],
  },
};

export const SPAWNS = {
  attack: [[-26, 17], [-23, 18.5], [-27, 14], [-21, 16], [-24, 13.5]],
  defend: [[26, -17], [23, -18.5], [27, -14], [21, -16], [24, -13.5]],
};

export function createWorld(scene) {
  const tex = makeTextures();
  const group = new THREE.Group();
  scene.add(group);
  const mat = (map, roughness = 0.9, metalness = 0.04) => new THREE.MeshStandardMaterial({ map, roughness, metalness });
  const materials = {
    ground: mat(tex.ground, 0.96),
    concrete: mat(tex.concrete, 0.94),
    sand: mat(tex.sand, 0.95),
    dark: mat(tex.dark, 0.9),
    metal: mat(tex.metal, 0.6, 0.35),
    rust: mat(tex.rustMetal, 0.7, 0.25),
    teal: mat(tex.tealMetal, 0.7, 0.25),
    wood: mat(tex.wood, 0.85),
    hazard: mat(tex.hazard, 0.8),
    flat: new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.darkWall), roughness: 0.9 }),
    barrelRed: new THREE.MeshStandardMaterial({ map: tex.rustMetal, color: new THREE.Color('#b0503c'), roughness: 0.7, metalness: 0.2 }),
    skyline: new THREE.MeshBasicMaterial({ color: new THREE.Color('#1a222c') }),
  };

  const colliders = [];
  const shootables = [];
  const footprints = [];
  const boxGeo = new THREE.BoxGeometry(1, 1, 1);
  const cylGeoCache = new Map();

  function cylGeo(r, h) {
    const key = `${r}:${h}`;
    if (!cylGeoCache.has(key)) cylGeoCache.set(key, new THREE.CylinderGeometry(r, r, h, 18));
    return cylGeoCache.get(key);
  }

  function box(w, h, d, x, y, z, material, solid = true) {
    const mesh = new THREE.Mesh(boxGeo, materials[material]);
    mesh.scale.set(w, h, d);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
    if (solid) {
      const half = new THREE.Vector3(w / 2, h / 2, d / 2);
      colliders.push(new THREE.Box3(new THREE.Vector3(x, y, z).sub(half), new THREE.Vector3(x, y, z).add(half)));
      shootables.push(mesh);
      footprints.push([x - w / 2, z - d / 2, w, d]);
    }
    return mesh;
  }

  function cylinder(r, h, x, y, z, material, solid = true) {
    const mesh = new THREE.Mesh(cylGeo(r, h), materials[material]);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
    if (solid) {
      colliders.push(new THREE.Box3(new THREE.Vector3(x - r, y - h / 2, z - r), new THREE.Vector3(x + r, y + h / 2, z + r)));
      shootables.push(mesh);
      footprints.push([x - r, z - r, r * 2, r * 2]);
    }
    return mesh;
  }

  // Ground: one slab under everything, its top at y=0.
  box(160, 0.4, 160, 0, -0.2, 0, 'ground');
  colliders.pop();
  footprints.pop();
  // The playable floor is a separate thin slab so the ground plane's collider
  // does not swallow the map edges; it doubles as the floor collider.
  box(62, 0.2, 46, 0, -0.1, 0, 'concrete');

  // Perimeter walls.
  box(62, 5, 1, 0, 2.5, -22.5, 'sand');
  box(62, 5, 1, 0, 2.5, 22.5, 'sand');
  box(1, 5, 46, -30.5, 2.5, 0, 'sand');
  box(1, 5, 46, 30.5, 2.5, 0, 'sand');
  box(62, 0.3, 1.4, 0, 5.1, -22.5, 'dark');
  box(62, 0.3, 1.4, 0, 5.1, 22.5, 'dark');

  // The depot buildings: two solid blocks with the mid corridor between them.
  box(9, 4.5, 14, -7.5, 2.25, 0, 'concrete');
  box(9, 4.5, 14, 7.5, 2.25, 0, 'concrete');
  box(9.6, 0.3, 14.6, -7.5, 4.6, 0, 'dark');
  box(9.6, 0.3, 14.6, 7.5, 4.6, 0, 'dark');
  // Mid door wall with a single gap; corridor mouth stubs.
  box(2.2, 4.5, 0.6, -1.9, 2.25, 0, 'sand');
  box(2.2, 4.5, 0.6, 1.9, 2.25, 0, 'sand');
  box(0.6, 4.5, 2, -3, 2.25, -8, 'sand');
  box(0.6, 4.5, 2, 3, 2.25, -8, 'sand');
  box(0.6, 4.5, 2, -3, 2.25, 8, 'sand');
  box(0.6, 4.5, 2, 3, 2.25, 8, 'sand');
  box(1.8, 0.5, 0.7, 0, 4.2, 0, 'hazard');

  // Corner walls shaping the site approaches.
  box(6, 4.5, 0.6, -15, 2.25, -13.5, 'sand');
  box(6, 4.5, 0.6, 15, 2.25, 13.5, 'sand');
  box(0.6, 4.5, 5, -18, 2.25, 7, 'sand');
  box(0.6, 4.5, 5, 18, 2.25, -7, 'sand');

  // B-lane covered tunnel: roof slab on four pillars.
  box(8, 0.4, 8, 24, 3.4, 2, 'dark');
  for (const [px, pz] of [[20.5, -1.5], [27.5, -1.5], [20.5, 5.5], [27.5, 5.5]]) box(0.5, 3.2, 0.5, px, 1.6, pz, 'concrete');
  // B site canopy.
  box(10, 0.4, 6, 21, 3.6, 15, 'dark');
  for (const [px, pz] of [[16.5, 12.5], [25.5, 12.5], [16.5, 17.5], [25.5, 17.5]]) box(0.5, 3.4, 0.5, px, 1.7, pz, 'concrete');

  // Containers: the long sightline blockers on each lane and at mid.
  box(2.4, 2.6, 6, -27, 1.3, -3, 'rust');
  box(2.4, 2.6, 6, 27, 1.3, 3, 'teal');
  box(6, 2.6, 2.4, 0, 1.3, -13.5, 'teal');
  box(6, 2.6, 2.4, 0, 1.3, 13.5, 'rust');

  // Crates: 1.1 m cover you can jump on, tall crates that block sight.
  const crates = [
    [-1.6, -3.5, 1.1], [2, 5.5, 1.1], [-24, -11.5, 1.1], [24, 11.5, 1.1],
    [-23, 4, 1.1], [-26, -3, 1.1], [23, -4, 1.1], [26, 3, 1.1],
    [9, -14.5, 1.1], [-9, 14.5, 1.1], [14, -15, 1.1], [-14, 15, 1.1],
    [-26, -17, 1.1], [26, 17, 1.1],
  ];
  for (const [x, z, s] of crates) box(s, s, s, x, s / 2, z, 'wood');
  box(1.1, 1.1, 2.4, -21, 0.55, -18, 'wood');
  box(1.1, 1.1, 2.4, 21, 0.55, 18, 'wood');
  box(1.1, 1.1, 2.4, -26, 0.55, 8, 'wood');
  box(1.1, 1.1, 2.4, 26, 0.55, -8, 'wood');
  box(1.1, 2.2, 1.1, -20, 1.1, -16.5, 'wood');
  box(1.1, 2.2, 1.1, 20, 1.1, 16.5, 'wood');
  // Crate stacks at the sites.
  box(1.1, 1.1, 1.1, -26, 0.55, -17, 'wood');
  box(1.1, 1.1, 1.1, -26, 1.65, -17, 'wood');
  box(1.1, 1.1, 1.1, 26, 0.55, 17, 'wood');
  box(1.1, 1.1, 1.1, 26, 1.65, 17, 'wood');

  // Barrels and the two silos.
  for (const [x, z] of [[-27, 10], [-26.2, 10.8], [27, -10], [26.2, -10.8], [5, 12], [5.8, 12.6], [-5, -12], [-5.8, -12.6]]) {
    cylinder(0.35, 0.95, x, 0.48, z, 'barrelRed');
  }
  cylinder(2.0, 6, -26.5, 3, -18.5, 'metal');
  cylinder(2.2, 0.5, -26.5, 6.2, -18.5, 'dark');
  cylinder(2.0, 6, 26.5, 3, 18.5, 'metal');
  cylinder(2.2, 0.5, 26.5, 6.2, 18.5, 'dark');

  // Site pads, letter decals and marker rings.
  const ringGeo = new THREE.RingGeometry(3.1, 3.5, 40);
  for (const key of ['A', 'B']) {
    const site = SITES[key];
    const pad = new THREE.Mesh(new THREE.PlaneGeometry(site.rect.maxX - site.rect.minX, site.rect.maxZ - site.rect.minZ),
      new THREE.MeshStandardMaterial({ color: new THREE.Color('#7d7466'), roughness: 1 }));
    pad.rotation.x = -Math.PI / 2;
    pad.position.set(site.center.x, 0.03, site.center.z);
    pad.receiveShadow = true;
    group.add(pad);
    const decal = new THREE.Mesh(new THREE.PlaneGeometry(4.5, 4.5),
      new THREE.MeshBasicMaterial({ map: letterTexture(key, site.color), transparent: true, opacity: 0.85, depthWrite: false }));
    decal.rotation.x = -Math.PI / 2;
    decal.position.set(site.center.x, 0.06, site.center.z);
    group.add(decal);
    const ring = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: new THREE.Color(site.color), transparent: true, opacity: 0.5, side: THREE.DoubleSide }));
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(site.center.x, 0.07, site.center.z);
    group.add(ring);
  }

  // Painted signage on the depot buildings.
  const signMat = new THREE.MeshBasicMaterial({ map: signTexture('MERIDIAN DEPOT', 'SECTOR 7 · FREIGHT YARD') });
  const sign1 = new THREE.Mesh(new THREE.PlaneGeometry(7, 1.75), signMat);
  sign1.position.set(-7.5, 3.4, 7.06);
  group.add(sign1);
  const sign2 = new THREE.Mesh(new THREE.PlaneGeometry(7, 1.75), signMat);
  sign2.position.set(7.5, 3.4, -7.06);
  sign2.rotation.y = Math.PI;
  group.add(sign2);

  // Distant skyline silhouettes for depth, outside the walls.
  const skylineSpots = [
    [-52, -30, 10, 18], [-38, -44, 14, 26], [-18, -52, 12, 15], [4, -48, 16, 30],
    [26, -46, 12, 20], [46, -34, 10, 24], [54, -8, 12, 16], [52, 18, 10, 22],
    [40, 42, 14, 18], [14, 50, 12, 26], [-12, 48, 16, 20], [-36, 42, 12, 28],
    [-54, 14, 10, 18], [-50, -12, 12, 22],
  ];
  for (const [x, z, w, h] of skylineSpots) {
    const mesh = new THREE.Mesh(boxGeo, materials.skyline);
    mesh.scale.set(w, h, w);
    mesh.position.set(x, h / 2 - 0.5, z);
    group.add(mesh);
  }

  // A low dusk sun: a glowing disc on the horizon plus its light.
  const sun = new THREE.Mesh(new THREE.CircleGeometry(6, 32),
    new THREE.MeshBasicMaterial({ color: new THREE.Color('#ffb45c'), fog: false }));
  sun.position.set(-70, 14, 40);
  sun.lookAt(0, 2, 0);
  group.add(sun);
  const glow = new THREE.Mesh(new THREE.CircleGeometry(13, 32),
    new THREE.MeshBasicMaterial({ color: new THREE.Color('#ff8c3a'), transparent: true, opacity: 0.22, fog: false }));
  glow.position.set(-71, 14, 41);
  glow.lookAt(0, 2, 0);
  group.add(glow);

  // Light: warm low key, cool fill, sky/ground gradient.
  const hemi = new THREE.HemisphereLight(new THREE.Color('#7d94ad'), new THREE.Color('#4a4238'), 0.95);
  scene.add(hemi);
  const key = new THREE.DirectionalLight(new THREE.Color('#ffd9a0'), 2.3);
  key.position.set(-38, 26, 22);
  key.target.position.set(0, 0, 0);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.camera.left = -36;
  key.shadow.camera.right = 36;
  key.shadow.camera.top = 36;
  key.shadow.camera.bottom = -36;
  key.shadow.camera.far = 110;
  key.shadow.bias = -0.0006;
  scene.add(key, key.target);
  const fill = new THREE.DirectionalLight(new THREE.Color('#6a86a8'), 0.5);
  fill.position.set(30, 18, -26);
  scene.add(fill);
  const siteLightA = new THREE.PointLight(new THREE.Color(PALETTE.siteA), 12, 18, 1.8);
  siteLightA.position.set(SITES.A.center.x, 4.4, SITES.A.center.z);
  scene.add(siteLightA);
  const siteLightB = new THREE.PointLight(new THREE.Color(PALETTE.siteB), 12, 18, 1.8);
  siteLightB.position.set(SITES.B.center.x, 4.4, SITES.B.center.z);
  scene.add(siteLightB);

  const adjacency = WAYPOINTS.map(() => []);
  for (const [a, b] of EDGES) {
    adjacency[a].push(b);
    adjacency[b].push(a);
  }

  return {
    colliders,
    shootables,
    footprints,
    waypoints: WAYPOINTS.map(([x, z]) => new THREE.Vector3(x, 0, z)),
    adjacency,
    sites: SITES,
    spawns: SPAWNS,
    group,
  };
}
