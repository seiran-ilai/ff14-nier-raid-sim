// 鍵盤：WASD／方向鍵移動、技能鍵、R 重來、T 示範、F 快轉、Esc 暫停、Enter 開始／再來
import type { Session } from '../game/session';
import { isSettingsOpen, handleCaptureKey } from '../ui/settings';
import { replayActive, stopReplay } from '../ui/replay';
import { renderOverlay } from '../ui/overlay';

const MOVE = ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'];

export function bindKeyboard(session: Session): void {
  const { input, cfg } = session;
  window.addEventListener('keydown', (e) => {
    if (handleCaptureKey(cfg, e)) return;
    if (isSettingsOpen()) return;
    const t = e.target as HTMLElement | null;
    if (t && t.closest && t.closest('input,select')) return;
    if (MOVE.includes(e.code)) { input.keys.add(e.code); input.moveTo = null; e.preventDefault(); return; }
    const i = cfg.acts.findIndex((a) => a.code && a.code === e.code);
    if (i >= 0) { e.preventDefault(); if (!e.repeat) session.useAct(i); return; }
    const G = session.G;
    if (e.code === 'Escape' && replayActive()) { stopReplay(); renderOverlay(session); return; }
    if (e.code === 'Escape') { session.togglePause(); return; }
    if (e.code === 'KeyR') { session.newGame(); return; }
    if (e.code === 'KeyT') { session.newGame(true); return; }
    if (e.code === 'KeyF' && G) { G.ff = !G.ff; return; }
    if ((e.code === 'Enter' || e.code === 'Space') && G && G.state === 'ready') { e.preventDefault(); session.start(); return; }
    if (e.code === 'Enter' && G && G.state === 'end' && !G.stopCheck) { session.newGame(); return; }
  });
  window.addEventListener('keyup', (e) => input.keys.delete(e.code));
  window.addEventListener('blur', () => { input.keys.clear(); input.rmb = false; session.pause(); });
}
