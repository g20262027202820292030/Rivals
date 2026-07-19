// Procedural Audio Generator using Web Audio API
// This avoids needing external mp3 files and works fully offline/persistently.

let audioCtx: AudioContext | null = null;

function getAudioContext() {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
  }
  if (audioCtx.state === 'suspended') {
    audioCtx.resume();
  }
  return audioCtx;
}

export function playShootSound(isSniper: boolean) {
  try {
    const ctx = getAudioContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    
    // Roblox Rivals-style very punchy, short transient snap
    const bufferSize = ctx.sampleRate * (isSniper ? 0.3 : 0.15);
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = Math.random() * 2 - 1;
    }
    const noise = ctx.createBufferSource();
    noise.buffer = buffer;

    const noiseFilter = ctx.createBiquadFilter();
    noiseFilter.type = isSniper ? 'bandpass' : 'highpass';
    noiseFilter.frequency.setValueAtTime(isSniper ? 300 : 3000, now);
    if (isSniper) {
      noiseFilter.Q.setValueAtTime(1.0, now);
    } else {
      noiseFilter.Q.setValueAtTime(0.5, now);
    }
    
    const noiseGain = ctx.createGain();
    noiseGain.gain.setValueAtTime(isSniper ? 1.5 : 0.7, now);
    noiseGain.gain.exponentialRampToValueAtTime(0.01, now + (isSniper ? 0.25 : 0.08));

    // Thump
    const osc = ctx.createOscillator();
    const oscGain = ctx.createGain();
    
    osc.type = isSniper ? 'sawtooth' : 'triangle';
    osc.frequency.setValueAtTime(isSniper ? 200 : 300, now);
    osc.frequency.exponentialRampToValueAtTime(isSniper ? 20 : 50, now + (isSniper ? 0.1 : 0.05));
    
    oscGain.gain.setValueAtTime(isSniper ? 2.0 : 1.0, now);
    oscGain.gain.exponentialRampToValueAtTime(0.01, now + (isSniper ? 0.2 : 0.1));

    // Connections
    noise.connect(noiseFilter);
    noiseFilter.connect(noiseGain);
    noiseGain.connect(ctx.destination);

    osc.connect(oscGain);
    oscGain.connect(ctx.destination);

    noise.start(now);
    osc.start(now);

    noise.stop(now + (isSniper ? 0.3 : 0.15));
    osc.stop(now + (isSniper ? 0.25 : 0.12));
  } catch (e) {
    console.warn('Audio play failed:', e);
  }
}

export function playHitSound() {
  try {
    const ctx = getAudioContext();
    if (!ctx) return;
    const now = ctx.currentTime;

    // Roblox Rivals crisp metallic "ding" hitmarker
    const osc1 = ctx.createOscillator();
    const osc2 = ctx.createOscillator();
    const gainNode = ctx.createGain();

    osc1.type = 'sine';
    osc1.frequency.setValueAtTime(1550, now); // Very high crisp pitch

    osc2.type = 'sine';
    osc2.frequency.setValueAtTime(1555, now); // Slight detune for metallic chime ring

    gainNode.gain.setValueAtTime(0.25, now);
    gainNode.gain.exponentialRampToValueAtTime(0.0001, now + 0.06);

    osc1.connect(gainNode);
    osc2.connect(gainNode);
    gainNode.connect(ctx.destination);

    osc1.start(now);
    osc2.start(now);
    osc1.stop(now + 0.07);
    osc2.stop(now + 0.07);
  } catch (e) {
    // ignore
  }
}

export function playKillSound() {
  try {
    const ctx = getAudioContext();
    if (!ctx) return;
    const now = ctx.currentTime;

    // Roblox Rivals iconic, extremely satisfying multi-layered arcade kill-ring chime
    // Starts with a crisp metallic slam followed by a rising shiny chord
    const osc1 = ctx.createOscillator();
    const osc2 = ctx.createOscillator();
    const osc3 = ctx.createOscillator();
    const gainNode = ctx.createGain();

    osc1.type = 'sine';
    osc1.frequency.setValueAtTime(950, now);
    osc1.frequency.exponentialRampToValueAtTime(1900, now + 0.15);

    osc2.type = 'triangle';
    osc2.frequency.setValueAtTime(1200, now);
    osc2.frequency.exponentialRampToValueAtTime(2400, now + 0.15);

    osc3.type = 'sine';
    osc3.frequency.setValueAtTime(1500, now);
    osc3.frequency.exponentialRampToValueAtTime(3000, now + 0.2);

    gainNode.gain.setValueAtTime(0.35, now);
    gainNode.gain.exponentialRampToValueAtTime(0.0001, now + 0.35);

    osc1.connect(gainNode);
    osc2.connect(gainNode);
    osc3.connect(gainNode);
    gainNode.connect(ctx.destination);

    osc1.start(now);
    osc2.start(now);
    osc3.start(now);
    osc1.stop(now + 0.36);
    osc2.stop(now + 0.36);
    osc3.stop(now + 0.36);
  } catch (e) {
    // ignore
  }
}

