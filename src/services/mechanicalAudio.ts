const AUDIO_PREFS_STORAGE_KEY = 'aman_mechanical_audio_prefs_v1';

export interface MechanicalAudioConfig {
  enabled: boolean;
  volume: number; // 0..100
}

const DEFAULT_AUDIO_CONFIG: MechanicalAudioConfig = {
  enabled: true,
  volume: 45,
};

function clampVolume(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_AUDIO_CONFIG.volume;
  return Math.max(0, Math.min(100, Math.round(value)));
}

function loadStoredConfig(): MechanicalAudioConfig {
  if (typeof window === 'undefined') {
    return { ...DEFAULT_AUDIO_CONFIG };
  }
  try {
    const raw = window.localStorage.getItem(AUDIO_PREFS_STORAGE_KEY);
    if (!raw) return { ...DEFAULT_AUDIO_CONFIG };
    const parsed = JSON.parse(raw) as Partial<MechanicalAudioConfig>;
    return {
      enabled: typeof parsed.enabled === 'boolean' ? parsed.enabled : true,
      volume:
        typeof parsed.volume === 'number'
          ? clampVolume(parsed.volume)
          : DEFAULT_AUDIO_CONFIG.volume,
    };
  } catch {
    return { ...DEFAULT_AUDIO_CONFIG };
  }
}

let currentConfig: MechanicalAudioConfig = loadStoredConfig();
let audioContext: AudioContext | null = null;
let masterOutputNode: GainNode | null = null;
let noiseBufferShort: AudioBuffer | null = null;
let noiseBufferWarm: AudioBuffer | null = null;
let activeKeyboardSettle: { gain: GainNode; at: number } | null = null;
let lastDetentScheduledAt = 0;

export function getMechanicalAudioConfig(): MechanicalAudioConfig {
  return { ...currentConfig };
}

export function setMechanicalAudioConfig(next: Partial<MechanicalAudioConfig>): MechanicalAudioConfig {
  currentConfig = {
    enabled: typeof next.enabled === 'boolean' ? next.enabled : currentConfig.enabled,
    volume: typeof next.volume === 'number' ? clampVolume(next.volume) : currentConfig.volume,
  };

  if (typeof window !== 'undefined') {
    try {
      window.localStorage.setItem(AUDIO_PREFS_STORAGE_KEY, JSON.stringify(currentConfig));
    } catch {
      // Ignore storage quota or private-mode restrictions
    }
  }

  return { ...currentConfig };
}

export function isMechanicalSoundEnabled(): boolean {
  return currentConfig.enabled && currentConfig.volume > 0;
}

export function getAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (!audioContext) {
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return null;
    audioContext = new AudioCtx({ latencyHint: 'interactive' });
  }
  return audioContext;
}

function getMasterOutput(ctx: AudioContext): AudioNode {
  if (masterOutputNode && masterOutputNode.context === ctx) {
    return masterOutputNode;
  }

  const limiter = ctx.createDynamicsCompressor();
  limiter.threshold.setValueAtTime(-9, ctx.currentTime);
  limiter.knee.setValueAtTime(6, ctx.currentTime);
  limiter.ratio.setValueAtTime(4, ctx.currentTime);
  limiter.attack.setValueAtTime(0.0015, ctx.currentTime);
  limiter.release.setValueAtTime(0.06, ctx.currentTime);

  const master = ctx.createGain();
  master.gain.setValueAtTime(1, ctx.currentTime);
  master.connect(limiter);
  limiter.connect(ctx.destination);
  masterOutputNode = master;
  return master;
}

function getShortNoiseBuffer(ctx: AudioContext): AudioBuffer {
  if (noiseBufferShort && noiseBufferShort.sampleRate === ctx.sampleRate) {
    return noiseBufferShort;
  }
  const length = Math.max(1, Math.floor(ctx.sampleRate * 0.16));
  const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
  const channel = buffer.getChannelData(0);
  for (let i = 0; i < length; i++) {
    channel[i] = Math.random() * 2 - 1;
  }
  noiseBufferShort = buffer;
  return buffer;
}

