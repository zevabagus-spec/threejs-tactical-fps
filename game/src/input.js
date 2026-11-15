// Keyboard and mouse, with pointer lock. The simulation consumes edge events
// (fresh presses) and the look deltas once per step, then they are cleared.
export function createInput(canvas) {
  const keys = new Set();
  const pressed = new Set();
  const mouse = { left: false, right: false, leftPressed: false, rightPressed: false };
  let lookDX = 0;
  let lookDY = 0;
  let wheel = 0;
  let locked = false;
  let onLockChange = null;
  let onCanvasClick = null;

  function codeOf(e) {
    return e.code;
  }

  window.addEventListener('keydown', (e) => {
    if (e.code === 'Tab') e.preventDefault();
    if (!e.repeat) pressed.add(codeOf(e));
    keys.add(codeOf(e));
  });
  window.addEventListener('keyup', (e) => keys.delete(codeOf(e)));
  window.addEventListener('blur', () => {
    keys.clear();
    mouse.left = false;
    mouse.right = false;
  });
  document.addEventListener('mousemove', (e) => {
    if (!locked) return;
    lookDX += e.movementX;
    lookDY += e.movementY;
  });
  document.addEventListener('mousedown', (e) => {
    if (e.button === 0) { mouse.left = true; mouse.leftPressed = true; }
    if (e.button === 2) { mouse.right = true; mouse.rightPressed = true; }
  });
  document.addEventListener('mouseup', (e) => {
    if (e.button === 0) mouse.left = false;
    if (e.button === 2) mouse.right = false;
  });
  document.addEventListener('contextmenu', (e) => e.preventDefault());
  document.addEventListener('wheel', (e) => { wheel += Math.sign(e.deltaY); }, { passive: true });
  document.addEventListener('pointerlockchange', () => {
    locked = document.pointerLockElement === canvas;
    if (onLockChange) onLockChange(locked);
  });
  canvas.addEventListener('click', () => {
    if (onCanvasClick) onCanvasClick();
  });

  return {
    keys,
    pressed,
    mouse,
    isLocked() { return locked; },
    requestLock() { canvas.requestPointerLock(); },
    exitLock() { document.exitPointerLock(); },
    setOnLockChange(fn) { onLockChange = fn; },
    setOnCanvasClick(fn) { onCanvasClick = fn; },
    consumeLook() {
      const dx = lookDX;
      const dy = lookDY;
      lookDX = 0;
      lookDY = 0;
      return [dx, dy];
    },
    consumeWheel() {
      const w = wheel;
      wheel = 0;
      return w;
    },
    endStep() {
      pressed.clear();
      mouse.leftPressed = false;
      mouse.rightPressed = false;
    },
  };
}
