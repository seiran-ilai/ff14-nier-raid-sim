// 設定視窗與改鍵
import { saveConfig, cloneActs, DEFAULT_ACTS, MAX_ACTS, type ActionConfig, type ActType, type Config } from '../core/config';
import type { Session } from '../game/session';
import { $, seg } from './dom';
import { renderBar } from './actionbar';
import { resize } from '../render/canvas';

const TYPE_NAME: Record<ActType, string> = { sprint: '疾跑（加速）', akb: '防擊退', dash: '位移', interject: '插言（打斷）' };
const DIRS: [string, string][] = [['fwd', '前'], ['back', '後'], ['left', '左'], ['right', '右']];

/** 大遊戲畫面、收起側欄：換 body class，換完重算 canvas 大小 */
export function applyBig(cfg: Config): void {
  document.body.classList.toggle('bigstage', cfg.big);
  document.body.classList.toggle('nosides', cfg.hideSides);
  const b = document.getElementById('toggleSides');
  if (b) b.textContent = cfg.hideSides ? '顯示側欄' : '收起側欄';
  resize();
}

/** 正在等待按鍵的技能列索引（−1 表示沒有） */
let capturing = -1;

/** 設定或操作說明開著：遊戲暫停推進 */
export const isSettingsOpen = (): boolean => !$('modal').hidden || !$('help').hidden;

function onoff(cfg: Config, el: HTMLElement, key: 'auto' | 'hint' | 'text' | 'cdReset' | 'sound'): void {
  seg(el, ['on', 'off'], cfg[key] ? 'on' : 'off', (v) => { cfg[key] = v === 'on'; saveConfig(cfg); renderSettings(cfg); }, (v) => (v === 'on' ? '開' : '關'));
}

export function renderSettings(cfg: Config): void {
  seg($('setCam'), ['fixed', 'follow'], cfg.cam, (v) => { cfg.cam = v as Config['cam']; saveConfig(cfg); renderSettings(cfg); }, (v) => (v === 'fixed' ? '固定北在上' : '跟隨角色並放大'));
  seg($('setZoom'), ['near', 'mid', 'far'], cfg.zoom, (v) => { cfg.zoom = v as Config['zoom']; saveConfig(cfg); renderSettings(cfg); }, (v) => ({ near: '近', mid: '中', far: '遠' })[v]);
  seg($('setBig'), ['on', 'off'], cfg.big ? 'on' : 'off', (v) => { cfg.big = v === 'on'; saveConfig(cfg); renderSettings(cfg); applyBig(cfg); }, (v) => (v === 'on' ? '開' : '關'));
  onoff(cfg, $('setSound'), 'sound');
  onoff(cfg, $('setAuto'), 'auto');
  onoff(cfg, $('setHint'), 'hint');
  onoff(cfg, $('setText'), 'text');
  onoff(cfg, $('setCd'), 'cdReset');
  seg($('setSpeed'), [0.6, 0.8, 1], cfg.speed, (v) => { cfg.speed = +v; saveConfig(cfg); renderSettings(cfg); }, (v) => v + 'x');
  const cap = (i: number): string => `<button class="keycap ${capturing === i ? 'wait' : ''}" data-cap="${i}">${capturing === i ? '請按鍵…' : cfg.acts[i].label || '未設定'}</button>`;
  $('acts').innerHTML = cfg.acts.map((a, i) => `<div class="act" data-i="${i}">
    <input data-f="name" value="${a.name.replace(/"/g, '&quot;')}" aria-label="名稱">
    <select data-f="type" aria-label="類型">${Object.entries(TYPE_NAME).map(([k, n]) => `<option value="${k}" ${a.type === k ? 'selected' : ''}>${n}</option>`).join('')}</select>
    ${a.type === 'dash' ? `<span style="display:flex;gap:4px">${cap(i)}<select data-f="dir" aria-label="方向">${DIRS.map(([k, n]) => `<option value="${k}" ${(a.dir || 'fwd') === k ? 'selected' : ''}>${n}</option>`).join('')}</select></span>` : cap(i)}
    ${a.type === 'dash' ? `<input data-f="dist" type="number" min="1" max="40" value="${a.dist}" aria-label="距離">` : '<span class="muted">—</span>'}
    ${a.type !== 'dash' && a.type !== 'interject' ? `<input data-f="dur" type="number" min="1" max="30" value="${a.dur}" aria-label="持續">` : '<span class="muted">—</span>'}
    <input data-f="cd" type="number" min="0" max="300" value="${a.cd}" aria-label="冷卻">
    <button class="btn ghost sm" data-del="${i}">刪除</button></div>`).join('');
}

