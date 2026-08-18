// Procedural WebAudio subsystem (engine hum, ambient music, SFX) — no external audio files.
export function createAudioSystem({ isMuted, isActive }) {
  let audioCtx = null;
  let masterGain = null;
  let engineOsc1, engineOsc2, engineFilter, engineGain;
  let musicStarted = false;

  function ensureAudio() {
    if (audioCtx) {
      if (audioCtx.state === 'suspended') audioCtx.resume();
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    audioCtx = new AC();
    masterGain = audioCtx.createGain();
    masterGain.gain.value = isMuted() ? 0 : 1;
    masterGain.connect(audioCtx.destination);

    // Engine hum: two detuned saws through a lowpass filter, modulated by speed/nitro
    engineFilter = audioCtx.createBiquadFilter();
    engineFilter.type = 'lowpass';
    engineFilter.frequency.value = 400;
    engineGain = audioCtx.createGain();
    engineGain.gain.value = 0;
    engineOsc1 = audioCtx.createOscillator();
    engineOsc1.type = 'sawtooth';
    engineOsc1.frequency.value = 55;
    engineOsc2 = audioCtx.createOscillator();
    engineOsc2.type = 'sawtooth';
    engineOsc2.frequency.value = 82;
    const osc2Gain = audioCtx.createGain();
    osc2Gain.gain.value = 0.4;
    engineOsc1.connect(engineFilter);
    engineOsc2.connect(osc2Gain);
    osc2Gain.connect(engineFilter);
    engineFilter.connect(engineGain);
    engineGain.connect(masterGain);
    engineOsc1.start();
    engineOsc2.start();

    startMusicLoop();
  }

  function setEngineGain(v) {
    if (engineGain && audioCtx) engineGain.gain.setTargetAtTime(v, audioCtx.currentTime, 0.12);
  }

  function setEngineFrequency(freq, filterFreq) {
    if (!audioCtx || !engineOsc1) return;
    engineOsc1.frequency.setTargetAtTime(freq, audioCtx.currentTime, 0.08);
    engineOsc2.frequency.setTargetAtTime(freq * 1.5, audioCtx.currentTime, 0.08);
    engineFilter.frequency.setTargetAtTime(filterFreq, audioCtx.currentTime, 0.1);
  }

  function beep(freq, duration, type, gain) {
    if (!audioCtx) return;
    const osc = audioCtx.createOscillator();
    const g = audioCtx.createGain();
    osc.type = type || 'square';
    osc.frequency.value = freq;
    g.gain.value = gain != null ? gain : 0.06;
    osc.connect(g);
    g.connect(masterGain);
    osc.start();
    g.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + duration);
    osc.stop(audioCtx.currentTime + duration);
  }
  function sfxPickup() { beep(880, 0.12, 'square', 0.05); beep(1320, 0.1, 'square', 0.04); }
  function sfxCombo() { beep(660, 0.08, 'triangle', 0.05); beep(990, 0.1, 'triangle', 0.05); }
  function sfxUnlock() { beep(520, 0.1, 'sawtooth', 0.05); beep(780, 0.1, 'sawtooth', 0.05); beep(1040, 0.14, 'sawtooth', 0.05); }
  function sfxCrash() {
    if (!audioCtx) return;
    const bufferSize = audioCtx.sampleRate * 0.4;
    const buffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / bufferSize);
    const noise = audioCtx.createBufferSource();
    noise.buffer = buffer;
    const g = audioCtx.createGain();
    g.gain.value = 0.3;
    noise.connect(g);
    g.connect(masterGain);
    noise.start();
  }

  function startMusicLoop() {
    if (musicStarted) return;
    musicStarted = true;
    const scale = [261.63, 329.63, 392.0, 440.0, 523.25, 587.33];
    (function tick() {
      if (audioCtx && isActive()) {
        const note = scale[Math.floor(Math.random() * scale.length)] * (Math.random() < 0.25 ? 0.5 : 1);
        beep(note, 0.4, 'sine', 0.02);
      }
      setTimeout(tick, 420 + Math.random() * 260);
    })();
  }

  function setMuted(muted) {
    if (masterGain) masterGain.gain.value = muted ? 0 : 1;
  }

  return {
    ensureAudio,
    setEngineGain,
    setEngineFrequency,
    beep,
    sfxPickup,
    sfxCombo,
    sfxUnlock,
    sfxCrash,
    setMuted,
  };
}