function getWarmNoiseBuffer(ctx: AudioContext): AudioBuffer {
  if (noiseBufferWarm && noiseBufferWarm.sampleRate === ctx.sampleRate) {
    return noiseBufferWarm;
  }
  const length = Math.max(1, Math.floor(ctx.sampleRate * 0.22));
  const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
  const channel = buffer.getChannelData(0);
  let lastOut = 0;
  for (let i = 0; i < length; i++) {
    const white = Math.random() * 2 - 1;
    lastOut = (lastOut + 0.12 * white) / 1.12;
    channel[i] = lastOut * 2.4;
  }
  noiseBufferWarm = buffer;
  return buffer;
}

function getVolumeScale(): number {
  return clampVolume(currentConfig.volume) / 100;
}

function vary(base: number, pct = 0.04): number {
  return base * (1 + (Math.random() * 2 - 1) * pct);
}

function panForWheel(wheelIndex?: number): number {
  if (typeof wheelIndex !== 'number' || !Number.isFinite(wheelIndex)) return 0;
  const clamped = Math.max(0, Math.min(5, wheelIndex));
  return ((clamped / 5) * 2 - 1) * 0.36;
}

function createDestWithPan(ctx: AudioContext, pan = 0): AudioNode {
  const master = getMasterOutput(ctx);
  if (Math.abs(pan) < 0.01 || typeof ctx.createStereoPanner !== 'function') {
    return master;
  }
  const panner = ctx.createStereoPanner();
  panner.pan.setValueAtTime(pan, ctx.currentTime);
  panner.connect(master);
  return panner;
}

function runWithAudio(callback: (ctx: AudioContext) => void): void {
  if (!isMechanicalSoundEnabled()) return;
  try {
    const ctx = getAudioContext();
    if (!ctx) return;

    if (ctx.state === 'suspended') {
      void ctx
        .resume()
        .then(() => {
          if (ctx.state === 'running' && isMechanicalSoundEnabled()) {
            callback(ctx);
          }
        })
        .catch(() => undefined);
      return;
    }

    if (ctx.state === 'running') {
      callback(ctx);
    }
  } catch {
    // Audio must never interrupt PIN interaction or rendering
  }
}

function scheduleNoiseBurst(
  ctx: AudioContext,
  dest: AudioNode,
  options: {
    startTime: number;
    duration: number;
    filterType: BiquadFilterType;
    frequency: number;
    q?: number;
    endFrequency?: number;
    peakGain: number;
    warm?: boolean;
  }
): void {
  const {
    startTime,
    duration,
    filterType,
    frequency,
    q = 2.4,
    endFrequency,
    peakGain,
    warm = false,
  } = options;

  const buffer = warm ? getWarmNoiseBuffer(ctx) : getShortNoiseBuffer(ctx);
  const maxOffset = Math.max(0, buffer.duration - duration - 0.005);
  const offset = maxOffset > 0 ? Math.random() * maxOffset : 0;

  const src = ctx.createBufferSource();
  src.buffer = buffer;

  const filter = ctx.createBiquadFilter();
  filter.type = filterType;
  filter.frequency.setValueAtTime(frequency, startTime);
  if (endFrequency) {
    filter.frequency.exponentialRampToValueAtTime(
      Math.max(40, endFrequency),
      startTime + duration
    );
  }
  filter.Q.setValueAtTime(q, startTime);

  const gain = ctx.createGain();
  const safePeak = Math.max(0.0002, peakGain);
  gain.gain.setValueAtTime(0.0001, startTime);
  gain.gain.linearRampToValueAtTime(safePeak, startTime + 0.0018);
  gain.gain.exponentialRampToValueAtTime(0.0001, startTime + duration);

  src.connect(filter);
  filter.connect(gain);
  gain.connect(dest);

  src.start(startTime, offset, duration + 0.008);
  src.stop(startTime + duration + 0.01);
}

function scheduleMechanicalImpulse(
  ctx: AudioContext,
  dest: AudioNode,
  options: {
    startTime: number;
    duration: number;
    type: OscillatorType;
    startFreq: number;
    endFreq: number;
    peakGain: number;
  }
): GainNode {
  const { startTime, duration, type, startFreq, endFreq, peakGain } = options;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();

  osc.type = type;
  osc.frequency.setValueAtTime(startFreq, startTime);
  osc.frequency.exponentialRampToValueAtTime(Math.max(30, endFreq), startTime + duration);

  const safePeak = Math.max(0.0002, peakGain);
  gain.gain.setValueAtTime(0.0001, startTime);
  gain.gain.linearRampToValueAtTime(safePeak, startTime + 0.0015);
  gain.gain.exponentialRampToValueAtTime(0.0001, startTime + duration);

  osc.connect(gain);
  gain.connect(dest);

  osc.start(startTime);
  osc.stop(startTime + duration + 0.008);
  return gain;
}

