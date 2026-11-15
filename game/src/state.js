// The one state store. Every module reads and writes this object and nothing
// else holds game truth; rendering only reads it. The simulation is a function
// of (state, input) stepped at FIXED_STEP, so a seeded run replays.
import * as THREE from 'three';
import { BOT_NAMES, ECONOMY, MOVEMENT, WEAPONS } from './config.js';

export function mulberry32(initial) {
  let a = initial | 0;
  return function random() {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

let nextAgentId = 1;

export function createWeaponState(key) {
  const def = WEAPONS[key];
  return { key, def, mag: def.mag, reserve: def.reserve, cooldown: 0, reloadLeft: 0 };
}

export function createAgent(index, team, name, isPlayer, skill) {
  const agent = {
    id: nextAgentId++,
    index,
    name,
    team,
    isPlayer,
    alive: true,
    health: 100,
    armor: 0,
    pos: new THREE.Vector3(),
    vel: new THREE.Vector3(),
    yaw: 0,
    pitch: 0,
    height: MOVEMENT.standHeight,
    eye: MOVEMENT.standEye,
    crouching: false,
    onGround: true,
    scoped: false,
    money: ECONOMY.startMoney,
    kills: 0,
    deaths: 0,
    primary: null,
    secondary: createWeaponState('pistol'),
    grenades: { frag: 0, smoke: 0, flash: 0 },
    activeSlot: 'secondary',
    bloom: 0,
    recoilPitch: 0,
    recoilYaw: 0,
    flashLeft: 0,
    lastDamageFrom: null,
    lastDamageAt: -99,
    stepNoiseAt: 0,
    ai: null,
  };
  if (!isPlayer) {
    agent.ai = {
      skill,
      role: 'flex',
      route: 'lane',
      path: null,
      pathIndex: 0,
      objective: null,
      holdYaw: 0,
      target: null,
      seesTarget: false,
      reactLeft: 0,
      burstLeft: 0,
      pauseLeft: 0,
      lastKnown: null,
      lastKnownAt: -99,
      thinkLeft: 0,
      heardPos: null,
      heardAt: -99,
      alerted: false,
      lastNoiseAt: -99,
      thrownSmoke: false,
      thrownFlash: false,
      fragCooldown: 0,
      planting: false,
      defusing: false,
      stuckLeft: 0,
      lastPos: new THREE.Vector3(),
      lastPosAt: 0,
      strafeDir: 1,
      strafeLeft: 0,
      scanPhase: 0,
    };
  }
  return agent;
}

export function createState(seed) {
  const rng = mulberry32(seed);
  const agents = [createAgent(0, 'strikers', 'You', true, 0)];
  let index = 1;
  for (const name of BOT_NAMES.strikers) {
    agents.push(createAgent(index, 'strikers', name, false, 0.55 + rng() * 0.35));
    index += 1;
  }
  for (const name of BOT_NAMES.wardens) {
    agents.push(createAgent(index, 'wardens', name, false, 0.55 + rng() * 0.35));
    index += 1;
  }
  return {
    seed,
    rng,
    time: 0,
    phase: 'menu',
    phaseTime: 0,
    round: 0,
    roundTime: 0,
    scores: { strikers: 0, wardens: 0 },
    lossStreak: { strikers: 0, wardens: 0 },
    lastWinner: null,
    agents,
    player: agents[0],
    bomb: {
      carrier: agents[0],
      dropped: false,
      planted: false,
      exploded: false,
      pos: new THREE.Vector3(),
      site: null,
      timerLeft: 0,
      plantProgress: 0,
      defuseProgress: 0,
    },
    grenades: [],
    smokes: [],
    noises: [],
    feed: [],
    roundWinner: null,
    roundReason: '',
    matchWinner: null,
    pendingMatchEnd: false,
    playerPlanting: false,
    playerDefusing: false,
    playerHurtFlash: 0,
    bombBlast: null,
    stats: { shotsFired: 0, shotsHit: 0, headshots: 0, kills: 0, headshotKills: 0, plants: 0, defuses: 0 },
  };
}

export function activeWeapon(agent) {
  if (agent.activeSlot === 'primary') return agent.primary;
  if (agent.activeSlot === 'secondary') return agent.secondary;
  return null;
}
