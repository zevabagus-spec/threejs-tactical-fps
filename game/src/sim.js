// The fixed-step simulation: one step advances the round clock, the player,
// the bots, the weapons, the grenades and the objective — in that order, at
// 60 Hz, independent of the render rate.
import { flatDistance } from './collision.js';
import { groundSpeed } from './mover.js';
import { botThink } from './bots.js';
import { stepGrenades } from './grenades.js';
import { applyDamage, buyItem, BUY_ITEMS, pushFeed, stepRoundTimer } from './rounds.js';
import { stepWeaponTimers } from './weapons.js';

// Presentation feedback for hit markers: set when the player's shot lands,
// read by the HUD. Not game truth, so it lives outside the state store.
export const feedback = {
  hitAt: -99,
  killAt: -99,
  headshot: false,
  hit(state, result) {
    this.hitAt = state.time;
    this.headshot = result.headshot;
    if (result.killed) this.killAt = state.time;
  },
};

function stepFootsteps(state, dt, audio) {
  for (const agent of state.agents) {
    if (!agent.alive || !agent.onGround) continue;
    const speed = groundSpeed(agent);
    if (speed < 1.5) continue;
    if (state.time < agent.stepNoiseAt) continue;
    agent.stepNoiseAt = state.time + 2.4 / speed;
    const running = speed > 4;
    const radius = agent.crouching ? 4 : running ? 11 : 7;
    state.noises.push({ pos: agent.pos.clone(), radius, team: agent.team, at: state.time, kind: 'step' });
    const dist = agent.isPlayer ? null : agent.pos.distanceTo(state.player.pos);
    audio.step(dist, running);
  }
}

function stepBombPickup(state) {
  const bomb = state.bomb;
  if (!bomb.dropped) return;
  for (const agent of state.agents) {
    if (agent.team !== 'strikers' || !agent.alive) continue;
    if (flatDistance(agent.pos, bomb.pos) < 1.2) {
      bomb.carrier = agent;
      bomb.dropped = false;
      pushFeed(state, `${agent.name} picked up the bomb`, 'bomb');
      return;
    }
  }
}

function stepBuying(state, input, ctx) {
  const hud = ctx.hud;
  if (input.pressed.has('KeyB')) {
    if (state.phase === 'buy') hud.toggleBuy();
    else if (hud.isBuyOpen()) hud.toggleBuy();
    input.pressed.delete('KeyB');
  }
  if (!hud.isBuyOpen()) return;
  if (state.phase !== 'buy') {
    hud.closeBuy();
    return;
  }
  for (const item of BUY_ITEMS) {
    if (input.pressed.has(`Digit${item.hotkey}`)) {
      const error = buyItem(state, item, ctx.audio);
      if (error) hud.flashBuyError(error);
      input.pressed.delete(`Digit${item.hotkey}`);
    }
  }
  if (input.pressed.has('Escape')) {
    hud.closeBuy();
    input.pressed.delete('Escape');
  }
}

export function stepSim(state, input, dt, ctx) {
  state.time += dt;
  stepRoundTimer(state, dt, ctx.world, ctx.audio);
  if (state.phase === 'matchEnd') return;
  ctx.playerController.step(state, input, dt, ctx);
  for (const agent of state.agents) {
    if (!agent.isPlayer) botThink(state, agent, dt, ctx);
  }
  for (const agent of state.agents) {
    stepWeaponTimers(agent, dt);
  }
  stepGrenades(state, dt, ctx.world, ctx.effects, ctx.audio, applyDamage);
  stepFootsteps(state, dt, ctx.audio);
  stepBombPickup(state);
  stepBuying(state, input, ctx);
  state.playerHurtFlash = Math.max(0, state.playerHurtFlash - dt * 2.2);
  if (state.noises.length > 0) {
    state.noises = state.noises.filter((n) => state.time - n.at < 3);
  }
}
