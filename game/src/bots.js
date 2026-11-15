// Bots: stylized soldier bodies plus the AI that drives them. Perception runs
// on a 0.12 s tick (vision cone, line of sight, smoke, hearing); steering and
// aiming run every fixed step. Bots follow waypoint paths, hold angles, react
// to sight and sound, rotate on the plant, and play the objective.
import * as THREE from 'three';
import { ARMOR_POINTS, ARMOR_PRICE, BOT, GRENADES, WEAPONS } from './config.js';
import { findPath, flatDistance, hasLineOfSight, nearestNode, overlapsAny, yawTo } from './collision.js';
import { groundSpeed, moveBody } from './mover.js';
import { fireWeapon, giveWeapon, startReload } from './weapons.js';
import { throwGrenade } from './grenades.js';

const tmpEye = new THREE.Vector3();
const tmpChest = new THREE.Vector3();
const tmpDir = new THREE.Vector3();
const tmpTarget = new THREE.Vector3();
const tmpAim = new THREE.Vector3();

function aimDirection(yaw, pitch, out) {
  const cp = Math.cos(pitch);
  out.set(-Math.sin(yaw) * cp, Math.sin(pitch), -Math.cos(yaw) * cp);
  return out;
}

function angleDelta(a, b) {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}

function turnToward(agent, targetYaw, targetPitch, rate, dt) {
  const dy = angleDelta(agent.yaw, targetYaw);
  const maxTurn = rate * dt;
  agent.yaw += Math.max(-maxTurn, Math.min(maxTurn, dy));
  const dp = targetPitch - agent.pitch;
  agent.pitch += Math.max(-maxTurn, Math.min(maxTurn, dp));
  return Math.abs(dy) < 0.15 && Math.abs(dp) < 0.12;
}

// ---- Bodies ---------------------------------------------------------------

function nameSprite(text, color) {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 64;
  const ctx = canvas.getContext('2d');
  ctx.font = 'bold 34px Arial, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = 'rgba(0,0,0,0.55)';
  ctx.fillRect(0, 8, 256, 48);
  ctx.fillStyle = color;
  ctx.fillText(text, 128, 34);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false }));
  sprite.scale.set(1.5, 0.375, 1);
  return sprite;
}

