// Boot and the game loop: build every system, wire them into one context,
// run the simulation at a fixed 60 Hz step apart from rendering, and drive
// the menu, pause and screenshot flows.
import { FIXED_STEP } from './config.js';
import { createState } from './state.js';
import { createWorld } from './world.js';
import { createRenderer } from './render.js';
import { createInput } from './input.js';
import { createAudio } from './audio.js';
import { createEffects } from './effects.js';
import { createViewmodel } from './weapons.js';
import { createBotBodies } from './bots.js';
import { createGrenadeVisuals } from './grenades.js';
import { createPlayerController } from './player.js';
import { createHUD } from './hud.js';
import { feedback, stepSim } from './sim.js';
import { applyDamage, startRound } from './rounds.js';
import { setupShot } from './shots.js';
import { groundSpeed } from './mover.js';

const params = new URLSearchParams(window.location.search);
const seed = Number.parseInt(params.get('seed') || '', 10) || 20261115;
const shotName = params.get('shot');
const shotMode = Boolean(shotName);
const SHOT_TIME = 12.5;

const canvas = document.getElementById('game-canvas');
const view = createRenderer(canvas);
const world = createWorld(view.scene);
const state = createState(seed);
const audio = createAudio();
const effects = createEffects(view.scene, view.camera);
const viewmodel = createViewmodel(view.camera);
const botBodies = createBotBodies(view.scene, world, state);
const grenadeVisuals = createGrenadeVisuals(view.scene);
const input = createInput(canvas);
const playerController = createPlayerController();

const ctx = {
  world,
  effects,
  audio,
  meshes: world.shootables,
  viewmodel,
  onDamage: applyDamage,
  playerController,
  hud: null,
  feedback,
  spreadNow: 0.01,
  spectateTarget: null,
};

const hud = createHUD(world, {
  onBuy: (item) => hud.buyItemViaClick(item, state, audio),
});
ctx.hud = hud;

document.getElementById('seed-label').textContent = `Seed ${seed} · v1.0`;
view.setDebugPaths(world, params.get('debug') === 'paths');

let frozen = false;
let shotFrames = 0;
let matchStarted = false;
let endShown = false;

function startMatch() {
  if (matchStarted) return;
  matchStarted = true;
  audio.unlock();
  hud.hideMenu();
  hud.hidePause();
  startRound(state, world, audio);
  input.requestLock();
}

document.getElementById('start-btn').addEventListener('click', startMatch);
document.getElementById('restart-btn').addEventListener('click', () => window.location.reload());
document.getElementById('pause').addEventListener('click', () => input.requestLock());
document.addEventListener('pointerlockerror', () => {
  if (matchStarted && state.phase !== 'matchEnd') hud.showPause();
});

input.setOnLockChange((locked) => {
  if (shotMode) return;
  if (!locked && matchStarted && state.phase !== 'menu' && state.phase !== 'matchEnd') {
    hud.showPause();
  } else {
    hud.hidePause();
  }
});
input.setOnCanvasClick(() => {
  if (matchStarted && !input.isLocked() && state.phase !== 'matchEnd') input.requestLock();
});

window.addEventListener('resize', () => view.resize());

if (shotMode) {
  frozen = setupShot(shotName, { state, world, scene: view.scene, ctx, hud, input });
}

window.__game = {
  state,
  input,
  ctx,
  world,
  hud,
  start: startMatch,
  step(count) {
    for (let i = 0; i < count; i += 1) stepSim(state, input, FIXED_STEP, ctx);
  },
};

let lastNow = performance.now();
let accumulator = 0;

function frame(now) {
  requestAnimationFrame(frame);
  const renderDt = Math.min(0.1, (now - lastNow) / 1000);
  lastNow = now;
  const time = shotMode ? SHOT_TIME : now / 1000;
  const paused = !shotMode && matchStarted && !input.isLocked() && state.phase !== 'matchEnd';
  const stepping = !frozen && !paused && state.phase !== 'menu';

  if (stepping) {
    accumulator += renderDt;
    let steps = 0;
    while (accumulator >= FIXED_STEP && steps < 5) {
      stepSim(state, input, FIXED_STEP, ctx);
      accumulator -= FIXED_STEP;
      steps += 1;
    }
    if (steps === 5) accumulator = 0;
  } else {
    accumulator = 0;
  }

  const visualDt = frozen || paused ? 0 : renderDt;
  effects.step(visualDt);
  botBodies.sync(state, visualDt);
  grenadeVisuals.sync(state, time);
  const player = state.player;
  const weapon = player.activeSlot === 'primary' ? player.primary : player.secondary;
  viewmodel.setVisible(player.alive && !player.scoped && state.phase !== 'menu');
  viewmodel.step(visualDt, groundSpeed(player), Boolean(weapon && weapon.reloadLeft > 0),
    weapon ? weapon.reloadLeft : 0, weapon ? weapon.def.reload : 1);
  view.syncCamera(state, ctx, visualDt, time);
  hud.update(state, input, ctx, time * 1000);
  if (state.phase === 'matchEnd' && !endShown) {
    endShown = true;
    hud.closeBuy();
    hud.showEnd(state);
    document.exitPointerLock();
  }
  view.render();

  if (frozen) {
    shotFrames += 1;
    if (shotFrames >= 2 && !window.__shotReady) window.__shotReady = true;
  }
  input.endStep();
}

requestAnimationFrame(frame);
