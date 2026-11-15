// EMBERLINE — one file of tuning. Every number the game balances on lives here:
// the palette, the weapons, the grenades, the economy and the round timings.
// No other module hardcodes a balance number.
export const PALETTE = {
  sky: '#232f3d',
  fog: '#2c3542',
  ground: '#8a7d6b',
  concrete: '#9a938a',
  sandstone: '#a89880',
  darkWall: '#5d564c',
  rust: '#b4622d',
  teal: '#3e7d7a',
  crateWood: '#7d6248',
  barrelRed: '#8e3b2f',
  ink: '#ece7dd',
  muted: '#9aa3ab',
  gold: '#f0a830',
  danger: '#e5484d',
  striker: '#e8722a',
  warden: '#3fa7a0',
  siteA: '#e8b13c',
  siteB: '#4aa3df',
};

export const TEAMS = {
  strikers: { name: 'STRIKERS', color: PALETTE.striker, side: 'attack' },
  wardens: { name: 'WARDENS', color: PALETTE.warden, side: 'defend' },
};

// Callsigns. The player is always "You"; the nine bots take these in order.
export const BOT_NAMES = {
  strikers: ['Rook', 'Havoc', 'Mira', 'Sable'],
  wardens: ['Bastion', 'Kestrel', 'Onyx', 'Peregrine', 'Tarn'],
};

// damage: base torso damage at close range. falloff: [startM, endM, minMult].
// spread: radians of cone at rest; moveSpread: added at full speed; bloom:
// added per shot, decaying exponentially at bloomDecay per second; recoil:
// pitch kick per shot in radians.
export const WEAPONS = {
  pistol: {
    key: 'pistol', name: 'P9 Sidearm', slot: 'secondary', cost: 0,
    damage: 26, headMult: 3, legMult: 0.75, pellets: 1, rpm: 350, auto: false,
    mag: 12, reserve: 48, reload: 1.4, spread: 0.004, moveSpread: 0.02,
    bloom: 0.004, bloomDecay: 2.4, recoil: 0.011, falloff: [12, 34, 0.6],
    range: 90, sound: 'pistol',
  },
  rifle: {
    key: 'rifle', name: 'AR-7 Carbine', slot: 'primary', cost: 2700,
    damage: 27, headMult: 3, legMult: 0.75, pellets: 1, rpm: 600, auto: true,
    mag: 30, reserve: 90, reload: 2.1, spread: 0.006, moveSpread: 0.03,
    bloom: 0.005, bloomDecay: 2.2, recoil: 0.014, falloff: [18, 46, 0.65],
    range: 110, sound: 'rifle',
  },
  smg: {
    key: 'smg', name: 'K-9 Vector', slot: 'primary', cost: 1500,
    damage: 22, headMult: 2.6, legMult: 0.75, pellets: 1, rpm: 800, auto: true,
    mag: 32, reserve: 96, reload: 1.8, spread: 0.01, moveSpread: 0.026,
    bloom: 0.004, bloomDecay: 2.6, recoil: 0.01, falloff: [10, 30, 0.5],
    range: 80, sound: 'smg',
  },
  shotgun: {
    key: 'shotgun', name: 'M12 Breacher', slot: 'primary', cost: 1200,
    damage: 9, headMult: 2, legMult: 0.7, pellets: 8, rpm: 70, auto: false,
    mag: 6, reserve: 24, reload: 2.6, spread: 0.045, moveSpread: 0.03,
    bloom: 0.01, bloomDecay: 1.8, recoil: 0.05, falloff: [6, 18, 0.25],
    range: 45, sound: 'shotgun',
  },
  sniper: {
    key: 'sniper', name: 'LR-90 Marksman', slot: 'primary', cost: 4500,
    damage: 95, headMult: 2, legMult: 0.8, pellets: 1, rpm: 48, auto: false,
    mag: 5, reserve: 15, reload: 3.1, spread: 0.0006, moveSpread: 0.09,
    bloom: 0.02, bloomDecay: 1.6, recoil: 0.055, falloff: [30, 90, 0.85],
    range: 160, sound: 'sniper', scoped: true, zoomFov: 26,
  },
};

export const GRENADES = {
  frag: { key: 'frag', name: 'Frag Grenade', cost: 300, fuse: 2.1, radius: 7, maxDamage: 120 },
  smoke: { key: 'smoke', name: 'Smoke Grenade', cost: 300, fuse: 1.4, radius: 4.2, duration: 18 },
  flash: { key: 'flash', name: 'Flashbang', cost: 250, fuse: 1.6, radius: 22, blind: 2.6 },
};

export const ARMOR_PRICE = 650;
export const ARMOR_POINTS = 100;

export const ECONOMY = {
  startMoney: 800,
  maxMoney: 9000,
  killReward: 300,
  winReward: 1400,
  lossReward: 1000,
  lossStreakBonus: 500,
  lossBonusMax: 2500,
  plantReward: 300,
  defuseReward: 300,
};

export const TIMING = {
  buyTime: 12,
  roundTime: 100,
  bombTime: 35,
  plantTime: 3,
  defuseTime: 5,
  roundEndTime: 4.5,
  roundsToWin: 5,
  maxRounds: 9,
  halfAt: 4,
};

export const MOVEMENT = {
  radius: 0.34,
  standHeight: 1.72,
  crouchHeight: 1.12,
  standEye: 1.6,
  crouchEye: 1.02,
  walkSpeed: 5.0,
  sneakSpeed: 2.5,
  crouchSpeed: 2.3,
  groundAccel: 42,
  airAccel: 9,
  friction: 9,
  gravity: 20,
  jumpSpeed: 6.1,
  maxFall: 30,
};

export const COMBAT = {
  armorAbsorb: 0.5,
};

export const BOT = {
  reactionMin: 0.34,
  reactionMax: 0.62,
  visionRange: 48,
  visionConeCos: 0.5,
  thinkInterval: 0.12,
  walkSpeed: 4.6,
};

export const FIXED_STEP = 1 / 60;