export function createBotBodies(scene, world, state) {
  const bodies = new Map();
  const jacketA = new THREE.MeshStandardMaterial({ color: 0xb05a1e, roughness: 0.8, metalness: 0.05 });
  const jacketB = new THREE.MeshStandardMaterial({ color: 0x1f7a72, roughness: 0.8, metalness: 0.05 });
  const pants = new THREE.MeshStandardMaterial({ color: 0x2e3236, roughness: 0.9, metalness: 0 });
  const skin = new THREE.MeshStandardMaterial({ color: 0xc9a586, roughness: 0.8, metalness: 0 });
  const gunMat = new THREE.MeshStandardMaterial({ color: 0x23262a, roughness: 0.5, metalness: 0.5 });
  const visorA = new THREE.MeshBasicMaterial({ color: 0xff8c30 });
  const visorB = new THREE.MeshBasicMaterial({ color: 0x35e0d0 });

  for (const agent of state.agents) {
    if (agent.isPlayer) continue;
    const group = new THREE.Group();
    const jacket = agent.team === 'strikers' ? jacketA : jacketB;
    const visor = agent.team === 'strikers' ? visorA : visorB;
    const legGeo = new THREE.BoxGeometry(0.17, 0.78, 0.17);
    const legL = new THREE.Mesh(legGeo, pants);
    legL.position.set(-0.11, 0.39, 0);
    const legR = new THREE.Mesh(legGeo, pants);
    legR.position.set(0.11, 0.39, 0);
    legL.userData = { agent, part: 'legs' };
    legR.userData = { agent, part: 'legs' };
    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.62, 0.28), jacket);
    torso.position.y = 1.09;
    torso.userData = { agent, part: 'torso' };
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.3, 0.28), skin);
    head.position.y = 1.56;
    head.userData = { agent, part: 'head' };
    const visorMesh = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.07, 0.03), visor);
    visorMesh.position.set(0, 1.58, -0.15);
    const armGeo = new THREE.BoxGeometry(0.12, 0.55, 0.12);
    const armL = new THREE.Mesh(armGeo, jacket);
    armL.position.set(-0.31, 1.12, 0);
    const armR = new THREE.Mesh(armGeo, jacket);
    armR.position.set(0.31, 1.12, 0);
    const gun = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.09, 0.62), gunMat);
    gun.position.set(0.16, 1.18, -0.32);
    const label = nameSprite(agent.name, agent.team === 'strikers' ? '#ffb37a' : '#7de8dd');
    label.position.y = 2.05;
    group.add(legL, legR, torso, head, visorMesh, armL, armR, gun, label);
    scene.add(group);
    world.shootables.push(legL, legR, torso, head);
    bodies.set(agent.id, { group, legL, legR, armL, armR, gun, label, phase: Math.random() * 6, deathT: 0 });
  }

  return {
    sync(state, dt) {
      for (const agent of state.agents) {
        if (agent.isPlayer) continue;
        const body = bodies.get(agent.id);
        if (!body) continue;
        body.group.position.copy(agent.pos);
        body.group.rotation.y = agent.yaw;
        body.label.visible = agent.alive && agent.team === state.player.team;
        if (!agent.alive) {
          body.deathT = Math.min(1, body.deathT + dt * 5);
          body.group.rotation.x = -Math.PI / 2 * 0.92 * body.deathT;
          body.group.position.y = 0.32 * body.deathT;
          continue;
        }
        body.deathT = 0;
        body.group.rotation.x = 0;
        body.group.position.y = 0;
        const speed = groundSpeed(agent);
        body.phase += dt * (2 + speed * 2.4);
        const swing = Math.min(1, speed / 5) * 0.55;
        body.legL.rotation.x = Math.sin(body.phase) * swing;
        body.legR.rotation.x = -Math.sin(body.phase) * swing;
        body.armL.rotation.x = -Math.sin(body.phase) * swing * 0.5;
        body.armR.rotation.x = Math.sin(body.phase) * swing * 0.5 - 0.5;
        body.gun.rotation.x = agent.pitch;
        const crouchScale = agent.crouching ? 0.82 : 1;
        body.group.scale.y += (crouchScale - body.group.scale.y) * Math.min(1, dt * 10);
      }
    },
  };
}

// ---- Roles ----------------------------------------------------------------

export function assignRoles(state, world) {
  const rng = state.rng;
  const attackers = state.agents.filter((a) => a.team === 'strikers' && !a.isPlayer);
  const defenders = state.agents.filter((a) => a.team === 'wardens' && !a.isPlayer);
  const playerAttacks = state.player.team === 'strikers';
  const attackRoles = ['siteA', 'siteB', 'mid', 'siteA'];
  const defendRoles = ['siteA', 'siteB', 'siteA', 'siteB', 'mid'];
  for (let i = attackRoles.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    [attackRoles[i], attackRoles[j]] = [attackRoles[j], attackRoles[i]];
  }
  for (let i = defendRoles.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    [defendRoles[i], defendRoles[j]] = [defendRoles[j], defendRoles[i]];
  }
  attackers.forEach((a, i) => {
    a.ai.role = attackRoles[i % attackRoles.length];
    a.ai.route = i % 2 === 0 ? 'lane' : 'mid';
  });
  defenders.forEach((a, i) => {
    a.ai.role = defendRoles[i % defendRoles.length];
  });
  // Bomb carrier: the player when attacking, else the sharpest attacker bot.
  if (!playerAttacks) {
    let carrier = attackers[0];
    for (const a of attackers) if (a.ai.skill > carrier.ai.skill) carrier = a;
    state.bomb.carrier = carrier;
  } else {
    state.bomb.carrier = state.player;
  }
  state.bomb.planted = false;
  state.bomb.dropped = false;
  for (const a of state.agents) {
    if (!a.ai) continue;
    a.ai.path = null;
    a.ai.pathIndex = 0;
    a.ai.objective = null;
    a.ai.target = null;
    a.ai.lastKnown = null;
    a.ai.lastKnownAt = -99;
    a.ai.reactLeft = 0;
    a.ai.burstLeft = 0;
    a.ai.pauseLeft = 0;
    a.ai.thinkLeft = rng() * BOT.thinkInterval;
    a.ai.thrownSmoke = false;
    a.ai.thrownFlash = false;
    a.ai.fragCooldown = 0;
    a.ai.holdYaw = a.yaw;
    a.ai.planting = false;
    a.ai.defusing = false;
    a.ai.stuckLeft = 0;
    a.ai.lastPos.copy(a.pos);
    a.ai.lastPosAt = 0;
    a.ai.strafeDir = rng() < 0.5 ? 1 : -1;
    a.ai.strafeLeft = 0;
    a.ai.scanPhase = rng() * 6;
  }
}