/** 改鍵中：攔下這次按鍵。回傳 true 表示已處理 */
export function handleCaptureKey(cfg: Config, e: KeyboardEvent): boolean {
  if (capturing < 0) return false;
  e.preventDefault();
  if (e.code === 'Escape') { capturing = -1; renderSettings(cfg); return true; }
  const lab = e.key.length === 1 ? e.key.toUpperCase() : e.key;
  // 同一個鍵只能綁一格
  cfg.acts.forEach((a, i) => { if (i !== capturing && a.code === e.code) { a.code = ''; a.label = ''; } });
  cfg.acts[capturing].code = e.code;
  cfg.acts[capturing].label = lab;
  capturing = -1;
  saveConfig(cfg);
  renderSettings(cfg);
  renderBar(cfg);
  return true;
}

export function bindSettings(session: Session): void {
  const cfg = session.cfg;
  $('acts').addEventListener('change', (e) => {
    const t = e.target as HTMLInputElement | HTMLSelectElement;
    const row = t.closest<HTMLElement>('.act');
    if (!row) return;
    const i = +row.dataset.i!, f = t.dataset.f as keyof ActionConfig | undefined;
    if (!f) return;
    const act = cfg.acts[i] as unknown as Record<string, unknown>;
    let v: string | number = t.value;
    if (f === 'dist' || f === 'dur' || f === 'cd') v = Math.max(0, +v || 0);
    act[f] = v;
    if (f === 'type') {
      if (v === 'dash') { cfg.acts[i].dist = cfg.acts[i].dist || 10; cfg.acts[i].dir = cfg.acts[i].dir || 'fwd'; }
      else cfg.acts[i].dur = cfg.acts[i].dur || (v === 'akb' ? 6 : 10);
    }
    saveConfig(cfg); renderSettings(cfg); renderBar(cfg);
  });
  $('acts').addEventListener('click', (e) => {
    const target = e.target as HTMLElement;
    const c = target.closest<HTMLElement>('[data-cap]');
    if (c) { capturing = +c.dataset.cap!; renderSettings(cfg); return; }
    const d = target.closest<HTMLElement>('[data-del]');
    if (d) { cfg.acts.splice(+d.dataset.del!, 1); saveConfig(cfg); renderSettings(cfg); renderBar(cfg); }
  });
  $('addAct').onclick = () => {
    if (cfg.acts.length >= MAX_ACTS) return;
    cfg.acts.push({ name: '新技能', type: 'dash', dir: 'fwd', code: '', label: '', dist: 10, dur: 0, cd: 30 });
    saveConfig(cfg); renderSettings(cfg); renderBar(cfg);
  };
  $('resetAct').onclick = () => { cfg.acts = cloneActs(DEFAULT_ACTS); saveConfig(cfg); renderSettings(cfg); renderBar(cfg); };
  $('openSet').onclick = () => { session.pause(); $('modal').hidden = false; renderSettings(cfg); };
  $('closeSet').onclick = () => { capturing = -1; $('modal').hidden = true; };
  $('openHelp').onclick = () => { session.pause(); $('help').hidden = false; };
  $('closeHelp').onclick = () => { $('help').hidden = true; };
}
