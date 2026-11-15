// Hitscan weapons, shared by the player and the bots: one firing path, one
// spread model, one damage model. The view models are built from boxes, one
// silhouette per weapon, with walk bob, recoil kick and a reload dip.
import * as THREE from 'three';
import { WEAPONS } from './config.js';

const UP = new THREE.Vector3(0, 1, 0);
const tmpDir = new THREE.Vector3();
const tmpU = new THREE.Vector3();
const tmpV = new THREE.Vector3();
const tmpOrigin = new THREE.Vector3();
const tmpPoint = new THREE.Vector3();
const tmpNormal = new THREE.Vector3(0, 1, 0);
const raycaster = new THREE.Raycaster();

export function computeSpread(agent, def, speed, scoped) {
  const moving = Math.min(1, speed / 5);
  let spread = def.spread + moving * def.moveSpread + agent.bloom;
  if (agent.crouching) spread *= 0.7;
  if (!agent.onGround) spread += 0.03;
  if (scoped) spread *= 0.35;
  return spread;
}

export function damageAtDistance(def, distance) {
  const [start, end, minMult] = def.falloff;
  if (distance <= start) return 1;
  if (distance >= end) return minMult;
  return 1 - ((distance - start) / (end - start)) * (1 - minMult);
}

function perturbDir(dir, spread, rng, out) {
  out.copy(dir);
  if (spread <= 0) return out;
  tmpU.crossVectors(dir, UP);
  if (tmpU.lengthSq() < 1e-6) tmpU.set(1, 0, 0);
  tmpU.normalize();
  tmpV.crossVectors(dir, tmpU).normalize();
  const a = (rng() * 2 - 1) * spread;
  const b = (rng() * 2 - 1) * spread;
  out.addScaledVector(tmpU, a).addScaledVector(tmpV, b).normalize();
  return out;
}

// Fire one trigger pull: consumes a round, applies recoil and bloom, casts
// the pellet rays and reports every hit through onDamage. Returns a summary
// for the HUD (hit marker, kill credit).
export function fireWeapon(state, shooter, origin, dir, meshes, effects, audio, onDamage) {
  const weapon = shooter.activeSlot === 'primary' ? shooter.primary : shooter.secondary;
  if (!weapon || weapon.mag <= 0 || weapon.cooldown > 0 || weapon.reloadLeft > 0) return null;
  const def = weapon.def;
  const rng = state.rng;
  weapon.mag -= 1;
  weapon.cooldown = 60 / def.rpm;
  shooter.bloom = Math.min(0.05, shooter.bloom + def.bloom);
  shooter.recoilPitch += def.recoil * (0.8 + rng() * 0.4);
  shooter.recoilYaw += (rng() * 2 - 1) * def.recoil * 0.55;
  if (shooter.isPlayer) {
    state.stats.shotsFired += 1;
    effects.muzzle();
  }
  audio.shot(def.sound, shooter.isPlayer ? null : origin.distanceTo(state.player.pos));
  state.noises.push({ pos: origin.clone(), radius: 30, team: shooter.team, at: state.time, kind: 'shot' });

  tmpOrigin.copy(origin).addScaledVector(dir, 0.5);
  let hitAny = false;
  let killedAny = false;
  let headshot = false;
  for (let p = 0; p < def.pellets; p += 1) {
    const spread = computeSpread(shooter, def, Math.hypot(shooter.vel.x, shooter.vel.z), shooter.scoped);
    perturbDir(dir, spread, rng, tmpDir);
    raycaster.set(origin, tmpDir);
    raycaster.far = def.range;
    const hits = raycaster.intersectObjects(meshes, false);
    let endPoint = null;
    for (const hit of hits) {
      const owner = hit.object.userData.agent;
      if (owner && owner.team === shooter.team && owner.alive) continue;
      if (owner && !owner.alive) continue;
      endPoint = hit.point;
      if (owner) {
        const part = hit.object.userData.part || 'torso';
        const mult = part === 'head' ? def.headMult : part === 'legs' ? def.legMult : 1;
        const amount = def.damage * mult * damageAtDistance(def, hit.distance);
        const killed = onDamage(state, owner, amount, shooter, part, hit.point);
        hitAny = true;
        killedAny = killedAny || killed;
        if (part === 'head') headshot = true;
        if (shooter.isPlayer) {
          state.stats.shotsHit += 1;
          if (part === 'head') state.stats.headshots += 1;
          effects.blood(hit.point);
        }
      } else {
        if (hit.face) tmpNormal.copy(hit.face.normal).transformDirection(hit.object.matrixWorld);
        effects.impact(hit.point, tmpNormal);
      }
      break;
    }
    if (!endPoint) {
      endPoint = tmpPoint.copy(origin).addScaledVector(tmpDir, def.range);
    }
    effects.tracer(tmpOrigin, endPoint);
  }
  return { hit: hitAny, killed: killedAny, headshot };
}

