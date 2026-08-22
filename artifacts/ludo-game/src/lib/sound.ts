/**
 * Sound engine for Ludo Legend.
 *
 * Sound effects (dice rolling, a token stepping forward, a capture, reaching
 * home, winning, UI clicks, fireworks) are SYNTHESIZED at runtime with the
 * Web Audio API — no assets to ship for those, works instantly offline.
 *
 * The background music is a real audio file (public/audio/pocket-playground.mp3),
 * played through an HTMLAudioElement that's routed into the same Web Audio
 * graph as everything else (via createMediaElementSource), so the single
 * mute control and limiter apply uniformly to both.
 */

const MUTE_KEY = 'ludo-legend:muted';

class SoundEngine {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private muted = false;
  private bgmAudioEl: HTMLAudioElement | null = null;
  private bgmGain: GainNode | null = null;
  private bgmPlaying = false;
  // While true, startBGM() is a no-op — used so the app-wide "start BGM on
  // any click" convenience listener can't accidentally resurrect the menu
  // theme mid-match (e.g. the very click that rolls the dice).
  private gameplayActive = false;

  constructor() {
    if (typeof window !== 'undefined') {
      try {
        this.muted = window.localStorage.getItem(MUTE_KEY) === '1';
      } catch {
        this.muted = false;
      }
    }
  }

  /** Must be called from inside a user-gesture handler (click/tap) — browsers block audio otherwise. */
  unlock(): void {
    if (typeof window === 'undefined') return;
    if (!this.ctx) {
      const Ctor = window.AudioContext || (window as any).webkitAudioContext;
      if (!Ctor) return;
      this.ctx = new Ctor();
      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.value = this.muted ? 0 : 1;
      // A limiter on the master bus so effects can be pushed loud without
      // harsh digital clipping when several sounds overlap (e.g. dice
      // rattle + a step blip at the same time).
      const limiter = this.ctx.createDynamicsCompressor();
      limiter.threshold.value = -4;
      limiter.knee.value = 10;
      limiter.ratio.value = 8;
      limiter.attack.value = 0.002;
      limiter.release.value = 0.15;
      this.masterGain.connect(limiter);
      limiter.connect(this.ctx.destination);

      // Real BGM file, routed through its own gain (for smooth fade in/out)
      // into the same master chain as every synthesized effect, so the one
      // mute control and limiter apply to it too.
      this.bgmAudioEl = new Audio('/audio/pocket-playground.mp3');
      this.bgmAudioEl.loop = true;
      this.bgmAudioEl.preload = 'auto';
      this.bgmGain = this.ctx.createGain();
      this.bgmGain.gain.value = 0;
      const mediaSource = this.ctx.createMediaElementSource(this.bgmAudioEl);
      mediaSource.connect(this.bgmGain).connect(this.masterGain);
    }
    if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
  }

  isMuted(): boolean {
    return this.muted;
  }

  setMuted(next: boolean): void {
    this.muted = next;
    if (this.masterGain && this.ctx) {
      const now = this.ctx.currentTime;
      this.masterGain.gain.cancelScheduledValues(now);
      this.masterGain.gain.linearRampToValueAtTime(next ? 0 : 1, now + 0.08);
    }
    try {
      window.localStorage.setItem(MUTE_KEY, next ? '1' : '0');
    } catch {
      // ignore (private browsing etc.)
    }
    if (next) this.stopBGM();
  }

  toggleMuted(): boolean {
    this.setMuted(!this.muted);
    return this.muted;
  }

  /** Mark whether a match is actively in progress — while true, startBGM() is suppressed entirely. */
  setGameplayActive(active: boolean): void {
    this.gameplayActive = active;
    if (active) this.stopBGM();
  }

  // ── Low-level helpers ───────────────────────────────────────────────────────
  private now(): number {
    return this.ctx?.currentTime ?? 0;
  }

  private tone(
    freq: number,
    startOffset: number,
    duration: number,
    opts: { type?: OscillatorType; gain?: number; glideTo?: number; attack?: number } = {},
  ): void {
    if (!this.ctx || !this.masterGain || this.muted) return;
    const { type = 'sine', gain = 0.32, glideTo, attack = 0.005 } = opts;
    const t0 = this.now() + startOffset;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (glideTo !== undefined) osc.frequency.exponentialRampToValueAtTime(Math.max(1, glideTo), t0 + duration);
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(gain, t0 + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);
    osc.connect(g).connect(this.masterGain);
    osc.start(t0);
    osc.stop(t0 + duration + 0.02);
  }

