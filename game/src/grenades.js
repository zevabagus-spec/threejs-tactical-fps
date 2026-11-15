// Thrown grenades: ballistic flight with bouncing, then a fuse resolution —
// frag deals LOS-checked splash damage, smoke lays a sight-blocking volume,
// flash blinds anyone looking at the pop. Grenade flight is deterministic
// under the fixed step.
import * as THREE from 'three';
import { GRENADES } from './config.js';
import { hasLineOfSight, overlapsAny } from './collision.js';

const GRAVITY = 9.8;
const RESTITUTION = 0.45;
const RADIUS = 0.09;
const tmpChest = new THREE.Vector3();
const tmpTo = new THREE.Vector3();
const tmpForward = new THREE.Vector3();

export function throwGrenade(state, agent, kind, origin, dir, speed = 16) {
  const def = GRENADES[kind];
  if (!def || agent.grenades[kind] <= 0) return null;
  agent.grenades[kind] -= 1;
  const grenade = {
    kind,
    def,
    owner: agent,
    pos: origin.clone(),
    vel: dir.clone().multiplyScalar(speed).addScaledVector(agent.vel, 0.5),
    fuseLeft: def.fuse,
    bounced: false,
  };
  state.grenades.push(grenade);
  state.noises.push({ pos: origin.clone(), radius: 12, team: agent.team, at: state.time, kind: 'throw' });
  return grenade;
}

function moveGrenade(g, dt, colliders) {
  g.vel.y -= GRAVITY * dt;
  const axes = ['x', 'y', 'z'];
  for (const axis of axes) {
    const prev = g.pos[axis];
    g.pos[axis] += g.vel[axis] * dt;
    if (overlapsAny(colliders, g.pos.x, g.pos.y - RADIUS, g.pos.z, RADIUS, RADIUS * 2, 0)) {
      g.pos[axis] = prev;
      g.vel[axis] = -g.vel[axis] * RESTITUTION;
      g.bounced = true;
    }
  }
  if (g.pos.y < RADIUS) {
    g.pos.y = RADIUS;
    if (Math.abs(g.vel.y) > 1) {
      g.vel.y = -g.vel.y * RESTITUTION;
      g.vel.x *= 0.7;
      g.vel.z *= 0.7;
      g.bounced = true;
    } else {
      g.vel.y = 0;
      g.vel.x *= Math.max(0, 1 - 4 * dt);
      g.vel.z *= Math.max(0, 1 - 4 * dt);
    }
  }
}

function resolveFrag(state, g, world, effects, audio, onDamage) {
  const { pos, def } = g;
  effects.explosion(pos);
  audio.explosion(pos.distanceTo(state.player.pos));
  state.noises.push({ pos: pos.clone(), radius: 40, team: null, at: state.time, kind: 'blast' });
  for (const agent of state.agents) {
    if (!agent.alive) continue;
    tmpChest.copy(agent.pos);
    tmpChest.y += 1.2;
    const dist = tmpChest.distanceTo(pos);
    if (dist > def.radius) continue;
    if (!hasLineOfSight(world.colliders, null, pos, tmpChest)) continue;
    const falloff = 1 - dist / def.radius;
    const amount = Math.max(8, def.maxDamage * falloff * falloff);
    onDamage(state, agent, amount, g.owner, 'torso', tmpChest);
  }
}

function resolveSmoke(state, g, effects, audio) {
  const { pos, def } = g;
  state.smokes.push({ pos: pos.clone(), radius: def.radius, left: def.duration });
  for (let i = 0; i < 9; i += 1) effects.smokePuff(pos, 2.4);
  audio.smokePop(pos.distanceTo(state.player.pos));
}