export function stepWeaponTimers(agent, dt) {
  for (const slot of [agent.primary, agent.secondary]) {
    if (!slot) continue;
    slot.cooldown = Math.max(0, slot.cooldown - dt);
    if (slot.reloadLeft > 0) {
      slot.reloadLeft = Math.max(0, slot.reloadLeft - dt);
      if (slot.reloadLeft === 0) {
        const need = slot.def.mag - slot.mag;
        const take = Math.min(need, slot.reserve);
        slot.mag += take;
        slot.reserve -= take;
      }
    }
  }
  const active = agent.activeSlot === 'primary' ? agent.primary : agent.secondary;
  const decay = active ? active.def.bloomDecay : 2.2;
  agent.bloom *= Math.exp(-decay * dt);
  agent.recoilPitch *= Math.max(0, 1 - 7 * dt);
  agent.recoilYaw *= Math.max(0, 1 - 7 * dt);
  agent.flashLeft = Math.max(0, agent.flashLeft - dt);
}

export function startReload(agent, audio, playerPos) {
  const weapon = agent.activeSlot === 'primary' ? agent.primary : agent.secondary;
  if (!weapon || weapon.reloadLeft > 0 || weapon.mag === weapon.def.mag || weapon.reserve === 0) return false;
  weapon.reloadLeft = weapon.def.reload;
  if (audio) audio.reload(agent.isPlayer || !playerPos ? null : agent.pos.distanceTo(playerPos));
  return true;
}

export function giveWeapon(agent, key) {
  const def = WEAPONS[key];
  const state = { key, def, mag: def.mag, reserve: def.reserve, cooldown: 0, reloadLeft: 0 };
  if (def.slot === 'primary') agent.primary = state;
  else agent.secondary = state;
  agent.activeSlot = def.slot;
  return state;
}

