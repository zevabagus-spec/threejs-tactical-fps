// One movement body, shared by the player and every bot: acceleration,
// friction, gravity, crouch and jump, resolved one axis at a time against the
// world's colliders so a wall never swallows a body. The caller supplies the
// wish direction and the speed; this module owns the physics.
import { MOVEMENT } from './config.js';
import { overlapsAny } from './collision.js';

export function moveBody(body, wishX, wishZ, speed, wantJump, wantCrouch, dt, colliders) {
  if (wantCrouch && !body.crouching) {
    body.crouching = true;
    body.height = MOVEMENT.crouchHeight;
  } else if (!wantCrouch && body.crouching) {
    const blocked = overlapsAny(colliders, body.pos.x, body.pos.y, body.pos.z, MOVEMENT.radius, MOVEMENT.standHeight, 0.02);
    if (!blocked) {
      body.crouching = false;
      body.height = MOVEMENT.standHeight;
    }
  }
  const eyeTarget = body.crouching ? MOVEMENT.crouchEye : MOVEMENT.standEye;
  body.eye += (eyeTarget - body.eye) * Math.min(1, dt * 12);

  const wishLen = Math.hypot(wishX, wishZ);
  const nx = wishLen > 0 ? wishX / wishLen : 0;
  const nz = wishLen > 0 ? wishZ / wishLen : 0;
  const accel = body.onGround ? MOVEMENT.groundAccel : MOVEMENT.airAccel;
  const blend = Math.min(1, (accel * dt) / Math.max(speed, 0.001));
  body.vel.x += (nx * speed - body.vel.x) * blend;
  body.vel.z += (nz * speed - body.vel.z) * blend;
  if (body.onGround && wishLen === 0) {
    const damp = Math.max(0, 1 - MOVEMENT.friction * dt);
    body.vel.x *= damp;
    body.vel.z *= damp;
  }

  if (wantJump && body.onGround) {
    body.vel.y = MOVEMENT.jumpSpeed;
    body.onGround = false;
  }
  body.vel.y -= MOVEMENT.gravity * dt;
  if (body.vel.y < -MOVEMENT.maxFall) body.vel.y = -MOVEMENT.maxFall;

  const nextX = body.pos.x + body.vel.x * dt;
  if (!overlapsAny(colliders, nextX, body.pos.y, body.pos.z, MOVEMENT.radius, body.height, 0.04)) {
    body.pos.x = nextX;
  } else {
    body.vel.x = 0;
  }
  const nextZ = body.pos.z + body.vel.z * dt;
  if (!overlapsAny(colliders, body.pos.x, body.pos.y, nextZ, MOVEMENT.radius, body.height, 0.04)) {
    body.pos.z = nextZ;
  } else {
    body.vel.z = 0;
  }

  body.pos.y += body.vel.y * dt;
  body.onGround = false;
  const hit = overlapsAny(colliders, body.pos.x, body.pos.y, body.pos.z, MOVEMENT.radius, body.height, 0);
  if (hit && body.vel.y <= 0) {
    body.pos.y = hit.max.y;
    body.vel.y = 0;
    body.onGround = true;
  } else if (hit) {
    body.pos.y = hit.min.y - body.height;
    body.vel.y = 0;
  }
  if (body.pos.y < 0) {
    body.pos.y = 0;
    body.vel.y = 0;
    body.onGround = true;
  }
}

export function groundSpeed(body) {
  return Math.hypot(body.vel.x, body.vel.z);
}
