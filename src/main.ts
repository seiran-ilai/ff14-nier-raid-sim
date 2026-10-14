// 進入點：組裝各模組、啟動迴圈（模擬用固定步長，渲染用插值）
import './styles/tokens.css';
import './styles/layout.css';
import './styles/hud.css';
import './styles/settings.css';
import { loadConfig, saveConfig } from './core/config';
import { Session } from './game/session';
import { newInput } from './game/simulation';
import { drillRef, firstDrill, getDrill } from './drills';
import { RAIDS } from './raids';
import { initCanvas, resize, view } from './render/canvas';
import { draw } from './render';
import { $ } from './ui/dom';
import { updHUD } from './ui/hud';
import { renderBar, bindBar } from './ui/actionbar';
import { renderBrief } from './ui/brief';
import { renderOverlay } from './ui/overlay';
import { renderTop, renderStats, bindDrillPicker } from './ui/topbar';
import { bindSettings, isSettingsOpen, applyBig } from './ui/settings';
import { replayActive, replayFrame, stopReplay } from './ui/replay';
import { unlockAudio, play } from './ui/sound';
import { bindKeyboard } from './input/keyboard';
import { bindMouse } from './input/mouse';
import { bindMobile, updTipCard } from './ui/mobile';

const cfg = loadConfig();
// 存的練習項目已經不存在（例如改版）：用第一個王
if (!cfg.drill || (!drillRef(cfg.drill) && !/^(cont|rand|weak):/.test(cfg.drill))) cfg.drill = firstDrill().key;
if (!cfg.raid) cfg.raid = getDrill(cfg.drill).raid.id;
const input = newInput();
const session = new Session(cfg, input, true);

initCanvas($<HTMLCanvasElement>('cv'));
session.on('new', () => { stopReplay(); renderBrief(session); renderOverlay(session); });
session.on('change', () => { if (!replayActive()) renderOverlay(session); });
session.on('stats', () => renderStats(session));
bindBar((i) => session.useAct(i));
bindDrillPicker(session);
bindSettings(session);
$('toggleSides').onclick = (e) => { cfg.hideSides = !cfg.hideSides; saveConfig(cfg); applyBig(cfg); (e.target as HTMLElement).blur(); };
bindKeyboard(session);
bindMouse(view.cv, input);
bindMobile(session, () => { renderTop(session); resize(); });
// 音效只能在使用者互動後啟用
['keydown', 'pointerdown'].forEach((ev) => window.addEventListener(ev, unlockAudio, { capture: true }));

let last = performance.now();
function frame(now: number): void {
  const real = Math.min(0.1, (now - last) / 1000);
  last = now;
  const rp = replayFrame(real);
  if (rp) {
    draw(rp.frame, cfg, { alpha: rp.alpha, fix: rp.check.fix, noHints: true });
  } else {
    const G = session.G;
    if (G && !G.paused && !session.frozen && !isSettingsOpen()) session.advance(real * cfg.speed * (G.ff ? 2 : 1));
    draw(session.G, cfg, { alpha: session.alpha, moveTo: input.moveTo });
    updHUD(session.G, input);
    updTipCard(session.G);
    const sfx = session.drainSfx();
    if (cfg.sound && sfx.length) play(sfx);
  }
  requestAnimationFrame(frame);
}
window.addEventListener('resize', resize);
// 頁尾資料來源：各副本的 sources
const srcs = RAIDS.flatMap((r) => r.sources.map((s) => `<li><span>${r.short}・${s.label}</span><a href="${s.url}" target="_blank" rel="noopener">${s.url.replace(/^https?:\/\//, '').slice(0, 60)}</a></li>`));
if (srcs.length) $('srcList').innerHTML = srcs.join('');
renderTop(session);
renderBar(cfg);
applyBig(cfg);
session.newGame();
requestAnimationFrame(frame);

if (import.meta.env.DEV) void import('./debug').then((m) => m.attachDebug(session));