// The first-person view model: one boxy gun per weapon plus a grenade in the
// hand, with bob, kick and a reload dip. It hangs off the camera.
export function createViewmodel(camera) {
  const dark = new THREE.MeshStandardMaterial({ color: 0x2b2e33, roughness: 0.55, metalness: 0.4 });
  const mid = new THREE.MeshStandardMaterial({ color: 0x565b61, roughness: 0.45, metalness: 0.5 });
  const gripMat = new THREE.MeshStandardMaterial({ color: 0x1d1f22, roughness: 0.8, metalness: 0.1 });
  const accent = new THREE.MeshStandardMaterial({ color: 0xc96a24, roughness: 0.5, metalness: 0.3 });
  const root = new THREE.Group();
  root.scale.set(0.45, 0.45, 0.45);
  root.position.set(0.27, -0.23, -0.5);
  camera.add(root);

  function box(w, h, d, x, y, z, material, parent) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
    mesh.position.set(x, y, z);
    parent.add(mesh);
    return mesh;
  }

  const models = {};
  {
    const g = new THREE.Group();
    box(0.07, 0.09, 0.3, 0, 0, -0.05, mid, g);
    box(0.06, 0.12, 0.09, 0, -0.08, 0.08, gripMat, g);
    box(0.03, 0.03, 0.1, 0, 0.02, -0.24, dark, g);
    models.pistol = g;
  }
  {
    const g = new THREE.Group();
    box(0.09, 0.1, 0.42, 0, 0, -0.02, mid, g);
    box(0.045, 0.045, 0.4, 0, 0.025, -0.4, dark, g);
    box(0.075, 0.08, 0.22, 0, -0.02, 0.28, gripMat, g);
    box(0.06, 0.14, 0.1, 0, -0.1, -0.05, gripMat, g);
    box(0.05, 0.04, 0.12, 0, 0.07, -0.1, accent, g);
    models.rifle = g;
  }
  {
    const g = new THREE.Group();
    box(0.08, 0.09, 0.3, 0, 0, 0, mid, g);
    box(0.05, 0.05, 0.24, 0, 0.01, -0.26, dark, g);
    box(0.06, 0.13, 0.09, 0, -0.09, -0.02, gripMat, g);
    box(0.07, 0.07, 0.18, 0, -0.01, 0.24, gripMat, g);
    models.smg = g;
  }
  {
    const g = new THREE.Group();
    box(0.1, 0.09, 0.5, 0, 0, -0.08, dark, g);
    box(0.055, 0.055, 0.42, 0, 0.03, -0.42, mid, g);
    box(0.08, 0.07, 0.16, 0, -0.01, -0.3, gripMat, g);
    box(0.07, 0.09, 0.2, 0, -0.02, 0.26, gripMat, g);
    models.shotgun = g;
  }
  {
    const g = new THREE.Group();
    box(0.08, 0.09, 0.46, 0, 0, 0, mid, g);
    box(0.04, 0.04, 0.5, 0, 0.02, -0.44, dark, g);
    const scope = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.16, 12), dark);
    scope.rotation.x = Math.PI / 2;
    scope.position.set(0, 0.08, -0.08);
    g.add(scope);
    box(0.07, 0.1, 0.24, 0, -0.03, 0.3, gripMat, g);
    models.sniper = g;
  }
  {
    const g = new THREE.Group();
    const ball = new THREE.Mesh(new THREE.SphereGeometry(0.055, 14, 10), dark);
    g.add(ball);
    box(0.03, 0.03, 0.05, 0, 0.06, 0, accent, g);
    models.grenade = g;
  }
  for (const key of Object.keys(models)) {
    models[key].visible = false;
    root.add(models[key]);
  }

  let current = 'pistol';
  let kick = 0;
  let bobPhase = 0;
  let visible = true;

  return {
    setWeapon(key) {
      current = key in models ? key : 'grenade';
      for (const k of Object.keys(models)) models[k].visible = visible && k === current;
    },
    setVisible(v) {
      visible = v;
      for (const k of Object.keys(models)) models[k].visible = visible && k === current;
    },
    kick(amount) { kick = Math.min(0.09, kick + amount); },
    step(dt, speed, reloading, reloadingFor, reloadTotal) {
      kick += (0 - kick) * Math.min(1, dt * 14);
      bobPhase += dt * (2 + speed * 1.6);
      const bob = Math.min(1, speed / 5) * 0.008;
      root.position.z = -0.5 + kick;
      root.position.y = -0.23 + Math.sin(bobPhase * 2) * bob;
      root.position.x = 0.27 + Math.cos(bobPhase) * bob * 0.6;
      let dip = 0;
      let tilt = kick * 2.2;
      if (reloading) {
        const t = reloadTotal > 0 ? 1 - reloadingFor / reloadTotal : 0;
        dip = Math.sin(Math.min(1, t) * Math.PI) * 0.12;
        tilt = -0.5 * Math.sin(Math.min(1, t) * Math.PI);
      }
      root.position.y -= dip;
      root.rotation.x = tilt;
    },
  };
}