export function botBuy(agent, rng) {
  const money = agent.money;
  agent.grenades = { frag: 0, smoke: 0, flash: 0 };
  if (money >= 2700 && rng() < 0.85) {
    giveWeapon(agent, rng() < 0.12 ? 'sniper' : 'rifle');
    agent.money -= WEAPONS[agent.primary.key].cost;
  } else if (money >= 1500 && rng() < 0.8) {
    giveWeapon(agent, rng() < 0.5 ? 'smg' : 'shotgun');
    agent.money -= WEAPONS[agent.primary.key].cost;
  }
  if (agent.money >= ARMOR_PRICE && rng() < 0.75) {
    agent.armor = ARMOR_POINTS;
    agent.money -= ARMOR_PRICE;
  }
  if (agent.money >= GRENADES.smoke.cost && rng() < 0.6) { agent.grenades.smoke += 1; agent.money -= GRENADES.smoke.cost; }
  if (agent.money >= GRENADES.flash.cost && rng() < 0.5) { agent.grenades.flash += 1; agent.money -= GRENADES.flash.cost; }
  if (agent.money >= GRENADES.frag.cost && rng() < 0.4) { agent.grenades.frag += 1; agent.money -= GRENADES.frag.cost; }
  agent.activeSlot = agent.primary ? 'primary' : 'secondary';
}

// ---- Perception -----------------------------------------------------------

function canSee(state, agent, enemy, world) {
  if (!enemy.alive) return false;
  tmpEye.copy(agent.pos);
  tmpEye.y += agent.eye;
  tmpChest.copy(enemy.pos);
  tmpChest.y += 1.2;
  const dist = tmpEye.distanceTo(tmpChest);
  if (dist > BOT.visionRange) return false;
  tmpDir.copy(tmpChest).sub(tmpEye).normalize();
  aimDirection(agent.yaw, agent.pitch, tmpAim);
  if (dist > 6 && tmpDir.dot(tmpAim) < BOT.visionConeCos) return false;
  if (enemy.crouching && dist > 25) return false;
  return hasLineOfSight(world.colliders, state.smokes, tmpEye, tmpChest);
}

function perceive(state, agent, world) {
  const ai = agent.ai;
  let best = null;
  let bestDist = Infinity;
  for (const enemy of state.agents) {
    if (enemy.team === agent.team || !enemy.alive) continue;
    if (canSee(state, agent, enemy, world)) {
      const d = flatDistance(agent.pos, enemy.pos);
      if (d < bestDist) { best = enemy; bestDist = d; }
    }
  }
  if (best) {
    if (ai.target !== best) {
      ai.reactLeft = BOT.reactionMin + (1 - ai.skill) * (BOT.reactionMax - BOT.reactionMin);
    }
    ai.target = best;
    ai.lastKnown = best.pos.clone();
    ai.lastKnownAt = state.time;
    ai.seesTarget = true;
  } else {
    ai.seesTarget = false;
    if (ai.target && !ai.target.alive) ai.target = null;
    if (ai.target && state.time - ai.lastKnownAt > 3) ai.target = null;
  }
  // Hearing: noises newer than the last one this bot processed.
  for (const noise of state.noises) {
    if (noise.at <= ai.lastNoiseAt) continue;
    if (noise.team === agent.team) continue;
    const d = flatDistance(agent.pos, noise.pos);
    if (d < noise.radius) {
      ai.heardPos = noise.pos.clone();
      ai.heardAt = state.time;
      ai.alerted = true;
    }
  }
  if (state.noises.length > 0) ai.lastNoiseAt = state.noises[state.noises.length - 1].at;
}

