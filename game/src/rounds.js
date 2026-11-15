// Round and match flow: damage and kills, money, the buy phase, plant and
// defuse, win conditions, halves and the match result. The simulation calls
// into here; the HUD reads the state this module maintains.
import { ARMOR_POINTS, ARMOR_PRICE, COMBAT, ECONOMY, GRENADES, MOVEMENT, TIMING, WEAPONS } from './config.js';
import { flatDistance } from './collision.js';
import { assignRoles, botBuy } from './bots.js';
import { giveWeapon } from './weapons.js';

function feed(state, text, kind) {
  state.feed.push({ text, kind: kind || 'info', at: state.time });
  if (state.feed.length > 6) state.feed.shift();
}

export { feed as pushFeed };

export function teamAlive(state, team) {
  return state.agents.filter((a) => a.team === team && a.alive).length;
}

// Armor absorbs half the damage and loses as many points. Returns true when
// the victim dies. Kill credit, money and the feed live here.
export function applyDamage(state, victim, amount, attacker, part, point) {
  if (!victim.alive || state.phase === 'roundEnd' || state.phase === 'matchEnd') return false;
  let damage = amount;
  if (victim.armor > 0) {
    const absorbed = Math.min(victim.armor, damage * COMBAT.armorAbsorb);
    victim.armor -= absorbed;
    damage -= absorbed;
  }
  victim.health -= damage;
  victim.lastDamageAt = state.time;
  victim.lastDamageFrom = attacker;
  if (victim.isPlayer) state.playerHurtFlash = 1;
  if (victim.health > 0) return false;
  victim.health = 0;
  victim.alive = false;
  victim.flashLeft = 0;
  if (victim.ai) {
    victim.ai.target = null;
    victim.ai.planting = false;
    victim.ai.defusing = false;
  }
  if (state.bomb.carrier === victim) {
    state.bomb.carrier = null;
    state.bomb.dropped = true;
    state.bomb.pos.copy(victim.pos);
    feed(state, `Bomb dropped by ${victim.name}`, 'bomb');
  }
  if (attacker && attacker !== victim) {
    attacker.kills += 1;
    attacker.money = Math.min(ECONOMY.maxMoney, attacker.money + ECONOMY.killReward);
    if (attacker.isPlayer) {
      state.stats.kills += 1;
      if (part === 'head') state.stats.headshotKills += 1;
    }
    const how = part === 'head' ? '◉' : '✕';
    feed(state, `${attacker.name} ${how} ${victim.name}`, attacker.isPlayer ? 'killYou' : victim.isPlayer ? 'deathYou' : 'kill');
  } else {
    feed(state, `${victim.name} died`, 'kill');
  }
  victim.deaths += 1;
  checkRoundEnd(state, 'elimination');
  return true;
}

function inSite(pos, site) {
  return pos.x >= site.rect.minX && pos.x <= site.rect.maxX
    && pos.z >= site.rect.minZ && pos.z <= site.rect.maxZ;
}

export function siteAt(pos, world) {
  for (const key of ['A', 'B']) {
    if (inSite(pos, world.sites[key])) return key;
  }
  return null;
}

// Plant/defuse progress. The caller sets agent.ai.planting/defusing (bots)
// or the player holds E; this module advances the timer and resolves.
export function stepObjective(state, dt, world, audio) {
  const bomb = state.bomb;
  if (bomb.planted) {
    bomb.timerLeft -= dt;
    const prevSecond = Math.ceil(bomb.timerLeft + dt);
    const second = Math.ceil(bomb.timerLeft);
    if (second !== prevSecond && second <= 10 && second > 0) audio.beep(true);
    else if (second !== prevSecond && second % 5 === 0) audio.beep(false);
    if (bomb.timerLeft <= 0) {
      bomb.timerLeft = 0;
      detonate(state, audio);
    }
    return;
  }
  // Planting: carrier standing in a site, holding still.
  if (bomb.carrier && bomb.carrier.alive) {
    const carrier = bomb.carrier;
    const site = siteAt(carrier.pos, world);
    const working = carrier.isPlayer ? state.playerPlanting : carrier.ai && carrier.ai.planting;
    if (site && working) {
      bomb.plantProgress += dt;
      if (Math.floor(bomb.plantProgress * 2) !== Math.floor((bomb.plantProgress - dt) * 2)) audio.plantTick();
      if (bomb.plantProgress >= TIMING.plantTime) {
        bomb.planted = true;
        bomb.site = site;
        bomb.pos.copy(carrier.pos);
        bomb.timerLeft = TIMING.bombTime;
        bomb.plantProgress = 0;
        state.phase = 'live';
        carrier.money = Math.min(ECONOMY.maxMoney, carrier.money + ECONOMY.plantReward);
        if (carrier.isPlayer) state.stats.plants += 1;
        feed(state, `Bomb planted at site ${site}!`, 'bomb');
        audio.beep(true);
      }
    } else {
      bomb.plantProgress = 0;
    }
  }
  // Defusing runs in stepDefuse, called alongside this function.
}