  private noiseBurst(startOffset: number, duration: number, opts: { gain?: number; filterFreq?: number } = {}): void {
    if (!this.ctx || !this.masterGain || this.muted) return;
    const { gain = 0.26, filterFreq = 2200 } = opts;
    const t0 = this.now() + startOffset;
    const bufferSize = Math.max(1, Math.floor(this.ctx.sampleRate * duration));
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;

    const src = this.ctx.createBufferSource();
    src.buffer = buffer;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = filterFreq;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(gain, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);

    src.connect(filter).connect(g).connect(this.masterGain);
    src.start(t0);
    src.stop(t0 + duration + 0.02);
  }

  /** Bright bell/glockenspiel-style hit — fast attack, quick shimmering decay. Used for the BGM melody. */
  private bell(freq: number, startOffset: number, duration: number, gain = 0.2): void {
    if (!this.ctx || !this.masterGain || this.muted) return;
    const t0 = this.now() + startOffset;

    const fundamental = this.ctx.createOscillator();
    const gFund = this.ctx.createGain();
    fundamental.type = 'triangle';
    fundamental.frequency.value = freq;
    gFund.gain.setValueAtTime(0, t0);
    gFund.gain.linearRampToValueAtTime(gain, t0 + 0.006);
    gFund.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);
    fundamental.connect(gFund).connect(this.masterGain);
    fundamental.start(t0);
    fundamental.stop(t0 + duration + 0.02);