// ---- Pathing --------------------------------------------------------------

function setPath(agent, world, dest) {
  const from = nearestNode(agent.pos, world.waypoints);
  const to = nearestNode(dest, world.waypoints);
  const nodes = findPath(from, to, world.adjacency);
  if (!nodes) {
    agent.ai.path = [dest.clone()];
  } else {
    agent.ai.path = nodes.map((i) => world.waypoints[i].clone());
    agent.ai.path.push(dest.clone());
  }
  agent.ai.pathIndex = 0;
}

function followPath(agent, world, dt, out) {
  const ai = agent.ai;
  out.x = 0; out.z = 0;
  if (!ai.path || ai.pathIndex >= ai.path.length) return false;
  const node = ai.path[ai.pathIndex];
  tmpDir.copy(node).sub(agent.pos);
  tmpDir.y = 0;
  const dist = tmpDir.length();
  if (dist < 0.9) {
    ai.pathIndex += 1;
    return ai.pathIndex < ai.path.length;
  }
  tmpDir.normalize();
  // Local avoidance: probe ahead; if blocked, sidestep to the clearer side.
  if (overlapsAny(world.colliders, agent.pos.x + tmpDir.x * 1.1, 0.3, agent.pos.z + tmpDir.z * 1.1, 0.3, 1.1, 0)) {
    const sideX = -tmpDir.z;
    const sideZ = tmpDir.x;
    const leftClear = !probeBlocked(agent, world, sideX, sideZ);
    const rightClear = !probeBlocked(agent, world, -sideX, -sideZ);
    const s = leftClear && !rightClear ? 1 : rightClear && !leftClear ? -1 : ai.strafeDir;
    tmpDir.x += sideX * s * 0.9;
    tmpDir.z += sideZ * s * 0.9;
    tmpDir.normalize();
  }
  out.x = tmpDir.x;
  out.z = tmpDir.z;
  return true;
}

function probeBlocked(agent, world, sx, sz) {
  return overlapsAny(world.colliders, agent.pos.x + sx * 1.2, 0.3, agent.pos.z + sz * 1.2, 0.3, 1.1, 0);
}

// ---- Decisions ------------------------------------------------------------

function siteFor(role, world) {
  return role === 'siteB' ? world.sites.B : world.sites.A;
}