export function stepDefuse(state, dt, world, audio) {
  const bomb = state.bomb;
  if (!bomb.planted) return;
  let worker = null;
  for (const agent of state.agents) {
    if (agent.team !== 'wardens' || !agent.alive) continue;
    if (flatDistance(agent.pos, bomb.pos) > 1.6) continue;
    const working = agent.isPlayer ? state.playerDefusing : agent.ai && agent.ai.defusing;
    if (working) { worker = agent; break; }
  }
  if (worker) {
    bomb.defuseProgress += dt;
    if (Math.floor(bomb.defuseProgress * 2) !== Math.floor((bomb.defuseProgress - dt) * 2)) audio.plantTick();
    if (bomb.defuseProgress >= TIMING.defuseTime) {
      bomb.defuseProgress = 0;
      bomb.planted = false;
      worker.money = Math.min(ECONOMY.maxMoney, worker.money + ECONOMY.defuseReward);
      if (worker.isPlayer) state.stats.defuses += 1;
      feed(state, `${worker.name} defused the bomb!`, 'bomb');
      endRound(state, 'wardens', 'Bomb defused', audio);
    }
  } else {
    bomb.defuseProgress = 0;
  }
}

function detonate(state, audio) {
  const bomb = state.bomb;
  bomb.planted = false;
  bomb.exploded = true;
  feed(state, 'Bomb detonated!', 'bomb');
  // Lethal blast at the site: anyone close dies, no armor save.
  for (const agent of state.agents) {
    if (!agent.alive) continue;
    const d = flatDistance(agent.pos, bomb.pos);
    if (d < 9) {
      agent.health = 0;
      agent.alive = false;
      agent.deaths += 1;
      feed(state, `${agent.name} caught in the blast`, 'kill');
    }
  }
  state.bombBlast = { pos: bomb.pos.clone(), at: state.time };
  endRound(state, 'strikers', 'Bomb detonated', audio);
}

export function checkRoundEnd(state, reason) {
  if (state.phase !== 'live' && state.phase !== 'buy') return;
  const strikers = teamAlive(state, 'strikers');
  const wardens = teamAlive(state, 'wardens');
  if (state.bomb.planted) {
    if (wardens === 0) endRound(state, 'strikers', 'Defenders eliminated', null);
    return;
  }
  if (strikers === 0 && wardens === 0) {
    endRound(state, 'wardens', 'Mutual elimination', null);
  } else if (strikers === 0) {
    endRound(state, 'wardens', 'Attackers eliminated', null);
  } else if (wardens === 0) {
    endRound(state, 'strikers', 'Defenders eliminated', null);
  }
}

export function endRound(state, winner, reason, audio) {
  if (state.phase === 'roundEnd' || state.phase === 'matchEnd') return;
  state.phase = 'roundEnd';
  state.phaseTime = 0;
  state.roundWinner = winner;
  state.roundReason = reason;
  state.scores[winner] += 1;
  const loser = winner === 'strikers' ? 'wardens' : 'strikers';
  if (state.lastWinner === loser) state.lossStreak[loser] += 1;
  else state.lossStreak[loser] = 1;
  state.lastWinner = winner;
  for (const agent of state.agents) {
    if (agent.team === winner) {
      agent.money = Math.min(ECONOMY.maxMoney, agent.money + ECONOMY.winReward);
    } else {
      const bonus = Math.min(ECONOMY.lossBonusMax, ECONOMY.lossReward + (state.lossStreak[loser] - 1) * ECONOMY.lossStreakBonus);
      agent.money = Math.min(ECONOMY.maxMoney, agent.money + bonus);
    }
  }
  feed(state, `${winner === 'strikers' ? 'Strikers' : 'Wardens'} take the round — ${reason}`, winner === state.player.team ? 'win' : 'lose');
  if (audio) {
    if (winner === state.player.team) audio.roundWin();
    else audio.roundLose();
  }
  if (state.scores[winner] >= TIMING.roundsToWin || state.round >= TIMING.maxRounds) {
    state.matchWinner = state.scores.strikers === state.scores.wardens ? null : winner;
    state.pendingMatchEnd = true;
  }
}

