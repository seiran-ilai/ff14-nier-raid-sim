// 手機版：版面窄到一欄時自動切換。只能看教學示範。
// 「機制提示」卡（右欄最上面；手機版在舞台正下方）把詠唱、提示、王台詞放大成文字。
import { fmtT } from '../core/format';
import { findInfo, firstDrill, parseRand } from '../drills';
import { mechDl } from '../drills/build';
import type { GameState } from '../game/state';
import type { Session } from '../game/session';
import { $ } from './dom';

/** 跟 layout.css 的一欄斷點相同 */
const MQ = '(max-width: 720px)';
const mql = typeof matchMedia === 'function' ? matchMedia(MQ) : null;

export const isMobile = (): boolean => !!mql?.matches;

/** 舞台寬度小於這個值：詠唱提示改顯示在機制提示卡，不疊在舞台上 */
const SMALL_STAGE = 760;

export function bindMobile(session: Session, rerender: () => void): void {
  const sync = (): void => {
    document.body.classList.toggle('mobile', isMobile());
    if (isMobile() && parseRand(session.cfg.drill)) { session.cfg.drill = firstDrill().key; session.cfg.pick = 'one'; }
  };
  sync();
  mql?.addEventListener('change', () => { sync(); session.startAt = 0; rerender(); session.newGame(); });
  const stage = $('stage');
  const fit = (): void => { document.body.classList.toggle('smallstage', stage.clientWidth > 0 && stage.clientWidth < SMALL_STAGE); };
  if (typeof ResizeObserver === 'function') new ResizeObserver(fit).observe(stage);
  fit();
}

let logG: GameState | null = null;
let log: { t: number; text: string }[] = [];
let lastHtml = '';

/** 機制提示卡：目前詠唱（含處理方式）、畫面提示、王台詞，以及這局出現過的提示紀錄 */
export function updTipCard(G: GameState | null): void {
  if (!G) return;
  if (G !== logG) { logG = G; log = []; }
  const push = (text: string): void => { if (!log.some((l) => l.text === text)) log.push({ t: G.t, text }); };
  const casting = !!G.cast && G.t < G.cast.start + G.cast.dur && G.state === 'run';
  if (casting && G.cast!.tip) push(`<b>${G.cast!.name}</b>：${G.cast!.tip}`);
  const alert = G.alert && G.t < G.alert.until ? G.alert : null;
  const line = G.line && G.t < G.line.until ? G.line : null;
  let h = '<h3>機制提示</h3>';
  if (G.state !== 'run') h += `<p class="muted">${G.state === 'end' ? (G.auto ? '示範結束。' : '這局結束。') : (isMobile() ? '按「教學示範」開始，' : '開始後') + '這裡會顯示每個機制的處理方式。'}</p>`;
  else {
    if (casting) {
      const c = G.cast!, m = findInfo(c.name, G.enc);
      h += `<div class="tipnow"><b>${c.name}</b><span>${Math.max(0, c.start + c.dur - G.t).toFixed(1)} 秒</span></div>`;
      if (c.tip) h += `<p class="tiptext">${c.tip}</p>`;
      if (m) h += mechDl(m);
    } else h += '<p class="muted">（目前沒有詠唱）</p>';
    if (alert) h += `<p class="tipalert${alert.danger ? ' danger' : ''}">${alert.text}</p>`;
    if (line) h += `<p class="tipline"><span>${line.who ?? ''}</span>${line.text}</p>`;
  }
  if (log.length) h += `<ul class="tiplog">${log.slice().reverse().map((l) => `<li><span>${fmtT(l.t)}</span><span>${l.text}</span></li>`).join('')}</ul>`;
  if (h !== lastHtml) { lastHtml = h; $('tipCard').innerHTML = h; }
}