function decide(state, agent, world) {
  const ai = agent.ai;
  const rng = state.rng;
  const bomb = state.bomb;
  ai.planting = false;
  ai.defusing = false;
  const attacking = agent.team === 'strikers';

  // Planted bomb rewrites everyone's job.
  if (bomb.planted) {
    if (attacking) {
      const site = bomb.site === 'B' ? world.sites.B : world.sites.A;
      const spotPair = site.holdSpots[Math.floor(rng() * site.holdSpots.length)];
      const spot = new THREE.Vector3(spotPair[0], 0, spotPair[1]);
      if (!ai.objective || ai.objective.type !== 'holdBomb') {
        ai.objective = { type: 'holdBomb', pos: spot.clone() };
        setPath(agent, world, spot);
      }
      return;
    }
    if (flatDistance(agent.pos, bomb.pos) < 1.6 && !ai.seesTarget) {
      ai.objective = { type: 'defuse' };
      ai.defusing = true;
      return;
    }
    if (!ai.objective || ai.objective.type !== 'defuse' || flatDistance(ai.objective.pos || bomb.pos, bomb.pos) > 1) {
      ai.objective = { type: 'defuse', pos: bomb.pos.clone() };
      setPath(agent, world, bomb.pos);
    }
    return;
  }

  // Dropped bomb: an attacker fetches it when the carrier is down or far.
  if (bomb.dropped && attacking) {
    const player = state.player;
    const playerFar = player.team !== 'strikers' || !player.alive || flatDistance(player.pos, bomb.pos) > 25;
    if (playerFar && (!ai.objective || ai.objective.type !== 'pickup')) {
      ai.objective = { type: 'pickup', pos: bomb.pos.clone() };
      setPath(agent, world, bomb.pos);
      return;
    }
    if (ai.objective && ai.objective.type === 'pickup') return;
  }

  if (attacking) {
    // Carrier plants when inside the site and the coast is clear.
    if (bomb.carrier === agent) {
      for (const key of ['A', 'B']) {
        const site = world.sites[key];
        if (agent.pos.x >= site.rect.minX && agent.pos.x <= site.rect.maxX
          && agent.pos.z >= site.rect.minZ && agent.pos.z <= site.rect.maxZ
          && !ai.seesTarget) {
          ai.objective = { type: 'plant', site: key };
          ai.planting = true;
          return;
        }
      }
    }
    const site = siteFor(ai.role, world);
    const target = ai.role === 'mid' ? world.waypoints[12].clone() : site.center.clone();
    if (!ai.objective || ai.objective.type !== 'push' || flatDistance(ai.objective.pos, target) > 2) {
      ai.objective = { type: 'push', pos: target };
      setPath(agent, world, target);
    }
    // Mid player swings to whichever site the team is hitting.
    if (ai.role === 'mid' && ai.path && ai.pathIndex >= ai.path.length) {
      const siteA = state.agents.some((a) => a.team === 'strikers' && a.alive && a !== agent
        && a.pos.x < -5 && a.pos.z < -5);
      const dest = siteA ? world.sites.A.center : world.sites.B.center;
      ai.objective = { type: 'push', pos: dest.clone() };
      setPath(agent, world, dest);
    }
    return;
  }

  // Defenders: hold the assigned site, or rotate on a heard push.
  if (ai.role === 'mid' && ai.heardPos && state.time - ai.heardAt < 4) {
    if (!ai.objective || ai.objective.type !== 'investigate') {
      ai.objective = { type: 'investigate', pos: ai.heardPos.clone() };
      setPath(agent, world, ai.heardPos);
    }
    return;
  }
  const site = siteFor(ai.role === 'mid' ? 'siteA' : ai.role, world);
  let hold;
  if (ai.role === 'mid') {
    hold = world.waypoints[13].clone();
  } else {
    const holdPair = site.holdSpots[agent.index % site.holdSpots.length];
    hold = new THREE.Vector3(holdPair[0], 0, holdPair[1]);
  }
  if (!ai.objective || ai.objective.type !== 'hold' || flatDistance(ai.objective.pos, hold) > 2) {
    ai.objective = { type: 'hold', pos: hold };
    ai.holdYaw = ai.role === 'mid' ? Math.PI : yawTo(hold, site.center);
    setPath(agent, world, hold);
  }
}

// ---- Combat ---------------------------------------------------------------