export function playReloadSound() {
  try {
    const ctx = getAudioContext();
    if (!ctx) return;
    const now = ctx.currentTime;

    // Simulate mechanical metallic clanks for reload
    // Mag Out
    const magOut = ctx.createOscillator();
    const outGain = ctx.createGain();
    magOut.type = 'square';
    magOut.frequency.setValueAtTime(300, now);
    magOut.frequency.exponentialRampToValueAtTime(100, now + 0.1);
    outGain.gain.setValueAtTime(0.5, now);
    outGain.gain.exponentialRampToValueAtTime(0.01, now + 0.1);
    magOut.connect(outGain);
    outGain.connect(ctx.destination);
    magOut.start(now);
    magOut.stop(now + 0.15);

    // Mag In (Click)
    const magIn = ctx.createOscillator();
    const inGain = ctx.createGain();
    magIn.type = 'sawtooth';
    magIn.frequency.setValueAtTime(400, now + 0.4);
    magIn.frequency.exponentialRampToValueAtTime(200, now + 0.5);
    inGain.gain.setValueAtTime(0.8, now + 0.4);
    inGain.gain.exponentialRampToValueAtTime(0.01, now + 0.5);
    magIn.connect(inGain);
    inGain.connect(ctx.destination);
    magIn.start(now + 0.4);
    magIn.stop(now + 0.55);

    // Bolt pull
    const bolt = ctx.createOscillator();
    const boltGain = ctx.createGain();
    bolt.type = 'square';
    bolt.frequency.setValueAtTime(600, now + 0.8);
    bolt.frequency.exponentialRampToValueAtTime(800, now + 0.9);
    boltGain.gain.setValueAtTime(0.7, now + 0.8);
    boltGain.gain.exponentialRampToValueAtTime(0.01, now + 0.9);
    bolt.connect(boltGain);
    boltGain.connect(ctx.destination);
    bolt.start(now + 0.8);
    bolt.stop(now + 0.95);
  } catch (e) {
    // ignore
  }
}

export function playSlideSound() {
  try {
    const ctx = getAudioContext();
    if (!ctx) return;
    const now = ctx.currentTime;

    const bufferSize = ctx.sampleRate * 0.4;
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = Math.random() * 2 - 1;
    }

    const noise = ctx.createBufferSource();
    noise.buffer = buffer;

    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(600, now);
    filter.frequency.exponentialRampToValueAtTime(150, now + 0.4);

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.1, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.4);

    noise.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);

    noise.start(now);
    noise.stop(now + 0.42);
  } catch (e) {
    // ignore
  }
}

export function playJumpSound() {
  try {
    const ctx = getAudioContext();
    if (!ctx) return;
    const now = ctx.currentTime;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(150, now);
    osc.frequency.exponentialRampToValueAtTime(300, now + 0.15);

    gain.gain.setValueAtTime(0.08, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(now);
    osc.stop(now + 0.16);
  } catch (e) {
    // ignore
  }
}

export function playHurtSound() {
  try {
    const ctx = getAudioContext();
    if (!ctx) return;
    const now = ctx.currentTime;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(100, now);
    osc.frequency.linearRampToValueAtTime(60, now + 0.15);

    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(300, now);

    gain.gain.setValueAtTime(0.3, now);
    gain.gain.exponentialRampToValueAtTime(0.01, now + 0.15);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);

    osc.start(now);
    osc.stop(now + 0.16);
  } catch (e) {
    // ignore
  }
}

export function playFistSwingSound() {
  try {
    const ctx = getAudioContext();
    if (!ctx) return;
    const now = ctx.currentTime;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'triangle';
    osc.frequency.setValueAtTime(120, now);
    osc.frequency.exponentialRampToValueAtTime(40, now + 0.12);

    gain.gain.setValueAtTime(0.4, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(now);
    osc.stop(now + 0.13);
  } catch (e) {
    // ignore
  }
}