    // Bright inharmonic-ish overtone (×2.76, not a clean octave) for that
    // metallic bell/glock "shimmer" character, decaying faster than the body.
    const overtone = this.ctx.createOscillator();
    const gOver = this.ctx.createGain();
    overtone.type = 'sine';
    overtone.frequency.value = freq * 2.76;
    gOver.gain.setValueAtTime(0, t0);
    gOver.gain.linearRampToValueAtTime(gain * 0.5, t0 + 0.004);
    gOver.gain.exponentialRampToValueAtTime(0.0001, t0 + duration * 0.45);
    overtone.connect(gOver).connect(this.masterGain);
    overtone.start(t0);
    overtone.stop(t0 + duration * 0.45 + 0.02);
  }

  /** Low punchy thump — the "kick" for the BGM's festive rhythm section. */
  private kick(startOffset: number, gain = 0.3): void {
    if (!this.ctx || !this.masterGain || this.muted) return;
    const t0 = this.now() + startOffset;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(150, t0);
    osc.frequency.exponentialRampToValueAtTime(45, t0 + 0.11);
    g.gain.setValueAtTime(gain, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.13);
    osc.connect(g).connect(this.masterGain);
    osc.start(t0);
    osc.stop(t0 + 0.15);
  }

  /** Crisp snap — the "snare/clap" accent for the BGM's rhythm section. */
  private snare(startOffset: number, gain = 0.22): void {
    this.noiseBurst(startOffset, 0.09, { gain, filterFreq: 2000 });
    this.tone(220, startOffset, 0.05, { type: 'triangle', gain: gain * 0.4 });
  }

  // ── Sound effects ───────────────────────────────────────────────────────────

  /** Short percussive tick — any button/menu tap. */
  playClick(): void {
    this.noiseBurst(0, 0.035, { gain: 0.24, filterFreq: 3200 });
    this.tone(1400, 0, 0.03, { type: 'square', gain: 0.1 });
  }

  /** ~800ms clattering rattle for the dice roll. */
  playDiceRoll(): void {
    const hits = 9;
    for (let i = 0; i < hits; i++) {
      const t = (i / hits) * 0.75 * (0.6 + Math.random() * 0.4);
      this.noiseBurst(t, 0.05, { gain: 0.29, filterFreq: 1800 + Math.random() * 1600 });
      this.tone(500 + Math.random() * 700, t, 0.04, { type: 'triangle', gain: 0.15 });
    }
    // final settle "thud"
    this.noiseBurst(0.78, 0.09, { gain: 0.34, filterFreq: 700 });
  }

  /** Soft blip for a single token hop forward. */
  playTokenStep(): void {
    this.tone(620, 0, 0.075, { type: 'triangle', gain: 0.26, glideTo: 720 });
  }

  /** A token gets captured ("eaten") and sent home. */
  playCapture(): void {
    this.noiseBurst(0, 0.16, { gain: 0.42, filterFreq: 1200 });
    this.tone(420, 0, 0.28, { type: 'sawtooth', gain: 0.32, glideTo: 90 });
  }

  /** A token safely reaches Home. */
  playTokenHome(): void {
    [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => {
      this.tone(f, i * 0.07, 0.22, { type: 'triangle', gain: 0.34 });
    });
  }

  /** Punchy fanfare (~2s) for the "Game Start!" moment. */
  playGameStart(): void {
    this.kick(0, 0.46);
    this.bell(523.25, 0.02, 0.24, 0.28);    // C5
    this.bell(659.25, 0.16, 0.24, 0.3);     // E5
    this.bell(783.99, 0.3, 0.24, 0.33);     // G5
    this.kick(0.44, 0.4);
    this.snare(0.44, 0.24);
    this.bell(1046.5, 0.46, 0.55, 0.42);    // C6 — the big "GO" hit
    this.noiseBurst(0.46, 0.4, { gain: 0.24, filterFreq: 5000 }); // bright shimmer/crash

    // A quick triumphant flourish trailing off, so the fanfare has some
    // body across the full banner instead of going silent early.
    [1046.5, 1174.66, 1318.51].forEach((f, i) => {
      this.bell(f, 0.9 + i * 0.13, 0.35, 0.24);
    });
    this.kick(0.9, 0.32);
  }

  /** Rocket launch whoosh — rising pitch as it climbs toward the burst point. */
  playFireworkLaunch(): void {
    this.tone(260, 0, 0.5, { type: 'sine', gain: 0.14, glideTo: 820 });
    this.noiseBurst(0, 0.5, { gain: 0.08, filterFreq: 2200 });
  }

  /** The burst itself — crackly pop, once the rocket reaches its target. */
  playFirework(): void {
    this.noiseBurst(0, 0.22, { gain: 0.32, filterFreq: 3200 + Math.random() * 2500 });
    this.tone(1200 + Math.random() * 600, 0.01, 0.12, { type: 'square', gain: 0.08 });
  }
  /** Winning the whole match. */
  playWin(): void {
    const notes = [523.25, 659.25, 783.99, 1046.5, 783.99, 1046.5, 1318.5];
    notes.forEach((f, i) => {
      this.tone(f, i * 0.12, 0.35, { type: 'triangle', gain: 0.36 });
      this.tone(f * 2, i * 0.12, 0.3, { type: 'sine', gain: 0.15 });
    });
  }

  // ── Background ambience ───────────────────────────────────────────────────────
  /** The main menu/lobby/gameplay theme — loops continuously, faded in smoothly. */
  startBGM(): void {
    if (this.bgmPlaying || this.muted || this.gameplayActive || !this.ctx || !this.masterGain || !this.bgmAudioEl || !this.bgmGain) return;
    this.bgmPlaying = true;

    const t0 = this.now();
    this.bgmGain.gain.cancelScheduledValues(t0);
    this.bgmGain.gain.setValueAtTime(this.bgmGain.gain.value, t0);
    this.bgmGain.gain.linearRampToValueAtTime(0.55, t0 + 1.2);

    this.bgmAudioEl.play().catch(() => {
      // Autoplay was blocked (no user gesture yet) — startBGM() will be
      // retried on the next real interaction, same as before.
      this.bgmPlaying = false;
    });
  }

  stopBGM(): void {
    if (!this.bgmPlaying) return;
    this.bgmPlaying = false;
    if (this.ctx && this.bgmGain) {
      const t0 = this.now();
      this.bgmGain.gain.cancelScheduledValues(t0);
      this.bgmGain.gain.setValueAtTime(this.bgmGain.gain.value, t0);
      this.bgmGain.gain.linearRampToValueAtTime(0, t0 + 0.4);
    }
    // Pause a beat after the fade-out finishes so it doesn't cut off mid-fade.
    setTimeout(() => {
      if (!this.bgmPlaying) this.bgmAudioEl?.pause();
    }, 420);
  }
}

export const sound = new SoundEngine();
