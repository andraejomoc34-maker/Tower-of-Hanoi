const MASTER_VOLUME = 0.12;

/**
 * Build the click-to-unlock Web Audio sound engine.
 *
 * @returns {{ unlock: () => Promise<void>, setMuted: (muted: boolean) => void, isMuted: () => boolean, pickup: () => void, slide: () => void, place: (disk: number, diskCount: number) => void, victory: () => void }}
 */
export function createAudioEngine() {
  let context = null;
  let muted = false;
  let masterGain = null;

  async function unlock() {
    if (!context) {
      const AudioContextConstructor = window.AudioContext || window.webkitAudioContext;
      if (!AudioContextConstructor) return;

      context = new AudioContextConstructor();
      masterGain = context.createGain();
      masterGain.gain.value = muted ? 0 : MASTER_VOLUME;
      masterGain.connect(context.destination);
    }

    if (context.state === "suspended") {
      await context.resume();
    }
  }

  function setMuted(value) {
    muted = value;
    if (context && masterGain) {
      masterGain.gain.setTargetAtTime(
        muted ? 0 : MASTER_VOLUME,
        context.currentTime,
        0.015
      );
    }
  }

  function tone(frequency, start, duration, waveform = "sine", peak = 0.25) {
    if (!context || !masterGain || muted) return;

    const oscillator = context.createOscillator();
    const envelope = context.createGain();
    oscillator.type = waveform;
    oscillator.frequency.setValueAtTime(frequency, start);
    envelope.gain.setValueAtTime(0.0001, start);
    envelope.gain.exponentialRampToValueAtTime(peak, start + 0.012);
    envelope.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    oscillator.connect(envelope);
    envelope.connect(masterGain);
    oscillator.start(start);
    oscillator.stop(start + duration + 0.02);
  }

  function pickup() {
    if (!context || muted) return;
    const now = context.currentTime;
    const oscillator = context.createOscillator();
    const envelope = context.createGain();
    oscillator.type = "sine";
    oscillator.frequency.setValueAtTime(420, now);
    oscillator.frequency.exponentialRampToValueAtTime(760, now + 0.11);
    envelope.gain.setValueAtTime(0.0001, now);
    envelope.gain.exponentialRampToValueAtTime(0.16, now + 0.012);
    envelope.gain.exponentialRampToValueAtTime(0.0001, now + 0.14);
    oscillator.connect(envelope);
    envelope.connect(masterGain);
    oscillator.start(now);
    oscillator.stop(now + 0.16);
  }

  function slide() {
    if (!context || !masterGain || muted) return;

    const duration = 0.22;
    const buffer = context.createBuffer(1, context.sampleRate * duration, context.sampleRate);
    const channel = buffer.getChannelData(0);
    for (let index = 0; index < channel.length; index += 1) {
      channel[index] = (Math.random() * 2 - 1) * (1 - index / channel.length);
    }

    const source = context.createBufferSource();
    const filter = context.createBiquadFilter();
    const envelope = context.createGain();
    const now = context.currentTime;
    source.buffer = buffer;
    filter.type = "lowpass";
    filter.frequency.setValueAtTime(1500, now);
    filter.frequency.exponentialRampToValueAtTime(380, now + duration);
    envelope.gain.setValueAtTime(0.0001, now);
    envelope.gain.exponentialRampToValueAtTime(0.055, now + 0.025);
    envelope.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    source.connect(filter);
    filter.connect(envelope);
    envelope.connect(masterGain);
    source.start(now);
    source.stop(now + duration);
  }

  function place(disk, diskCount) {
    if (!context || muted) return;
    const normalizedSize = (disk - 1) / Math.max(1, diskCount - 1);
    const frequency = 250 - normalizedSize * 95;
    const now = context.currentTime;
    tone(frequency, now, 0.12, "triangle", 0.24);
    tone(frequency * 0.52, now + 0.015, 0.09, "sine", 0.1);
  }

  function illegal() {
    if (!context || muted) return;
    const now = context.currentTime;
    tone(175, now, 0.18, "sawtooth", 0.11);
    tone(130, now + 0.07, 0.2, "sawtooth", 0.09);
  }

  function victory() {
    if (!context || muted) return;
    const now = context.currentTime;
    [523.25, 659.25, 783.99, 1046.5].forEach((frequency, index) => {
      tone(frequency, now + index * 0.13, 0.32, "sine", 0.18);
    });
  }

  return {
    unlock,
    setMuted,
    isMuted: () => muted,
    pickup,
    slide,
    place,
    illegal,
    victory
  };
}