export function startRound(state, world, audio) {
  state.round += 1;
  state.phase = 'buy';
  state.phaseTime = 0;
  state.roundTime = 0;
  state.bomb.planted = false;
  state.bomb.dropped = false;
  state.bomb.exploded = false;
  state.bomb.plantProgress = 0;
  state.bomb.defuseProgress = 0;
  state.bomb.site = null;
  state.grenades.length = 0;
  state.smokes.length = 0;
  state.noises.length = 0;
  state.feed.length = 0;
  state.bombBlast = null;
  // Half-time swap: after round 4 the teams switch sides.
  if (state.round === TIMING.halfAt + 1) {
    for (const agent of state.agents) {
      agent.team = agent.team === 'strikers' ? 'wardens' : 'strikers';
    }
    feed(state, 'Half time — sides switch!', 'info');
  }
  for (const agent of state.agents) {
    const spawnList = agent.team === 'strikers' ? world.spawns.attack : world.spawns.defend;
    const spawn = spawnList[agent.index % spawnList.length];
    agent.pos.set(spawn[0], 0, spawn[1]);
    agent.vel.set(0, 0, 0);
    agent.yaw = agent.team === 'strikers' ? -Math.PI * 0.25 : Math.PI * 0.75;
    agent.pitch = 0;
    agent.health = 100;
    agent.alive = true;
    agent.height = MOVEMENT.standHeight;
    agent.eye = MOVEMENT.standEye;
    agent.crouching = false;
    agent.onGround = true;
    agent.scoped = false;
    agent.flashLeft = 0;
    agent.bloom = 0;
    agent.recoilPitch = 0;
    agent.recoilYaw = 0;
    agent.grenades = { frag: 0, smoke: 0, flash: 0 };
    if (!agent.primary) giveWeapon(agent, 'pistol');
    else if (!agent.secondary) giveWeapon(agent, 'pistol');
    // Keep bought weapons between rounds; refill reserve ammo cheaply.
    for (const slot of [agent.primary, agent.secondary]) {
      if (slot) {
        slot.mag = slot.def.mag;
        slot.reserve = slot.def.reserve;
        slot.cooldown = 0;
        slot.reloadLeft = 0;
      }
    }
    agent.activeSlot = agent.primary ? 'primary' : 'secondary';
  }
  assignRoles(state, world);
  for (const agent of state.agents) {
    if (!agent.isPlayer) botBuy(agent, state.rng);
  }
  // Armor persists between rounds until it is shot away.
  feed(state, `Round ${state.round} — ${state.player.team === 'strikers' ? 'Attack: plant the bomb' : 'Defend: hold the sites'}`, 'info');
  if (audio && state.round > 1) audio.buy();
}

export function stepRoundTimer(state, dt, world, audio) {
  state.phaseTime += dt;
  if (state.phase === 'buy') {
    state.roundTime += dt;
    if (state.phaseTime >= TIMING.buyTime) {
      state.phase = 'live';
      state.phaseTime = 0;
      feed(state, 'Go go go!', 'info');
    }
    return;
  }
  if (state.phase === 'live') {
    state.roundTime += dt;
    const limit = TIMING.roundTime;
    if (!state.bomb.planted && state.roundTime >= limit) {
      endRound(state, 'wardens', 'Time expired', audio);
      return;
    }
    stepObjective(state, dt, world, audio);
    stepDefuse(state, dt, world, audio);
    return;
  }
  if (state.phase === 'roundEnd') {
    if (state.phaseTime >= TIMING.roundEndTime) {
      if (state.pendingMatchEnd) {
        state.phase = 'matchEnd';
        state.phaseTime = 0;
      } else {
        startRound(state, world, audio);
      }
    }
  }
}

// ---- Buy menu -------------------------------------------------------------

export const BUY_ITEMS = [
  { kind: 'weapon', key: 'rifle', label: 'AR-7 Carbine', cost: WEAPONS.rifle.cost, hotkey: '1' },
  { kind: 'weapon', key: 'smg', label: 'K-9 Vector SMG', cost: WEAPONS.smg.cost, hotkey: '2' },
  { kind: 'weapon', key: 'shotgun', label: 'M12 Breacher', cost: WEAPONS.shotgun.cost, hotkey: '3' },
  { kind: 'weapon', key: 'sniper', label: 'LR-90 Marksman', cost: WEAPONS.sniper.cost, hotkey: '4' },
  { kind: 'armor', key: 'armor', label: 'Kevlar Armor', cost: ARMOR_PRICE, hotkey: '5' },
  { kind: 'grenade', key: 'frag', label: 'Frag Grenade', cost: GRENADES.frag.cost, hotkey: '6' },
  { kind: 'grenade', key: 'smoke', label: 'Smoke Grenade', cost: GRENADES.smoke.cost, hotkey: '7' },
  { kind: 'grenade', key: 'flash', label: 'Flashbang', cost: GRENADES.flash.cost, hotkey: '8' },
];

export function buyItem(state, item, audio) {
  const player = state.player;
  if (state.phase !== 'buy') return 'Buy time is over';
  if (player.money < item.cost) return 'Not enough money';
  if (item.kind === 'weapon') {
    giveWeapon(player, item.key);
    player.money -= item.cost;
  } else if (item.kind === 'armor') {
    if (player.armor >= ARMOR_POINTS) return 'Armor already full';
    player.armor = ARMOR_POINTS;
    player.money -= item.cost;
  } else if (item.kind === 'grenade') {
    if (player.grenades[item.key] >= 2) return 'Carrying max of those';
    player.grenades[item.key] += 1;
    player.money -= item.cost;
  }
  if (audio) audio.buy();
  return null;
}
