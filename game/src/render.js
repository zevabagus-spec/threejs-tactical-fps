// Rendering: the renderer, the scene background and fog, and the per-frame
// camera sync — first-person view with recoil and bob, a menu orbit, and the
// spectate camera after death. It reads state and never writes game truth.
import * as THREE from 'three';
import { PALETTE } from './config.js';
import { groundSpeed } from './mover.js';

export function createRenderer(canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.06;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(PALETTE.sky);
  scene.fog = new THREE.Fog(new THREE.Color(PALETTE.fog), 55, 135);

  const camera = new THREE.PerspectiveCamera(74, window.innerWidth / window.innerHeight, 0.05, 320);
  camera.rotation.order = 'YXZ';
  scene.add(camera);

  let bobPhase = 0;
  let shakeAmp = 0;
  let lastBlastAt = -99;
  let deadYaw = 0;
  let fov = 74;
  let debugGroup = null;

  function pickSpectateTarget(state) {
    const player = state.player;
    for (const agent of state.agents) {
      if (agent.team === player.team && agent.alive && !agent.isPlayer) return agent;
    }
    return null;
  }

  return {
    renderer,
    scene,
    camera,
    resize() {
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(window.innerWidth, window.innerHeight);
    },
    setDebugPaths(world, on) {
      if (debugGroup) {
        scene.remove(debugGroup);
        debugGroup = null;
      }
      if (!on) return;
      debugGroup = new THREE.Group();
      const positions = [];
      for (let i = 0; i < world.adjacency.length; i += 1) {
        for (const j of world.adjacency[i]) {
          if (j <= i) continue;
          positions.push(world.waypoints[i].x, 0.25, world.waypoints[i].z);
          positions.push(world.waypoints[j].x, 0.25, world.waypoints[j].z);
        }
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(positions), 3));
      debugGroup.add(new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ color: 0x39ff88 })));
      scene.add(debugGroup);
    },
    syncCamera(state, ctx, dt, time) {
      const player = state.player;
      if (state.bombBlast && state.bombBlast.at !== lastBlastAt) {
        lastBlastAt = state.bombBlast.at;
        const dist = player.pos.distanceTo(state.bombBlast.pos);
        shakeAmp = Math.max(shakeAmp, Math.max(0, 1 - dist / 30) * 0.09);
      }
      shakeAmp = Math.max(0, shakeAmp - dt * 0.12);

      if (state.phase === 'menu') {
        const a = time * 0.07;
        camera.position.set(Math.cos(a) * 27, 13, Math.sin(a) * 27);
        camera.lookAt(0, 0.5, 0);
        if (Math.abs(fov - 60) > 0.01) {
          fov = 60;
          camera.fov = fov;
          camera.updateProjectionMatrix();
        }
        ctx.spectateTarget = null;
        return;
      }

      let targetFov = 74;
      if (player.alive) {
        const speed = groundSpeed(player);
        bobPhase += dt * (2 + speed * 1.7);
        const bob = Math.min(1, speed / 5) * 0.016;
        camera.position.set(player.pos.x, player.pos.y + player.eye + Math.sin(bobPhase * 2) * bob, player.pos.z);
        camera.rotation.set(player.pitch + player.recoilPitch, player.yaw + player.recoilYaw, 0);
        if (player.scoped) {
          const weapon = player.activeSlot === 'primary' ? player.primary : player.secondary;
          targetFov = weapon && weapon.def.zoomFov ? weapon.def.zoomFov : 74;
        }
        deadYaw = player.yaw;
        ctx.spectateTarget = null;
      } else {
        const target = pickSpectateTarget(state);
        ctx.spectateTarget = target;
        if (target) {
          camera.position.set(target.pos.x, target.pos.y + target.eye, target.pos.z);
          camera.rotation.set(target.pitch, target.yaw, 0);
        } else {
          deadYaw += dt * 0.12;
          camera.position.set(player.pos.x, player.pos.y + player.eye, player.pos.z);
          camera.rotation.set(0, deadYaw, 0);
        }
      }
      if (shakeAmp > 0) {
        camera.rotation.x += (Math.random() - 0.5) * shakeAmp;
        camera.rotation.y += (Math.random() - 0.5) * shakeAmp;
      }
      if (Math.abs(fov - targetFov) > 0.05) {
        fov += (targetFov - fov) * Math.min(1, dt * 16);
        camera.fov = fov;
        camera.updateProjectionMatrix();
      }
    },
    render() {
      renderer.render(scene, camera);
    },
  };
}