/**
 * Crisp precision mechanical detent for mouse drag, touch swipe, mouse wheel, and wheel arrows.
 */
export function playWheelDetent(wheelIndex?: number): void {
  runWithAudio((ctx) => {
    const now = ctx.currentTime;
    const startTime = Math.min(
      now + 0.066,
      lastDetentScheduledAt > now - 0.004 ? lastDetentScheduledAt + 0.022 : now
    );
    lastDetentScheduledAt = startTime;

    const vol = getVolumeScale() * vary(1, 0.05);
    const dest = createDestWithPan(ctx, panForWheel(wheelIndex));

    // Pawl-into-notch dry metallic snap
    scheduleNoiseBurst(ctx, dest, {
      startTime,
      duration: 0.022,
      filterType: 'bandpass',
      frequency: vary(3150, 0.045),
      q: 3.1,
      peakGain: 0.24 * vol,
    });

    // Short machined metal body impact (no tonal tail)
    scheduleMechanicalImpulse(ctx, dest, {
      startTime,
      duration: 0.018,
      type: 'triangle',
      startFreq: vary(780, 0.04),
      endFreq: vary(215, 0.04),
      peakGain: 0.14 * vol,
    });

    // High dry micro-tick edge
    scheduleNoiseBurst(ctx, dest, {
      startTime: startTime + 0.004,
      duration: 0.014,
      filterType: 'highpass',
      frequency: vary(4600, 0.04),
      q: 1.4,
      peakGain: 0.09 * vol,
    });
  });
}

/**
 * Subtle locking detent when a drum finishes momentum or keyboard rotation and settles on center.
 */
export function playWheelSettle(wheelIndex?: number, delaySeconds = 0): void {
  runWithAudio((ctx) => {
    const start = ctx.currentTime + Math.max(0, delaySeconds);
    const vol = getVolumeScale() * vary(1, 0.04);
    const dest = createDestWithPan(ctx, panForWheel(wheelIndex));

    scheduleNoiseBurst(ctx, dest, {
      startTime: start,
      duration: 0.018,
      filterType: 'bandpass',
      frequency: vary(3550, 0.04),
      q: 4.2,
      peakGain: 0.12 * vol,
    });

    scheduleMechanicalImpulse(ctx, dest, {
      startTime: start,
      duration: 0.014,
      type: 'triangle',
      startFreq: vary(920, 0.04),
      endFreq: vary(380, 0.04),
      peakGain: 0.07 * vol,
    });
  });
}

/**
 * Firmer tumbler engagement for keyboard numeric entry (0-9) plus soft synchronized wheel settlement.
 */
