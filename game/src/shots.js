// Screenshot staging: ?shot=start|play|buy|end arranges a deterministic scene
// through the game's own state and systems, renders it with the game's own
// renderer, and freezes. Nothing is composited or edited — the PNG the
// capture tool saves is a real frame of this code.
import * as THREE from 'three';
import { endRound, startRound } from './rounds.js';
import { fireWeapon, giveWeapon } from './weapons.js';
import { stepSim } from './sim.js';
import { FIXED_STEP } from './config.js';

const tmpEye = new THREE.Vector3();
const tmpDir = new THREE.Vector3();

function runSteps(game, count) {
  for (let i = 0; i < count; i += 1) {
    stepSim(game.state, game.input, FIXED_STEP, game.ctx);
    game.input.endStep();
  }
}

function beginMatch(game) {
  game.hud.hideMenu();
  game.hud.hidePause();
  startRound(game.state, game.world, game.ctx.audio);
}

function setupPlay(game) {
  beginMatch(game);
  const { state, world } = game;
  state.phase = 'live';
  state.roundTime = 8;
  state.phaseTime = 8;
  const player = state.player;
  giveWeapon(player, 'rifle');
  player.money = 2700;
  player.pos.set(0.5, 0, 3.5);
  player.yaw = 0;
  player.pitch = 0;
  // Three defenders holding mid, facing the player.
  const wardens = state.agents.filter((a) => a.team === 'wardens');
  const spots = [[0.4, -3.5], [-1.8, -5.5], [1.2, -6.5]];
  // A smoke blooming beside the doorway, placed through the game's own
  // smoke state and sprite pool.
  const smokePos = new THREE.Vector3(-2.2, 0.4, -2.5);
  state.smokes.push({ pos: smokePos.clone(), radius: 4.2, left: 18 });
  for (let i = 0; i < 9; i += 1) game.ctx.effects.smokePuff(smokePos, 2.4);
  runSteps(game, 90);
  // Re-stage the defenders after the settling steps: the AI would otherwise
  // have walked them to their hold spots.
  wardens.slice(0, 3).forEach((bot, i) => {
    bot.pos.set(spots[i][0], 0, spots[i][1]);
    bot.vel.set(0, 0, 0);
    bot.yaw = Math.PI;
    bot.pitch = 0;
    bot.ai.path = null;
    bot.ai.objective = null;
    bot.ai.target = state.player;
    bot.ai.seesTarget = true;
  });
  // The staged shots raycast against mesh world matrices, which only update
  // on render — refresh them now so the rays meet the staged positions.
  game.scene.updateMatrixWorld(true);
  tmpEye.copy(player.pos);
  tmpEye.y += player.eye;
  tmpDir.set(-Math.sin(player.yaw), 0, -Math.cos(player.yaw));
  const weapon = player.primary;
  weapon.cooldown = 0;
  const result = fireWeapon(state, player, tmpEye, tmpDir, game.ctx.meshes, game.ctx.effects, game.ctx.audio, game.ctx.onDamage);
  weapon.cooldown = 0;
  fireWeapon(state, player, tmpEye, tmpDir, game.ctx.meshes, game.ctx.effects, game.ctx.audio, game.ctx.onDamage);
  if (result && result.hit) game.ctx.feedback.hit(state, result);
  player.health = 100;
  player.armor = 100;
  state.playerHurtFlash = 0;
}

function setupBuy(game) {
  beginMatch(game);
  const player = game.state.player;
  player.money = 4200;
  player.yaw = -Math.PI * 0.25;
  game.hud.toggleBuy();
  runSteps(game, 5);
}

function setupEnd(game) {
  game.state.round = 6;
  beginMatch(game);
  const { state } = game;
  state.scores.strikers = 4;
  state.scores.wardens = 2;
  const kills = [12, 8, 9, 6, 11, 7, 10, 5, 8, 4];
  state.agents.forEach((a, i) => {
    a.kills = kills[i];
    a.deaths = Math.max(0, 6 - (i % 4));
  });
  endRound(state, state.player.team, 'Defenders eliminated', null);
  for (const a of state.agents) {
    if (a.team !== state.player.team) {
      a.alive = false;
      a.health = 0;
    }
  }
  runSteps(game, 2);
}

export function setupShot(name, game) {
  if (name === 'start') {
    return true;
  }
  if (name === 'play') {
    setupPlay(game);
    return true;
  }
  if (name === 'buy') {
    setupBuy(game);
    return true;
  }
  if (name === 'end') {
    setupEnd(game);
    return true;
  }
  return false;
}
