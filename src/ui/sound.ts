// 音效：以 WebAudio 合成，不需音檔。瀏覽器規定要使用者互動後才能發聲，所以第一次按鍵／點擊時才建立 AudioContext。
import type { Sfx } from '../game/state';

let ctx: AudioContext | null = null;

export function unlockAudio(): void {
  if (ctx) { if (ctx.state === 'suspended') void ctx.resume(); return; }
  try {
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (AC) ctx = new AC();
  } catch { ctx = null; }
}

function tone(freq: number, dur: number, type: OscillatorType, vol: number, delay = 0, slide?: number): void {
  if (!ctx) return;
  const t = ctx.currentTime + delay;
  const o = ctx.createOscillator(), g = ctx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (slide) o.frequency.exponentialRampToValueAtTime(slide, t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(ctx.destination);
  o.start(t);
  o.stop(t + dur + 0.02);
}

const SOUNDS: Record<Sfx, () => void> = {
  cast: () => tone(220, 0.35, 'triangle', 0.12, 0, 330),
  hit: () => { tone(140, 0.18, 'square', 0.08, 0, 60); tone(900, 0.06, 'sawtooth', 0.04); },
  ok: () => { tone(880, 0.09, 'sine', 0.07); tone(1320, 0.12, 'sine', 0.07, 0.08); },
  ng: () => tone(300, 0.4, 'sawtooth', 0.1, 0, 110),
  alert: () => { tone(660, 0.1, 'square', 0.06); tone(660, 0.1, 'square', 0.06, 0.15); },
};

export function play(list: Sfx[]): void {
  if (!ctx || ctx.state !== 'running') return;
  list.forEach((s) => SOUNDS[s]());
}