export function playKeyboardEngage(wheelIndex?: number): void {
  runWithAudio((ctx) => {
    const now = ctx.currentTime;
    const vol = getVolumeScale() * vary(1, 0.04);
    const dest = createDestWithPan(ctx, panForWheel(wheelIndex));

    // Cancel any previous pending keyboard settle so rapid typing stays dry and crisp
    if (activeKeyboardSettle && now < activeKeyboardSettle.at + 0.03) {
      try {
        activeKeyboardSettle.gain.gain.cancelScheduledValues(now);
        activeKeyboardSettle.gain.gain.setValueAtTime(0.0001, now);
      } catch {
        // Ignore if node already finished
      }
      activeKeyboardSettle = null;
    }

    // Firm tumbler latch impact
    scheduleNoiseBurst(ctx, dest, {
      startTime: now,
      duration: 0.028,
      filterType: 'bandpass',
      frequency: vary(2350, 0.04),
      q: 2.2,
      peakGain: 0.28 * vol,
    });

    // Drum engagement body thud
    scheduleMechanicalImpulse(ctx, dest, {
      startTime: now,
      duration: 0.025,
      type: 'triangle',
      startFreq: vary(590, 0.04),
      endFreq: vary(155, 0.04),
      peakGain: 0.19 * vol,
    });

    // Subtle secondary ratchet tick as wheel enters rotation
    scheduleNoiseBurst(ctx, dest, {
      startTime: now + 0.026,
      duration: 0.016,
      filterType: 'bandpass',
      frequency: vary(3400, 0.04),
      q: 3.4,
      peakGain: 0.11 * vol,
    });

    // Synchronized soft settlement click aligned with wheel rail settle (~260ms)
    const settleTime = now + 0.26;
    const settleBus = ctx.createGain();
    settleBus.gain.setValueAtTime(1, now);
    settleBus.connect(dest);
    activeKeyboardSettle = { gain: settleBus, at: settleTime };

    scheduleNoiseBurst(ctx, settleBus, {
      startTime: settleTime,
      duration: 0.017,
      filterType: 'bandpass',
      frequency: vary(3500, 0.04),
      q: 4.0,
      peakGain: 0.095 * vol,
    });

    scheduleMechanicalImpulse(ctx, settleBus, {
      startTime: settleTime,
      duration: 0.014,
      type: 'triangle',
      startFreq: vary(860, 0.04),
      endFreq: vary(340, 0.04),
      peakGain: 0.055 * vol,
    });
  });
}

/**
 * Softer reverse mechanical detent for Backspace / clearing a wheel back to neutral.
 */
export function playReverseDetent(wheelIndex?: number): void {
  runWithAudio((ctx) => {
    const now = ctx.currentTime;
    const vol = getVolumeScale() * vary(1, 0.04);
    const dest = createDestWithPan(ctx, panForWheel(wheelIndex));

    scheduleNoiseBurst(ctx, dest, {
      startTime: now,
      duration: 0.018,
      filterType: 'bandpass',
      frequency: vary(2050, 0.04),
      q: 2.5,
      peakGain: 0.14 * vol,
    });

    scheduleMechanicalImpulse(ctx, dest, {
      startTime: now,
      duration: 0.016,
      type: 'sine',
      startFreq: vary(420, 0.04),
      endFreq: vary(290, 0.04),
      peakGain: 0.095 * vol,
    });
  });
}

/**
 * Multi-stage mechanical safe unlock sequence synchronized with the visual unlock animation:
 * 0ms pin confirmation -> 150ms internal relay/latch -> 350ms heavy bolt clunk -> 480-610ms shackle lift.
 */
export function playUnlockMechanism(): void {
  runWithAudio((ctx) => {
    const now = ctx.currentTime;
    const vol = getVolumeScale();
    const dest = createDestWithPan(ctx, 0);

    // 0ms: six-wheel alignment confirmation ticks
    for (let i = 0; i < 3; i++) {
      const t = now + i * 0.022;
      scheduleNoiseBurst(ctx, dest, {
        startTime: t,
        duration: 0.016,
        filterType: 'bandpass',
        frequency: 2800 + i * 320,
        q: 3.4,
        peakGain: (0.16 - i * 0.02) * vol,
      });
    }

    // 150ms: internal relay / solenoid latch release (matches emerald LED transition)
    const tRelay = now + 0.15;
    scheduleNoiseBurst(ctx, dest, {
      startTime: tRelay,
      duration: 0.028,
      filterType: 'bandpass',
      frequency: 2250,
      q: 2.6,
      peakGain: 0.25 * vol,
    });
    scheduleMechanicalImpulse(ctx, dest, {
      startTime: tRelay,
      duration: 0.024,
      type: 'triangle',
      startFreq: 1050,
      endFreq: 310,
      peakGain: 0.17 * vol,
    });

    // 350ms: heavier safe locking bolt retract clunk
    const tClunk = now + 0.35;
    scheduleNoiseBurst(ctx, dest, {
      startTime: tClunk,
      duration: 0.068,
      filterType: 'lowpass',
      frequency: 620,
      q: 1.2,
      peakGain: 0.34 * vol,
      warm: true,
    });
    scheduleMechanicalImpulse(ctx, dest, {
      startTime: tClunk,
      duration: 0.088,
      type: 'sine',
      startFreq: 138,
      endFreq: 48,
      peakGain: 0.32 * vol,
    });
    scheduleNoiseBurst(ctx, dest, {
      startTime: tClunk + 0.004,
      duration: 0.024,
      filterType: 'bandpass',
      frequency: 1450,
      q: 2.0,
      peakGain: 0.18 * vol,
    });

    // 480-620ms: steel shackle release slide & top-stop metallic click
    const tShackle = now + 0.48;
    scheduleNoiseBurst(ctx, dest, {
      startTime: tShackle,
      duration: 0.13,
      filterType: 'bandpass',
      frequency: 1750,
      endFrequency: 3100,
      q: 2.8,
      peakGain: 0.18 * vol,
    });
    scheduleNoiseBurst(ctx, dest, {
      startTime: tShackle + 0.115,
      duration: 0.022,
      filterType: 'bandpass',
      frequency: 3650,
      q: 4.5,
      peakGain: 0.16 * vol,
    });
    scheduleMechanicalImpulse(ctx, dest, {
      startTime: tShackle + 0.115,
      duration: 0.02,
      type: 'triangle',
      startFreq: 1180,
      endFreq: 440,
      peakGain: 0.11 * vol,
    });
  });
}

