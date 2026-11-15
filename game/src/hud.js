// The DOM HUD: health, ammo, money, clock, scores, kill feed, crosshair,
// minimap, buy menu, scoreboard, plant/defuse progress and overlays. It only
// reads state; the one thing it writes is the buy menu's open state.
import { ARMOR_POINTS, GRENADES, TEAMS, TIMING } from './config.js';
import { activeWeapon } from './state.js';
import { BUY_ITEMS, buyItem } from './rounds.js';
import { feedback } from './sim.js';

function $(id) {
  return document.getElementById(id);
}

function fmtTime(seconds) {
  const s = Math.max(0, Math.ceil(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

function fmtMoney(n) {
  return `$${n.toLocaleString('en-US')}`;
}

export function createHUD(world, opts) {
  const el = {};
  for (const id of ['crosshair', 'hitmarker', 'timer', 'round-label', 'score-s', 'score-w',
    'feed', 'health-num', 'health-fill', 'armor-num', 'armor-fill', 'ammo-mag', 'ammo-reserve',
    'weapon-name', 'grenades', 'money', 'minimap', 'buy-menu', 'buy-rows', 'buy-error',
    'scoreboard', 'score-rows', 'objective', 'objective-label', 'objective-fill', 'banner',
    'banner-title', 'banner-sub', 'vignette', 'flash', 'scope', 'hint', 'spectate',
    'menu', 'pause', 'end', 'end-title', 'end-score', 'end-stats', 'bomb-clock', 'alive-s', 'alive-w', 'hud']) {
    el[id] = $(id);
  }
  const mapCtx = el.minimap.getContext('2d');
  const MAP_W = 176;
  const MAP_H = 136;
  const mapX = (x) => ((x + 31) / 62) * MAP_W;
  const mapZ = (z) => ((z + 23) / 46) * MAP_H;

  // Static minimap layer: floor, walls, site markers.
  const staticMap = document.createElement('canvas');
  staticMap.width = MAP_W;
  staticMap.height = MAP_H;
  {
    const c = staticMap.getContext('2d');
    c.fillStyle = 'rgba(16,20,26,0.85)';
    c.fillRect(0, 0, MAP_W, MAP_H);
    c.fillStyle = '#4b5666';
    for (const [x, z, w, d] of world.footprints) {
      c.fillRect(mapX(x), mapZ(z), Math.max(1.5, (w / 62) * MAP_W), Math.max(1.5, (d / 46) * MAP_H));
    }
    c.font = 'bold 13px Arial';
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    for (const key of ['A', 'B']) {
      const site = world.sites[key];
      c.fillStyle = site.color;
      c.globalAlpha = 0.28;
      c.beginPath();
      c.arc(mapX(site.center.x), mapZ(site.center.z), 9, 0, 7);
      c.fill();
      c.globalAlpha = 1;
      c.fillText(key, mapX(site.center.x), mapZ(site.center.z));
    }
    c.fillStyle = '#8b95a1';
    c.font = '9px Arial';
    c.fillText('MID', mapX(0), mapZ(0));
  }

  // Buy menu rows, built once.
  for (const item of BUY_ITEMS) {
    const row = document.createElement('div');
    row.className = 'buy-row';
    row.innerHTML = `<span class="buy-key">${item.hotkey}</span><span class="buy-label">${item.label}</span><span class="buy-cost">${fmtMoney(item.cost)}</span>`;
    row.addEventListener('click', () => {
      if (opts.onBuy) opts.onBuy(item);
    });
    row.dataset.key = item.key;
    el['buy-rows'].appendChild(row);
  }
  const buyRows = [...el['buy-rows'].children];

  let buyOpen = false;
  let buyErrorUntil = 0;
  let lastPhase = 'menu';
  let lastFeedSig = '';
  let lastBannerRound = 0;

  function drawMinimap(state) {
    mapCtx.drawImage(staticMap, 0, 0);
    for (const smoke of state.smokes) {
      mapCtx.fillStyle = 'rgba(200,200,195,0.5)';
      mapCtx.beginPath();
      mapCtx.arc(mapX(smoke.pos.x), mapZ(smoke.pos.z), (smoke.radius / 62) * MAP_W, 0, 7);
      mapCtx.fill();
    }
    const bomb = state.bomb;
    if (bomb.planted || bomb.dropped) {
      mapCtx.fillStyle = bomb.planted ? '#ff4030' : '#f0a830';
      mapCtx.beginPath();
      mapCtx.arc(mapX(bomb.pos.x), mapZ(bomb.pos.z), 3.5, 0, 7);
      mapCtx.fill();
    }
    for (const agent of state.agents) {
      if (!agent.alive || agent.isPlayer) continue;
      if (agent.team !== state.player.team) continue;
      mapCtx.fillStyle = agent.team === 'strikers' ? '#e8722a' : '#3fa7a0';
      mapCtx.beginPath();
      mapCtx.arc(mapX(agent.pos.x), mapZ(agent.pos.z), 2.6, 0, 7);
      mapCtx.fill();
    }
    const p = state.player;
    mapCtx.save();
    mapCtx.translate(mapX(p.pos.x), mapZ(p.pos.z));
    mapCtx.rotate(-p.yaw);
    mapCtx.fillStyle = '#ffffff';
    mapCtx.beginPath();
    mapCtx.moveTo(0, -5);
    mapCtx.lineTo(3.4, 4);
    mapCtx.lineTo(-3.4, 4);
    mapCtx.closePath();
    mapCtx.fill();
    mapCtx.restore();
  }

  function renderFeed(state) {
    const sig = state.feed.map((f) => f.text + f.at).join('|');
    if (sig === lastFeedSig) return;
    lastFeedSig = sig;
    el.feed.innerHTML = '';
    const shown = state.feed.slice(-5).reverse();
    for (const entry of shown) {
      const div = document.createElement('div');
      div.className = `feed-entry ${entry.kind}`;
      div.textContent = entry.text;
      el.feed.appendChild(div);
    }
  }

  function renderScoreboard(state) {
    const rows = [...state.agents].sort((a, b) => {
      if (a.team !== b.team) return a.team === 'strikers' ? -1 : 1;
      return b.kills - a.kills;
    });
    let html = '';
    let lastTeam = '';
    for (const a of rows) {
      if (a.team !== lastTeam) {
        lastTeam = a.team;
        html += `<div class="sb-team" style="color:${TEAMS[a.team].color}">${TEAMS[a.team].name}</div>`;
      }
      html += `<div class="sb-row${a.isPlayer ? ' me' : ''}${a.alive ? '' : ' dead'}">`
        + `<span>${a.name}${a.alive ? '' : ' †'}</span><span>${a.kills}</span><span>${a.deaths}</span><span>${fmtMoney(a.money)}</span></div>`;
    }
    el['score-rows'].innerHTML = html;
  }

  const hud = {
    isBuyOpen() { return buyOpen; },
    toggleBuy() {
      buyOpen = !buyOpen;
      el['buy-menu'].classList.toggle('open', buyOpen);
    },
    closeBuy() {
      buyOpen = false;
      el['buy-menu'].classList.remove('open');
    },
    flashBuyError(msg) {
      el['buy-error'].textContent = msg;
      el['buy-error'].classList.add('show');
      buyErrorUntil = performance.now() + 1400;
    },
    buyItemViaClick(item, state, audio) {
      const error = buyItem(state, item, audio);
      if (error) hud.flashBuyError(error);
    },
    showMenu() { el.menu.classList.remove('hidden'); },
    hideMenu() { el.menu.classList.add('hidden'); },
    showPause() { el.pause.classList.remove('hidden'); },
    hidePause() { el.pause.classList.add('hidden'); },
    showEnd(state) {
      const winner = state.matchWinner;
      el['end-title'].textContent = winner
        ? (winner === state.player.team ? 'VICTORY' : 'DEFEAT')
        : 'DRAW';
      el['end-title'].style.color = !winner ? '#ece7dd' : winner === state.player.team ? '#7dd87d' : '#e5484d';
      el['end-score'].textContent = `${TEAMS.strikers.name} ${state.scores.strikers} — ${state.scores.wardens} ${TEAMS.wardens.name}`;
      const s = state.stats;
      const acc = s.shotsFired > 0 ? Math.round((s.shotsHit / s.shotsFired) * 100) : 0;
      el['end-stats'].textContent = `Kills ${s.kills} · Accuracy ${acc}% · Headshots ${s.headshots} · Plants ${s.plants} · Defuses ${s.defuses}`;
      el.end.classList.remove('hidden');
    },

    update(state, input, ctx, now) {
      const p = state.player;
      const playing = state.phase === 'live' || state.phase === 'buy' || state.phase === 'roundEnd';

      // Clock and scores.
      if (state.phase === 'buy') {
        el.timer.textContent = `BUY ${fmtTime(TIMING.buyTime - state.phaseTime)}`;
        el.timer.className = 'buy-time';
      } else if (state.bomb.planted) {
        el.timer.textContent = fmtTime(state.bomb.timerLeft);
        el.timer.className = 'bomb-time';
      } else {
        el.timer.textContent = fmtTime(TIMING.roundTime - state.roundTime);
        el.timer.className = '';
      }
      el['round-label'].textContent = `ROUND ${Math.max(1, state.round)}/${TIMING.maxRounds} · HALF ${state.round > TIMING.halfAt ? 2 : 1}`;
      el['score-s'].textContent = state.scores.strikers;
      el['score-w'].textContent = state.scores.wardens;
      el['alive-s'].textContent = state.agents.filter((a) => a.team === 'strikers' && a.alive).length;
      el['alive-w'].textContent = state.agents.filter((a) => a.team === 'wardens' && a.alive).length;
      el['bomb-clock'].textContent = state.bomb.planted ? `BOMB @ ${state.bomb.site}` : '';

      // Health, armor, money.
      el['health-num'].textContent = Math.max(0, Math.ceil(p.health));
      el['health-fill'].style.width = `${Math.max(0, p.health)}%`;
      el['health-fill'].style.background = p.health > 50 ? '#7dd87d' : p.health > 25 ? '#f0a830' : '#e5484d';
      el['armor-num'].textContent = Math.ceil(p.armor);
      el['armor-fill'].style.width = `${(p.armor / ARMOR_POINTS) * 100}%`;
      el.money.textContent = fmtMoney(p.money);

      // Weapon readout.
      const weapon = activeWeapon(p);
      const grenadeSlot = ctx.playerController.grenadeSlot;
      if (grenadeSlot) {
        el['weapon-name'].textContent = `${GRENADES[grenadeSlot].name} — click to throw`;
        el['ammo-mag'].textContent = p.grenades[grenadeSlot];
        el['ammo-reserve'].textContent = '';
      } else if (weapon) {
        el['weapon-name'].textContent = weapon.reloadLeft > 0 ? `${weapon.def.name} — reloading…` : weapon.def.name;
        el['ammo-mag'].textContent = weapon.mag;
        el['ammo-reserve'].textContent = `/ ${weapon.reserve}`;
      }
      el.grenades.textContent = `Frag ${p.grenades.frag} · Smoke ${p.grenades.smoke} · Flash ${p.grenades.flash}`;

      // Crosshair gap follows the live spread.
      const gap = Math.max(5, Math.min(40, 5 + (ctx.spreadNow || 0.01) * 700));
      el.crosshair.style.setProperty('--gap', `${gap}px`);
      const showCrosshair = playing && p.alive && !p.scoped && !buyOpen;
      el.crosshair.classList.toggle('hidden', !showCrosshair);
      el.scope.classList.toggle('hidden', !p.scoped);

      // Hit marker.
      const hitAge = state.time - feedback.hitAt;
      const killAge = state.time - feedback.killAt;
      el.hitmarker.classList.toggle('hidden', hitAge > 0.15);
      el.hitmarker.classList.toggle('kill', killAge <= 0.3);
      el.hitmarker.classList.toggle('head', feedback.headshot && hitAge <= 0.15);

      // Overlays.
      const lowHp = p.alive && p.health < 30 ? 0.28 + 0.12 * Math.sin(now * 0.004) : 0;
      el.vignette.style.opacity = Math.min(0.85, state.playerHurtFlash * 0.55 + lowHp).toFixed(2);
      el.flash.style.opacity = Math.min(1, p.flashLeft / GRENADES.flash.blind).toFixed(2);

      // Objective progress bar.
      const bomb = state.bomb;
      let objShow = false;
      let objLabel = '';
      let objFrac = 0;
      if (bomb.plantProgress > 0) {
        objShow = true;
        objLabel = 'PLANTING…';
        objFrac = bomb.plantProgress / TIMING.plantTime;
      } else if (bomb.defuseProgress > 0) {
        objShow = true;
        objLabel = 'DEFUSING…';
        objFrac = bomb.defuseProgress / TIMING.defuseTime;
      }
      el.objective.classList.toggle('hidden', !objShow);
      if (objShow) {
        el['objective-label'].textContent = objLabel;
        el['objective-fill'].style.width = `${Math.min(100, objFrac * 100)}%`;
      }

      // Hints.
      let hint = '';
      if (!p.alive) {
        hint = '';
      } else if (state.phase === 'buy') {
        hint = 'B — buy menu · 1/2 weapons · 4/5/6 grenades';
      } else if (state.playerPlanting) {
        hint = 'Planting… hold still';
      } else if (state.playerDefusing) {
        hint = 'Defusing… hold still';
      } else if (bomb.carrier === p && !bomb.planted) {
        hint = 'You carry the bomb — reach site A or B, hold E to plant';
      } else if (bomb.planted && p.team === 'wardens') {
        hint = `Bomb planted at ${bomb.site} — hold E at the bomb to defuse`;
      }
      el.hint.textContent = hint;

      // Spectate label.
      if (!p.alive && playing) {
        const target = ctx.spectateTarget;
        el.spectate.textContent = target ? `Spectating ${target.name} — back next round` : 'All teammates down';
        el.spectate.classList.remove('hidden');
      } else {
        el.spectate.classList.add('hidden');
      }

      // Round banner.
      if (state.phase === 'roundEnd' && lastPhase !== 'roundEnd') {
        const won = state.roundWinner === p.team;
        el['banner-title'].textContent = won ? 'ROUND WON' : 'ROUND LOST';
        el['banner-title'].style.color = won ? '#7dd87d' : '#e5484d';
        el['banner-sub'].textContent = state.roundReason;
        el.banner.classList.remove('hidden');
        lastBannerRound = state.round;
      }
      if (state.phase !== 'roundEnd' && state.round !== lastBannerRound) {
        el.banner.classList.add('hidden');
      }
      lastPhase = state.phase;

      // Buy menu affordability.
      if (buyOpen) {
        buyRows.forEach((row, i) => {
          row.classList.toggle('poor', p.money < BUY_ITEMS[i].cost);
        });
        if (performance.now() > buyErrorUntil) el['buy-error'].classList.remove('show');
      }

      // Scoreboard while Tab is held.
      const showScores = input.keys.has('Tab') && playing;
      el.scoreboard.classList.toggle('hidden', !showScores);
      if (showScores) renderScoreboard(state);

      renderFeed(state);
      drawMinimap(state);

      // Hide the whole HUD on the menu.
      el.hud.classList.toggle('hidden', state.phase === 'menu');
    },
  };
  return hud;
}
