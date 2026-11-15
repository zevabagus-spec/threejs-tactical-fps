// Every sound is synthesized with WebAudio: no audio files, nothing fetched.
// Short noise bursts and oscillators, shaped per weapon, with distance
// attenuation for anything that happens away from the player.
export function createAudio() {
  let ctx = null;
  let master = null;
  let noiseBuffer = null;

  function ensure() {
    if (ctx) {
      if (ctx.state === 'suspended') ctx.resume();
      return true;
    }
    try {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
    } catch {
      return false;
    }
    master = ctx.createGain();
    master.gain.value = 0.5;
    master.connect(ctx.destination);
    const length = ctx.sampleRate * 0.5;
    noiseBuffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = noiseBuffer.getChannelData(0);
    for (let i = 0; i < length; i += 1) data[i] = Math.random() * 2 - 1;
    return true;
  }

  function noise(when, duration, filterFreq, filterType, gainValue, pan = 0) {
    const src = ctx.createBufferSource();
    src.buffer = noiseBuffer;
    src.loop = true;
    const filter = ctx.createBiquadFilter();
    filter.type = filterType;
    filter.frequency.value = filterFreq;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(gainValue, when);
    gain.gain.exponentialRampToValueAtTime(0.001, when + duration);
    const panner = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
    if (panner) {
      panner.pan.value = pan;
      src.connect(filter).connect(gain).connect(panner).connect(master);
    } else {
      src.connect(filter).connect(gain).connect(master);
    }
    src.start(when);
    src.stop(when + duration + 0.05);
  }

  function tone(when, duration, freqFrom, freqTo, gainValue, type = 'sine') {
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(freqFrom, when);
    osc.frequency.exponentialRampToValueAtTime(Math.max(20, freqTo), when + duration);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(gainValue, when);
    gain.gain.exponentialRampToValueAtTime(0.001, when + duration);
    osc.connect(gain).connect(master);
    osc.start(when);
    osc.stop(when + duration + 0.05);
  }

  function attenuation(distance) {
    if (distance == null) return 1;
    return Math.max(0.06, 1 - distance / 55);
  }

  const SHOTS = {
    pistol: { freq: 1400, dur: 0.11, gain: 0.5, thump: 160 },
    rifle: { freq: 1000, dur: 0.13, gain: 0.55, thump: 120 },
    smg: { freq: 1600, dur: 0.09, gain: 0.42, thump: 170 },
    shotgun: { freq: 700, dur: 0.24, gain: 0.7, thump: 85 },
    sniper: { freq: 900, dur: 0.3, gain: 0.7, thump: 70 },
  };

  return {
    unlock() { ensure(); },
    shot(sound, distance) {
      if (!ensure()) return;
      const s = SHOTS[sound] || SHOTS.rifle;
      const t = ctx.currentTime;
      const g = attenuation(distance);
      noise(t, s.dur, s.freq, 'lowpass', s.gain * g);
      tone(t, 0.09, s.thump, 45, 0.4 * g, 'triangle');
    },
    dry(distance) {
      if (!ensure()) return;
      noise(ctx.currentTime, 0.05, 2600, 'highpass', 0.25 * attenuation(distance));
    },
    reload(distance) {
      if (!ensure()) return;
      const t = ctx.currentTime;
      const g = attenuation(distance);
      noise(t, 0.05, 2200, 'bandpass', 0.3 * g);
      noise(t + 0.28, 0.05, 1800, 'bandpass', 0.3 * g);
      noise(t + 0.55, 0.06, 2600, 'bandpass', 0.35 * g);
    },
    hit(kill) {
      if (!ensure()) return;
      tone(ctx.currentTime, 0.07, kill ? 1400 : 1100, kill ? 900 : 950, 0.3, 'square');
    },
    hurt() {
      if (!ensure()) return;
      tone(ctx.currentTime, 0.12, 220, 90, 0.35, 'sawtooth');
    },
    step(distance, running) {
      if (!ensure()) return;
      noise(ctx.currentTime, 0.07, 500, 'lowpass', (running ? 0.16 : 0.08) * attenuation(distance));
    },
    explosion(distance) {
      if (!ensure()) return;
      const t = ctx.currentTime;
      const g = attenuation(distance);
      noise(t, 0.9, 320, 'lowpass', 0.9 * g);
      tone(t, 0.7, 90, 28, 0.7 * g, 'sine');
      noise(t + 0.08, 0.4, 1200, 'bandpass', 0.3 * g);
    },
    beep(urgent) {
      if (!ensure()) return;
      tone(ctx.currentTime, 0.09, urgent ? 1250 : 950, urgent ? 1250 : 950, 0.22, 'square');
    },
    plantTick() {
      if (!ensure()) return;
      tone(ctx.currentTime, 0.05, 1500, 1500, 0.16, 'square');
    },
    flashRing() {
      if (!ensure()) return;
      tone(ctx.currentTime, 1.4, 3200, 2600, 0.1, 'sine');
    },
    smokePop(distance) {
      if (!ensure()) return;
      noise(ctx.currentTime, 0.25, 900, 'lowpass', 0.4 * attenuation(distance));
    },
    bounce(distance) {
      if (!ensure()) return;
      tone(ctx.currentTime, 0.06, 340, 180, 0.2 * attenuation(distance), 'triangle');
    },
    buy() {
      if (!ensure()) return;
      const t = ctx.currentTime;
      tone(t, 0.08, 880, 880, 0.2, 'sine');
      tone(t + 0.08, 0.12, 1320, 1320, 0.2, 'sine');
    },
    roundWin() {
      if (!ensure()) return;
      const t = ctx.currentTime;
      [523, 659, 784, 1046].forEach((f, i) => tone(t + i * 0.11, 0.16, f, f, 0.22, 'triangle'));
    },
    roundLose() {
      if (!ensure()) return;
      const t = ctx.currentTime;
      [392, 330, 262].forEach((f, i) => tone(t + i * 0.14, 0.2, f, f, 0.2, 'triangle'));
    },
    denied() {
      if (!ensure()) return;
      tone(ctx.currentTime, 0.12, 200, 140, 0.25, 'square');
    },
  };
}
