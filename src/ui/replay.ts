// 回放播放器：結算畫面點一個判定 → 慢動作重播判定前後幾秒，並標出正確位置
import { REPLAY } from '../core/tuning';
import { fmtT } from '../core/format';
import type { Check } from '../game/state';
import { blend, type Frame } from '../game/replay';
import { $ } from './dom';

interface Playing { frames: Frame[]; check: Check; t0: number; t1: number; clock: number }

let cur: Playing | null = null;

export const replayActive = (): boolean => cur !== null;

export function startReplay(all: Frame[], check: Check, onClose: () => void): boolean {
  const t0 = check.t - REPLAY.before, t1 = check.t + REPLAY.after;
  const frames = all.filter((f) => f.t >= t0 && f.t <= t1);
  if (frames.length < 2) return false;
  cur = { frames, check, t0: frames[0].t, t1: frames[frames.length - 1].t, clock: frames[0].t };
  $('rpTitle').textContent = `${fmtT(check.t)} ${check.tag}：${check.text}`;
  $('rp').hidden = false;
  $('ov').hidden = true;
  $('rpAgain').onclick = () => { if (cur) cur.clock = cur.t0; };
  $('rpClose').onclick = () => { stopReplay(); onClose(); };
  return true;
}

export function stopReplay(): void {
  cur = null;
  $('rp').hidden = true;
}

/** 推進回放時鐘（真實秒數），回傳要畫的影格、插值比例與正確位置 */
export function replayFrame(realDt: number): { frame: Frame; alpha: number; check: Check } | null {
  if (!cur) return null;
  cur.clock = Math.min(cur.t1, cur.clock + realDt * REPLAY.speed);
  const fs = cur.frames;
  let i = fs.findIndex((f) => f.t > cur!.clock);
  if (i <= 0) i = i === 0 ? 1 : fs.length - 1;
  const a = fs[i - 1], b = fs[i];
  const alpha = b.t > a.t ? Math.min(1, Math.max(0, (cur.clock - a.t) / (b.t - a.t))) : 1;
  const k = (cur.clock - cur.t0) / Math.max(0.001, cur.t1 - cur.t0);
  $('rpFill').style.width = `${k * 100}%`;
  const rel = cur.clock - cur.check.t;
  $('rpTime').textContent = `${rel >= 0 ? '+' : '−'}${Math.abs(rel).toFixed(1)} 秒 ・ ${REPLAY.speed}×`;
  return { frame: blend(a, b), alpha, check: cur.check };
}