function engage(state, agent, world, ctx, dt) {
  const ai = agent.ai;
  const target = ai.target;
  if (!target || !target.alive) return false;
  tmpTarget.copy(target.pos);
  const headAim = ai.skill > 0.68 && state.rng() < 0.3;
  tmpTarget.y += headAim ? 1.55 : 1.2;
  tmpEye.copy(agent.pos);
  tmpEye.y += agent.eye;
  tmpDir.copy(tmpTarget).sub(tmpEye);
  const dist = tmpDir.length();
  const desiredYaw = Math.atan2(-tmpDir.x, -tmpDir.z);
  const desiredPitch = Math.asin(Math.max(-1, Math.min(1, tmpDir.y / dist)));
  const turnRate = 3.5 + ai.skill * 3;
  const aligned = turnToward(agent, desiredYaw, desiredPitch, turnRate, dt);
  if (ai.reactLeft > 0) {
    ai.reactLeft -= dt;
    return true;
  }
  if (agent.flashLeft > 0.4) return true;
  const weapon = agent.activeSlot === 'primary' ? agent.primary : agent.secondary;
  if (!weapon) return true;
  if (weapon.mag === 0) {
    startReload(agent, ctx.audio, state.player.pos);
    return true;
  }
  if (!aligned || !ai.seesTarget) return true;
  if (ai.pauseLeft > 0) {
    ai.pauseLeft -= dt;
    return true;
  }
  if (ai.burstLeft <= 0) {
    ai.burstLeft = weapon.def.key === 'sniper' ? 1 : weapon.def.key === 'shotgun' ? 2 : 3 + Math.floor(state.rng() * 3);
  }
  if (weapon.cooldown > 0) return true;
  aimDirection(agent.yaw, agent.pitch, tmpAim);
  const err = (1 - ai.skill) * 0.022 + 0.006 + Math.min(0.02, groundSpeed(agent) * 0.003);
  tmpAim.x += (state.rng() * 2 - 1) * err;
  tmpAim.y += (state.rng() * 2 - 1) * err;
  tmpAim.z += (state.rng() * 2 - 1) * err;
  tmpAim.normalize();
  const result = fireWeapon(state, agent, tmpEye, tmpAim, ctx.meshes, ctx.effects, ctx.audio, ctx.onDamage);
  if (result) {
    ai.burstLeft -= 1;
    if (ai.burstLeft <= 0) ai.pauseLeft = 0.25 + state.rng() * 0.4;
  }
  return true;
}

function maybeThrow(state, agent, world, ctx) {
  const ai = agent.ai;
  const rng = state.rng;
  ai.fragCooldown = Math.max(0, ai.fragCooldown - BOT.thinkInterval);
  tmpEye.copy(agent.pos);
  tmpEye.y += agent.eye;
  // Defenders open with a smoke toward their site's entrance.
  if (agent.team === 'wardens' && !ai.thrownSmoke && state.roundTime > 0.8 && agent.grenades.smoke > 0) {
    ai.thrownSmoke = true;
    const site = siteFor(ai.role === 'mid' ? 'siteA' : ai.role, world);
    const dest = ai.role === 'mid' ? new THREE.Vector3(0, 0, 0) : site.center.clone().add(new THREE.Vector3(site.center.x > 0 ? -7 : 7, 0, site.center.z > 0 ? -7 : 7));
    tmpDir.copy(dest).sub(tmpEye).normalize();
    tmpDir.y += 0.35;
    tmpDir.normalize();
    throwGrenade(state, agent, 'smoke', tmpEye, tmpDir, 15);
    return;
  }
  // Attackers flash the site entry as they arrive.
  if (agent.team === 'strikers' && !ai.thrownFlash && agent.grenades.flash > 0 && ai.seesTarget) {
    const site = siteFor(ai.role, world);
    if (flatDistance(agent.pos, site.center) < 16) {
      ai.thrownFlash = true;
      tmpDir.copy(site.center).sub(tmpEye).normalize();
      tmpDir.y += 0.55;
      tmpDir.normalize();
      throwGrenade(state, agent, 'flash', tmpEye, tmpDir, 14);
      return;
    }
  }
  // Frag at a remembered position behind cover.
  if (agent.grenades.frag > 0 && ai.fragCooldown <= 0 && ai.lastKnown && state.time - ai.lastKnownAt < 3 && !ai.seesTarget) {
    const dist = flatDistance(agent.pos, ai.lastKnown);
    if (dist > 8 && dist < 24) {
      ai.fragCooldown = 8;
      tmpDir.copy(ai.lastKnown).sub(tmpEye).normalize();
      tmpDir.y += 0.5;
      tmpDir.normalize();
      throwGrenade(state, agent, 'frag', tmpEye, tmpDir, 12 + dist * 0.3);
    }
  }
}

