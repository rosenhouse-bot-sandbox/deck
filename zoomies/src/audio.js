// Each sound is a list of notes, given as [frequency in Hz, duration in seconds].
const SOUNDS = {
  tick: [[440, 0.15]],
  go: [[880, 0.4]],
  pickup: [[660, 0.07], [990, 0.1]],
  use: [[520, 0.08], [390, 0.1]],
  pad: [[300, 0.08], [600, 0.08], [900, 0.12]],
  hit: [[200, 0.12], [120, 0.25]],
  block: [[900, 0.08], [1200, 0.12]],
  finish: [[523, 0.12], [659, 0.12], [784, 0.12], [1047, 0.3]],
  menu: [[700, 0.05]],
};

export function createAudio() {
  let context = null;
  return {
    play(name) {
      try {
        context ??= new AudioContext();
      } catch {
        return;
      }
      context.resume();
      let at = context.currentTime;
      for (const [frequency, duration] of SOUNDS[name]) {
        const oscillator = context.createOscillator();
        const gain = context.createGain();
        oscillator.type = 'triangle';
        oscillator.frequency.value = frequency;
        gain.gain.setValueAtTime(0.15, at);
        gain.gain.exponentialRampToValueAtTime(0.001, at + duration);
        oscillator.connect(gain).connect(context.destination);
        oscillator.start(at);
        oscillator.stop(at + duration);
        at += duration;
      }
    },
  };
}
