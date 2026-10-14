// 開發模式除錯介面：window.__sim，以及截圖用網址參數
import { ALL_DRILLS } from './drills';
import type { Session } from './game/session';
import type { Vec } from './core/constants';

export function attachDebug(session: Session): void {
  (window as unknown as { __sim: unknown }).__sim = {
    get G() { return session.G; },
    session,
    step: (dt: number) => session.step(dt),
    newGame: (auto?: boolean, seed?: number) => session.newGame(!!auto, seed),
    CFG: session.cfg,
    keys: session.input.keys,
    useAct: (i: number) => session.useAct(i),
    setRmb: (v: boolean) => { session.input.rmb = v; },
    setMouse: (p: Vec) => { session.input.mouse = p; },
    drills: ALL_DRILLS.map((d) => d.key),
  };
  freezeFromUrl(session);
}

/**
 * 截圖用：?drill=basic/dummy/all&seed=7&t=20&auto=1&cam=follow&al=B&role=MT
 * 直接快轉到 t 秒並停住（session.frozen，不動設定；開新局就解除）。
 */
function freezeFromUrl(session: Session): void {
  const q = new URLSearchParams(location.search);
  if (!q.has('t')) return;
  const cfg = session.cfg;
  if (q.get('drill')) cfg.drill = q.get('drill')!;
  if (q.get('cam')) cfg.cam = q.get('cam') as typeof cfg.cam;
  if (q.get('al')) cfg.al = q.get('al') as typeof cfg.al;
  if (q.get('role')) cfg.role = q.get('role') as typeof cfg.role;
  const G = session.newGame(q.get('auto') === '1', q.has('seed') ? Number(q.get('seed')) : undefined);
  G.state = 'run';
  const t = Number(q.get('t'));
  while (G.t < t && G.state === 'run') session.step(1 / 120);
  session.frozen = true;
  session.alpha = 1;
  document.getElementById('ov')!.hidden = (G.state as string) !== 'end';
}
