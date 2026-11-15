// Pooled visual effects: one Points cloud for particles, one LineSegments
// pool for tracers, sprite pools for smoke and muzzle flashes. Nothing is
// allocated per frame; dead slots are reused. The simulation spawns effects,
// the render step fades them.
import * as THREE from 'three';

const MAX_PARTICLES = 700;
const MAX_TRACERS = 28;
const MAX_SMOKE_SPRITES = 90;

function softCircleTexture(inner, outer) {
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 64;
  const ctx = canvas.getContext('2d');
  const grad = ctx.createRadialGradient(32, 32, 2, 32, 32, 30);
  grad.addColorStop(0, inner);
  grad.addColorStop(1, outer);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 64, 64);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function createEffects(scene, camera) {
  // Particles: positions + velocities + life in flat arrays, drawn as Points.
  const pGeo = new THREE.BufferGeometry();
  const pPos = new Float32Array(MAX_PARTICLES * 3);
  const pCol = new Float32Array(MAX_PARTICLES * 3);
  const pVel = new Float32Array(MAX_PARTICLES * 3);
  const pLife = new Float32Array(MAX_PARTICLES);
  const pMaxLife = new Float32Array(MAX_PARTICLES);
  const pGrav = new Float32Array(MAX_PARTICLES);
  pGeo.setAttribute('position', new THREE.BufferAttribute(pPos, 3));
  pGeo.setAttribute('color', new THREE.BufferAttribute(pCol, 3));
  const pMat = new THREE.PointsMaterial({ size: 0.09, vertexColors: true, transparent: true, opacity: 0.95, depthWrite: false, sizeAttenuation: true });
  const points = new THREE.Points(pGeo, pMat);
  points.frustumCulled = false;
  scene.add(points);
  let pCursor = 0;
  const tmpColor = new THREE.Color();

  function spawnParticle(x, y, z, vx, vy, vz, life, color, gravity) {
    const i = pCursor;
    pCursor = (pCursor + 1) % MAX_PARTICLES;
    pPos[i * 3] = x; pPos[i * 3 + 1] = y; pPos[i * 3 + 2] = z;
    pVel[i * 3] = vx; pVel[i * 3 + 1] = vy; pVel[i * 3 + 2] = vz;
    tmpColor.set(color);
    pCol[i * 3] = tmpColor.r; pCol[i * 3 + 1] = tmpColor.g; pCol[i * 3 + 2] = tmpColor.b;
    pLife[i] = life;
    pMaxLife[i] = life;
    pGrav[i] = gravity;
  }

  // Tracers: one LineSegments with a fixed segment pool, per-segment alpha
  // faked by moving dead segments to a degenerate point under the floor.
  const tGeo = new THREE.BufferGeometry();
  const tPos = new Float32Array(MAX_TRACERS * 6);
  const tLife = new Float32Array(MAX_TRACERS);
  for (let i = 0; i < MAX_TRACERS; i += 1) {
    tPos[i * 6 + 1] = -50; tPos[i * 6 + 4] = -50;
  }
  tGeo.setAttribute('position', new THREE.BufferAttribute(tPos, 3));
  const tracers = new THREE.LineSegments(tGeo, new THREE.LineBasicMaterial({ color: 0xffe6a8, transparent: true, opacity: 0.75 }));
  tracers.frustumCulled = false;
  scene.add(tracers);
  let tCursor = 0;

  // Smoke sprites: billboards that grow, drift and fade.
  const smokeTex = softCircleTexture('rgba(210,210,205,0.85)', 'rgba(200,200,195,0)');
  const smokePool = [];
  for (let i = 0; i < MAX_SMOKE_SPRITES; i += 1) {
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: smokeTex, transparent: true, opacity: 0, depthWrite: false }));
    sprite.visible = false;
    scene.add(sprite);
    smokePool.push({ sprite, life: 0, maxLife: 1, grow: 0, vx: 0, vy: 0, vz: 0, base: 1 });
  }
  let sCursor = 0;

  // Muzzle flash: a sprite + one reusable point light on the camera.
  const flashTex = softCircleTexture('rgba(255,220,140,1)', 'rgba(255,140,40,0)');
  const flashSprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: flashTex, transparent: true, opacity: 0, depthWrite: false }));
  flashSprite.scale.set(0.4, 0.4, 1);
  flashSprite.position.set(0.26, -0.17, -0.8);
  camera.add(flashSprite);
  const flashLight = new THREE.PointLight(0xffc46b, 0, 7, 1.6);
  flashLight.position.set(0.26, -0.12, -0.7);
  camera.add(flashLight);
  let flashLeft = 0;

  // Explosion light: one reusable light moved to each blast.
  const blastLight = new THREE.PointLight(0xff9a4d, 0, 22, 1.4);
  scene.add(blastLight);
  let blastLeft = 0;

  return {
    impact(point, normal, color = 0xc9b896) {
      for (let i = 0; i < 7; i += 1) {
        const spread = 2.2;
        spawnParticle(point.x, point.y, point.z,
          normal.x * 2 + (Math.random() - 0.5) * spread,
          Math.abs(normal.y) * 2 + Math.random() * 2.4,
          normal.z * 2 + (Math.random() - 0.5) * spread,
          0.25 + Math.random() * 0.3, color, 9);
      }
    },
    blood(point) {
      for (let i = 0; i < 8; i += 1) {
        spawnParticle(point.x, point.y, point.z,
          (Math.random() - 0.5) * 2.4, Math.random() * 2.2, (Math.random() - 0.5) * 2.4,
          0.3 + Math.random() * 0.25, 0x8e1f1f, 10);
      }
    },
    tracer(from, to) {
      const i = tCursor;
      tCursor = (tCursor + 1) % MAX_TRACERS;
      tPos[i * 6] = from.x; tPos[i * 6 + 1] = from.y; tPos[i * 6 + 2] = from.z;
      tPos[i * 6 + 3] = to.x; tPos[i * 6 + 4] = to.y; tPos[i * 6 + 5] = to.z;
      tLife[i] = 0.07;
    },
    muzzle() {
      flashLeft = 0.055;
      flashSprite.material.rotation = Math.random() * Math.PI;
      flashSprite.material.opacity = 0.95;
      flashLight.intensity = 10;
    },
    explosion(point) {
      blastLeft = 0.5;
      blastLight.position.copy(point);
      blastLight.position.y += 1;
      blastLight.intensity = 60;
      for (let i = 0; i < 46; i += 1) {
        const theta = Math.random() * Math.PI * 2;
        const up = Math.random() * 7 + 1;
        const out = 2 + Math.random() * 6;
        spawnParticle(point.x, point.y + 0.3, point.z,
          Math.cos(theta) * out, up, Math.sin(theta) * out,
          0.5 + Math.random() * 0.6, i % 3 === 0 ? 0xffd27a : 0x8a6a4a, 8);
      }
      for (let i = 0; i < 10; i += 1) this.smokePuff(point, 2.2);
    },
    smokePuff(point, size) {
      const slot = smokePool[sCursor];
      sCursor = (sCursor + 1) % MAX_SMOKE_SPRITES;
      slot.sprite.visible = true;
      slot.sprite.position.set(
        point.x + (Math.random() - 0.5) * 2.4,
        point.y + Math.random() * 1.2,
        point.z + (Math.random() - 0.5) * 2.4);
      slot.base = size * (0.8 + Math.random() * 0.5);
      slot.sprite.scale.set(slot.base, slot.base, 1);
      slot.sprite.material.opacity = 0.75;
      slot.maxLife = 16 + Math.random() * 4;
      slot.life = slot.maxLife;
      slot.grow = 0.12;
      slot.vx = (Math.random() - 0.5) * 0.35;
      slot.vy = 0.12 + Math.random() * 0.2;
      slot.vz = (Math.random() - 0.5) * 0.35;
    },
    clearSmoke() {
      for (const slot of smokePool) {
        slot.life = 0;
        slot.sprite.visible = false;
      }
    },
    step(dt) {
      for (let i = 0; i < MAX_PARTICLES; i += 1) {
        if (pLife[i] <= 0) continue;
        pLife[i] -= dt;
        if (pLife[i] <= 0) {
          pPos[i * 3 + 1] = -50;
          continue;
        }
        pVel[i * 3 + 1] -= pGrav[i] * dt;
        pPos[i * 3] += pVel[i * 3] * dt;
        pPos[i * 3 + 1] += pVel[i * 3 + 1] * dt;
        pPos[i * 3 + 2] += pVel[i * 3 + 2] * dt;
        if (pPos[i * 3 + 1] < 0.02) { pPos[i * 3 + 1] = 0.02; pVel[i * 3 + 1] = 0; }
      }
      pGeo.attributes.position.needsUpdate = true;
      pGeo.attributes.color.needsUpdate = true;
      for (let i = 0; i < MAX_TRACERS; i += 1) {
        if (tLife[i] <= 0) continue;
        tLife[i] -= dt;
        if (tLife[i] <= 0) {
          tPos[i * 6 + 1] = -50;
          tPos[i * 6 + 4] = -50;
        }
      }
      tGeo.attributes.position.needsUpdate = true;
      for (const slot of smokePool) {
        if (slot.life <= 0) continue;
        slot.life -= dt;
        if (slot.life <= 0) {
          slot.sprite.visible = false;
          continue;
        }
        const fade = slot.life < 4 ? slot.life / 4 : 1;
        slot.sprite.material.opacity = 0.75 * fade;
        const s = slot.base + (slot.maxLife - slot.life) * slot.grow;
        slot.sprite.scale.set(s, s, 1);
        slot.sprite.position.x += slot.vx * dt;
        slot.sprite.position.y += slot.vy * dt;
        slot.sprite.position.z += slot.vz * dt;
      }
      if (flashLeft > 0) {
        flashLeft -= dt;
        if (flashLeft <= 0) {
          flashSprite.material.opacity = 0;
          flashLight.intensity = 0;
        }
      }
      if (blastLeft > 0) {
        blastLeft -= dt;
        blastLight.intensity = Math.max(0, blastLeft * 120);
      }
    },
  };
}