// ---- Main entry -----------------------------------------------------------

const moveOut = { x: 0, z: 0 };

export function botThink(state, agent, dt, ctx) {
  const ai = agent.ai;
  const world = ctx.world;
  if (!agent.alive) return;
  if (state.phase === 'buy' || state.phase === 'roundEnd' || state.phase === 'matchEnd' || state.phase === 'halfTime') {
    moveBody(agent, 0, 0, 0, false, false, dt, world.colliders);
    return;
  }
  ai.thinkLeft -= dt;
  if (ai.thinkLeft <= 0) {
    ai.thinkLeft = BOT.thinkInterval;
    perceive(state, agent, world);
    decide(state, agent, world);
    maybeThrow(state, agent, world, ctx);
  }

  const fighting = engage(state, agent, world, ctx, dt);
  let mx = 0;
  let mz = 0;
  let crouch = false;

  if (fighting && ai.seesTarget) {
    // Strafe while dueling.
    ai.strafeLeft -= dt;
    if (ai.strafeLeft <= 0) {
      ai.strafeDir = -ai.strafeDir;
      ai.strafeLeft = 0.5 + state.rng() * 0.7;
    }
    aimDirection(agent.yaw, 0, tmpAim);
    mx = -tmpAim.z * ai.strafeDir * 0.6;
    mz = tmpAim.x * ai.strafeDir * 0.6;
  } else if (ai.objective && ai.objective.type === 'hold' && (!ai.path || ai.pathIndex >= ai.path.length)) {
    // Holding an angle: scan slowly, crouch for stability.
    ai.scanPhase += dt * 0.5;
    const scanYaw = ai.holdYaw + Math.sin(ai.scanPhase) * 0.35;
    turnToward(agent, scanYaw, 0, 1.2, dt);
    crouch = ai.role !== 'mid';
  } else if (ai.planting || ai.defusing) {
    // Stand still and work the objective; sim advances the progress.
  } else if (ai.objective && ai.objective.type === 'defuse' && flatDistance(agent.pos, state.bomb.pos) < 1.6) {
    // Reached the bomb: handled by decide() next tick.
  } else if (followPath(agent, world, dt, moveOut)) {
    mx = moveOut.x;
    mz = moveOut.z;
    const faceYaw = Math.atan2(-mx, -mz);
    if (!ai.target) turnToward(agent, faceYaw, 0, 5, dt);
  } else if (ai.target && ai.lastKnown && state.time - ai.lastKnownAt < 3) {
    // Hunt the last known position.
    setPath(agent, world, ai.lastKnown);
  }

  // Stuck recovery: sidestep for a moment, then re-path.
  if (state.time - ai.lastPosAt > 0.6) {
    const moved = flatDistance(agent.pos, ai.lastPos);
    ai.lastPos.copy(agent.pos);
    ai.lastPosAt = state.time;
    if (moved < 0.25 && (mx !== 0 || mz !== 0)) {
      ai.stuckLeft = 0.5;
      if (ai.objective && ai.objective.pos) setPath(agent, world, ai.objective.pos);
    }
  }
  if (ai.stuckLeft > 0) {
    ai.stuckLeft -= dt;
    const sx = -mz;
    const sz = mx;
    mx += sx * ai.strafeDir;
    mz += sz * ai.strafeDir;
  }

  moveBody(agent, mx, mz, BOT.walkSpeed, false, crouch, dt, world.colliders);
  if (agent.flashLeft > 0.4 && ai.seesTarget) ai.reactLeft = Math.max(ai.reactLeft, 0.3);

  // Quiet reload when safe.
  const weapon = agent.activeSlot === 'primary' ? agent.primary : agent.secondary;
  if (weapon && weapon.mag > 0 && weapon.mag < weapon.def.mag * 0.3 && !ai.seesTarget && weapon.reloadLeft <= 0) {
    startReload(agent, ctx.audio, state.player.pos);
  }
}