/**
 * Restrained mechanical rejection sound: dull double-click + small blocked-mechanism clunk.
 */
export function playRejectMechanism(): void {
  runWithAudio((ctx) => {
    const now = ctx.currentTime;
    const vol = getVolumeScale();
    const dest = createDestWithPan(ctx, 0);

    // Dull double-click (0ms & 88ms)
    const clicks = [0, 0.088];
    for (const offset of clicks) {
      const t = now + offset;
      scheduleNoiseBurst(ctx, dest, {
        startTime: t,
        duration: 0.022,
        filterType: 'bandpass',
        frequency: 1180,
        q: 1.6,
        peakGain: 0.2 * vol,
      });
      scheduleMechanicalImpulse(ctx, dest, {
        startTime: t,
        duration: 0.024,
        type: 'triangle',
        startFreq: 410,
        endFreq: 155,
        peakGain: 0.16 * vol,
      });
    }

    // Small blocked-mechanism stop clunk at 172ms
    const tBlock = now + 0.172;
    scheduleNoiseBurst(ctx, dest, {
      startTime: tBlock,
      duration: 0.055,
      filterType: 'lowpass',
      frequency: 440,
      q: 1.1,
      peakGain: 0.28 * vol,
      warm: true,
    });
    scheduleMechanicalImpulse(ctx, dest, {
      startTime: tBlock,
      duration: 0.068,
      type: 'sine',
      startFreq: 152,
      endFreq: 58,
      peakGain: 0.25 * vol,
    });
  });
}

/**
 * Subtle tactile mechanical switch click when biometric unlock is initiated.
 */
export function playBiometricActivate(): void {
  runWithAudio((ctx) => {
    const now = ctx.currentTime;
    const vol = getVolumeScale();
    const dest = createDestWithPan(ctx, 0);

    scheduleNoiseBurst(ctx, dest, {
      startTime: now,
      duration: 0.018,
      filterType: 'bandpass',
      frequency: 2850,
      q: 3.0,
      peakGain: 0.16 * vol,
    });

    scheduleMechanicalImpulse(ctx, dest, {
      startTime: now,
      duration: 0.016,
      type: 'triangle',
      startFreq: 840,
      endFreq: 280,
      peakGain: 0.11 * vol,
    });
  });
}

/**
 * Small precision mechanical confirmation latch upon successful biometric verification.
 */
export function playBiometricConfirmLatch(): void {
  runWithAudio((ctx) => {
    const now = ctx.currentTime;
    const vol = getVolumeScale();
    const dest = createDestWithPan(ctx, 0);

    scheduleNoiseBurst(ctx, dest, {
      startTime: now,
      duration: 0.02,
      filterType: 'bandpass',
      frequency: 3400,
      q: 3.6,
      peakGain: 0.18 * vol,
    });

    scheduleMechanicalImpulse(ctx, dest, {
      startTime: now,
      duration: 0.018,
      type: 'triangle',
      startFreq: 1080,
      endFreq: 390,
      peakGain: 0.12 * vol,
    });
  });
}

