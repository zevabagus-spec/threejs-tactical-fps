// The player controller: mouse look with recoil, WASD movement, firing,
// reloading, weapon and grenade slots, scoping, and the plant/defuse hold.
// It translates input into the same calls the bots use.
import * as THREE from 'three';
import { MOVEMENT } from './config.js';
import { flatDistance } from './collision.js';
import { groundSpeed, moveBody } from './mover.js';
import { activeWeapon } from './state.js';
import { computeSpread, fireWeapon, startReload } from './weapons.js';
import { throwGrenade } from './grenades.js';
import { siteAt } from './rounds.js';

const SENSITIVITY = 0.0022;
const MAX_PITCH = 1.45;
const tmpEye = new THREE.Vector3();
const tmpDir = new THREE.Vector3();

function lookDirection(yaw, pitch, recoilPitch, recoilYaw, out) {
  const cp = Math.cos(pitch + recoilPitch);
  out.set(
    -Math.sin(yaw + recoilYaw) * cp,
    Math.sin(pitch + recoilPitch),
    -Math.cos(yaw + recoilYaw) * cp);
  return out;
}

export function createPlayerController() {
  let grenadeSlot = null;
  let lastGunSlot = 'secondary';
  let throwCooldown = 0;

  return {
    get grenadeSlot() { return grenadeSlot; },
    step(state, input, dt, ctx) {
      const player = state.player;
      const world = ctx.world;
      throwCooldown = Math.max(0, throwCooldown - dt);
      if (!player.alive) {
        state.playerPlanting = false;
        state.playerDefusing = false;
        player.scoped = false;
        return;
      }
      const playing = state.phase === 'live' || state.phase === 'buy';

      // Look.
      const [dx, dy] = input.consumeLook();
      player.yaw -= dx * SENSITIVITY;
      player.pitch -= dy * SENSITIVITY;
      player.pitch = Math.max(-MAX_PITCH, Math.min(MAX_PITCH, player.pitch));

      // Movement: wish direction in the player's yaw frame.
      const k = input.keys;
      let wx = 0;
      let wz = 0;
      if (playing) {
        if (k.has('KeyW') || k.has('ArrowUp')) wz -= 1;
        if (k.has('KeyS') || k.has('ArrowDown')) wz += 1;
        if (k.has('KeyA') || k.has('ArrowLeft')) wx -= 1;
        if (k.has('KeyD') || k.has('ArrowRight')) wx += 1;
      }
      const sin = Math.sin(player.yaw);
      const cos = Math.cos(player.yaw);
      const wishX = wx * cos + wz * sin;
      const wishZ = wz * cos - wx * sin;
      const wantCrouch = k.has('ControlLeft') || k.has('KeyC');
      const wantJump = input.pressed.has('Space');
      let speed = wantCrouch ? MOVEMENT.crouchSpeed : MOVEMENT.walkSpeed;
      if (k.has('ShiftLeft') || k.has('ShiftRight')) speed = MOVEMENT.sneakSpeed;
      if (player.scoped) speed *= 0.6;
      moveBody(player, wishX, wishZ, speed, wantJump, wantCrouch, dt, world.colliders);

      // Weapon slots.
      const weapon = activeWeapon(player);
      if (input.pressed.has('Digit1') && player.primary) {
        player.activeSlot = 'primary';
        grenadeSlot = null;
      }
      if (input.pressed.has('Digit2')) {
        player.activeSlot = 'secondary';
        grenadeSlot = null;
      }
      if (input.pressed.has('KeyQ')) {
        if (grenadeSlot) {
          grenadeSlot = null;
          player.activeSlot = lastGunSlot;
        } else {
          const next = player.activeSlot === 'primary' ? 'secondary' : 'primary';
          if (player[next]) player.activeSlot = next;
        }
      }
      const wheel = input.consumeWheel();
      if (wheel !== 0 && player.primary) {
        player.activeSlot = player.activeSlot === 'primary' ? 'secondary' : 'primary';
        grenadeSlot = null;
      }
      const grenadeKeys = [['Digit4', 'frag'], ['Digit5', 'smoke'], ['Digit6', 'flash']];
      for (const [code, kind] of grenadeKeys) {
        if (input.pressed.has(code) && player.grenades[kind] > 0) {
          if (!grenadeSlot) lastGunSlot = player.activeSlot;
          grenadeSlot = kind;
        }
      }
      if (grenadeSlot && player.grenades[grenadeSlot] <= 0) {
        grenadeSlot = null;
        player.activeSlot = lastGunSlot;
      }
      if (!grenadeSlot) lastGunSlot = player.activeSlot;

      // Scope: right mouse, sniper only.
      const wantScope = input.mouse.right && weapon && weapon.def.scoped && !grenadeSlot;
      if (player.scoped && (!wantScope || weapon.reloadLeft > 0)) player.scoped = false;
      if (wantScope && weapon.reloadLeft <= 0) player.scoped = true;

      // Reload.
      if (input.pressed.has('KeyR') && !grenadeSlot) {
        if (startReload(player, ctx.audio, player.pos)) player.scoped = false;
      }

      // Fire / throw.
      tmpEye.copy(player.pos);
      tmpEye.y += player.eye;
      lookDirection(player.yaw, player.pitch, player.recoilPitch, player.recoilYaw, tmpDir);
      if (playing && input.mouse.left) {
        if (grenadeSlot) {
          if (input.mouse.leftPressed && throwCooldown <= 0) {
            const thrown = throwGrenade(state, player, grenadeSlot, tmpEye, tmpDir, 16);
            if (thrown) {
              throwCooldown = 0.4;
              ctx.viewmodel.kick(0.05);
            }
          }
        } else if (weapon) {
          const trigger = weapon.def.auto ? true : input.mouse.leftPressed;
          if (trigger) {
            if (weapon.mag <= 0 && weapon.reloadLeft <= 0) {
              startReload(player, ctx.audio, player.pos);
              ctx.audio.dry(null);
            } else {
              const result = fireWeapon(state, player, tmpEye, tmpDir, ctx.meshes, ctx.effects, ctx.audio, ctx.onDamage);
              if (result) {
                ctx.viewmodel.kick(weapon.def.recoil * 1.6);
                if (result.hit) ctx.feedback.hit(state, result);
              }
            }
          }
        }
      }

      // Plant / defuse hold: E, standing still.
      const still = groundSpeed(player) < 1.5;
      const bomb = state.bomb;
      state.playerPlanting = false;
      state.playerDefusing = false;
      if (playing && k.has('KeyE') && still) {
        if (bomb.carrier === player && !bomb.planted && siteAt(player.pos, world)) {
          state.playerPlanting = true;
        } else if (bomb.planted && player.team === 'wardens' && flatDistance(player.pos, bomb.pos) < 1.6) {
          state.playerDefusing = true;
        }
      }

      // Keep the view model on the right weapon.
      const modelKey = grenadeSlot ? 'grenade' : weapon ? weapon.key : 'pistol';
      ctx.viewmodel.setWeapon(modelKey);
      ctx.spreadNow = weapon ? computeSpread(player, weapon.def, groundSpeed(player), player.scoped) : 0.01;
    },
  };
}
