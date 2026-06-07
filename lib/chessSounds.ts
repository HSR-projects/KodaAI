/**
 * Lightweight, asset-free chess sound effects synthesized with the Web Audio
 * API — a percussive "click" for moves, a heavier thud for captures, beeps for
 * check, and a little flourish at game end. No audio files to ship.
 */

type Ctx = AudioContext & { webkitAudioContext?: never };

let ctx: Ctx | null = null;

function audio(): Ctx | null {
  if (typeof window === "undefined") return null;
  const W = window as unknown as {
    AudioContext?: typeof AudioContext;
    webkitAudioContext?: typeof AudioContext;
  };
  const AC = W.AudioContext || W.webkitAudioContext;
  if (!AC) return null;
  if (!ctx) ctx = new AC() as Ctx;
  if (ctx.state === "suspended") void ctx.resume();
  return ctx;
}

/** Short band-passed white-noise burst — the woody "click" of a piece landing. */
function burst(centerHz: number, durMs: number, gain: number) {
  const ac = audio();
  if (!ac) return;
  const n = Math.floor((ac.sampleRate * durMs) / 1000);
  const buf = ac.createBuffer(1, n, ac.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < n; i++) {
    // White noise with a fast exponential decay envelope.
    data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, 2.2);
  }
  const src = ac.createBufferSource();
  src.buffer = buf;

  const bp = ac.createBiquadFilter();
  bp.type = "bandpass";
  bp.frequency.value = centerHz;
  bp.Q.value = 0.9;

  const g = ac.createGain();
  g.gain.value = gain;

  src.connect(bp).connect(g).connect(ac.destination);
  src.start();
  src.stop(ac.currentTime + durMs / 1000 + 0.02);
}

/** A clean tone (used for check beeps / end flourish). */
function tone(freq: number, durMs: number, gain = 0.18, type: OscillatorType = "sine", delayMs = 0) {
  const ac = audio();
  if (!ac) return;
  const t0 = ac.currentTime + delayMs / 1000;
  const osc = ac.createOscillator();
  const g = ac.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(gain, t0 + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + durMs / 1000);
  osc.connect(g).connect(ac.destination);
  osc.start(t0);
  osc.stop(t0 + durMs / 1000 + 0.02);
}

function thump(freq: number, durMs: number, gain: number) {
  tone(freq, durMs, gain, "sine");
}

export const chessSounds = {
  move() {
    burst(1700, 70, 0.22);
  },
  capture() {
    burst(1100, 95, 0.28);
    thump(150, 90, 0.18);
  },
  castle() {
    burst(1600, 60, 0.2);
    burst(1600, 60, 0.2);
  },
  check() {
    tone(880, 90, 0.16, "triangle");
    tone(1245, 110, 0.16, "triangle", 90);
  },
  win() {
    [523, 659, 784, 1047].forEach((f, i) => tone(f, 160, 0.16, "triangle", i * 90));
  },
  lose() {
    [392, 330, 262].forEach((f, i) => tone(f, 200, 0.16, "sine", i * 120));
  },
  illegal() {
    tone(160, 90, 0.14, "square");
  },
};

export type ChessSoundName = keyof typeof chessSounds;