function resolveFlash(state, g, world, audio) {
  const { pos, def } = g;
  let playerBlinded = false;
  for (const agent of state.agents) {
    if (!agent.alive) continue;
    tmpChest.copy(agent.pos);
    tmpChest.y += agent.eye;
    const dist = tmpChest.distanceTo(pos);
    if (dist > def.radius) continue;
    tmpTo.copy(pos).sub(tmpChest).normalize();
    tmpForward.set(-Math.sin(agent.yaw), 0, -Math.cos(agent.yaw));
    const facing = tmpTo.dot(tmpForward);
    if (facing < -0.55) continue;
    if (!hasLineOfSight(world.colliders, null, pos, tmpChest)) continue;
    const strength = (1 - (dist / def.radius) * 0.7) * (facing > 0.2 ? 1 : 0.45);
    agent.flashLeft = Math.max(agent.flashLeft, def.blind * strength);
    if (agent.isPlayer && agent.flashLeft > 0.3) playerBlinded = true;
  }
  if (playerBlinded) audio.flashRing();
}

export function stepGrenades(state, dt, world, effects, audio, onDamage) {
  for (let i = state.grenades.length - 1; i >= 0; i -= 1) {
    const g = state.grenades[i];
    moveGrenade(g, dt, world.colliders);
    if (g.bounced) {
      audio.bounce(g.pos.distanceTo(state.player.pos));
      g.bounced = false;
    }
    g.fuseLeft -= dt;
    if (g.fuseLeft <= 0) {
      if (g.kind === 'frag') resolveFrag(state, g, world, effects, audio, onDamage);
      else if (g.kind === 'smoke') resolveSmoke(state, g, effects, audio);
      else if (g.kind === 'flash') resolveFlash(state, g, world, audio);
      state.grenades.splice(i, 1);
    }
  }
  for (let i = state.smokes.length - 1; i >= 0; i -= 1) {
    state.smokes[i].left -= dt;
    if (state.smokes[i].left <= 0) state.smokes.splice(i, 1);
  }
}

// Visual pool: one small sphere per live grenade, plus a blinking bomb prop
// that sits on the ground where the bomb is planted or dropped.
export function createGrenadeVisuals(scene) {
  const geo = new THREE.SphereGeometry(0.09, 10, 8);
  const mat = new THREE.MeshStandardMaterial({ color: 0x2e332e, roughness: 0.6, metalness: 0.3 });
  const pool = [];
  for (let i = 0; i < 12; i += 1) {
    const mesh = new THREE.Mesh(geo, mat);
    mesh.visible = false;
    scene.add(mesh);
    pool.push(mesh);
  }
  const bombGroup = new THREE.Group();
  const bombBody = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.26, 0.3),
    new THREE.MeshStandardMaterial({ color: 0x3a3f45, roughness: 0.5, metalness: 0.5 }));
  bombBody.position.y = 0.13;
  bombGroup.add(bombBody);
  const bombLight = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 8),
    new THREE.MeshBasicMaterial({ color: 0xff3020 }));
  bombLight.position.set(0.14, 0.29, 0);
  bombGroup.add(bombLight);
  bombGroup.visible = false;
  scene.add(bombGroup);
  return {
    sync(state, time) {
      for (let i = 0; i < pool.length; i += 1) {
        const g = state.grenades[i];
        if (g) {
          pool[i].visible = true;
          pool[i].position.copy(g.pos);
        } else {
          pool[i].visible = false;
        }
      }
      const bomb = state.bomb;
      if (bomb.planted) {
        bombGroup.visible = true;
        bombGroup.position.copy(bomb.pos);
        bombGroup.position.y = 0;
        const urgent = bomb.timerLeft < 10;
        const blink = Math.sin(time * (urgent ? 14 : 6)) > 0;
        bombLight.material.color.setHex(blink ? 0xff3020 : 0x551008);
      } else if (bomb.dropped) {
        bombGroup.visible = true;
        bombGroup.position.copy(bomb.pos);
        bombGroup.position.y = 0;
        bombLight.material.color.setHex(0xff8c20);
      } else {
        bombGroup.visible = false;
      }
    },
  };
}
