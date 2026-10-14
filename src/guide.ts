// 機制教學頁：一整頁往下捲，副本 → 王 → 每個練習項目一段：動態圖＋效果／預兆／應對（全部展開）。
// 左側（手機是下拉選單）是索引。動態圖直接跑模擬器的教學示範（同一套機制與照攻略站位的 Bot），
// 黃色「你」是選的座位。同一時間只播放畫面中的那一段。
import './styles/tokens.css';
import './styles/layout.css';
import './styles/guide.css';
import { ALS, ROLES, type Alliance, type Role } from './core/constants';
import { defaultConfig, loadConfig, saveConfig } from './core/config';
import { fmtT } from './core/format';
import { RAIDS } from './raids';
import { ALL_DRILLS, drillRef, findInfo, singleForMech, type DrillRef } from './drills';
import { mechInfoHtml } from './drills/build';
import type { VariantGroup } from './raids/types';
import { Session } from './game/session';
import { newInput } from './game/simulation';
import { initCanvas, resize } from './render/canvas';
import { draw } from './render';
import { $, seg } from './ui/dom';

const KEYS = ALL_DRILLS.map((d) => d.key);
const SPEEDS = [0.5, 1, 2, 4];
const sid = (k: string): string => `k-${k.replace(/\//g, '-')}`;

// 教學頁用自己的設定（不存檔）：座位沿用模擬器上次選的，鏡頭固定、提示全開；
// 文字說明不畫在場地上，改在動態圖上下的文字列
const saved = loadConfig();
const cfg = { ...defaultConfig(), al: saved.al, role: saved.role, cam: 'fixed' as const, hint: true, text: false };
const session = new Session(cfg, newInput(), false);
let active = '';
const seed = 1;
let playing = true, speed = 1, endWait = 0;

const sec = (k: string): HTMLElement => $(sid(k));
const q = <T extends HTMLElement = HTMLElement>(k: string, cls: string): T => sec(k).querySelector<T>(`.${cls}`)!;

const STEP_KEY = 'step';
/** 每段的選擇列：「看哪個機制」＋各組樣式 */
const groupsOf = (k: string): VariantGroup[] => {
  const r = drillRef(k)!;
  return [
    ...(r.drill.steps ? [{ key: STEP_KEY, label: '機制', opts: r.drill.steps.map(([label, value]) => ({ value, label, tell: '', how: '' })) }] : []),
    ...(r.enc.variants?.[r.id] ?? []),
  ];
};

const picks: Record<string, Record<string, string>> = {};
const pickOf = (k: string): Record<string, string> =>
  (picks[k] ??= Object.fromEntries(groupsOf(k).map((g) => [g.key, g.opts[0].value])));

function renderVariants(k: string): void {
  const box = sec(k).querySelector<HTMLElement>('[data-var]');
  if (!box) return;
  const cur = pickOf(k);
  box.innerHTML = groupsOf(k).map((g) => {
    const chips = g.opts.map((o) => `<button class="chip" data-vk="${g.key}" data-vv="${o.value}" aria-pressed="${cur[g.key] === o.value}">${o.label}</button>`).join('');
    const info = g.key === STEP_KEY || g.opts.every((o) => !o.tell && !o.how) ? '' : `<div class="gvinfo">${g.opts.map((o) => `<div class="gvopt${cur[g.key] === o.value ? ' sel' : ''}"><b>${o.label}</b><dl class="midl">${o.tell ? `<dt class="tell">預兆</dt><dd>${o.tell}</dd>` : ''}<dt class="how">應對</dt><dd>${o.how}</dd></dl></div>`).join('')}</div>`;
    return `<div class="gvrow"><span class="lbl">${g.label}</span><span class="grp">${chips}</span></div>${info}`;
  }).join('');
}

function restart(): void {
  if (!active) return;
  cfg.drill = active;
  const { [STEP_KEY]: step, ...pick } = pickOf(active);
  session.pick = pick;
  session.startAt = 0;
  // 選了「看哪個機制」：先排一次找出那個機制在時間軸的時間，再從那裡開始（前面照攻略快轉）
  let G = session.newGame(true, seed, 0);
  const t = step ? G.seq.find((s) => s.label.includes(step))?.t ?? 0 : 0;
  if (t > 0) G = session.newGame(true, seed, t);
  G.countT = 0.8;
  endWait = 0;
}

function activate(k: string): void {
  if (k === active) return;
  if (active) sec(active).classList.remove('playing');
  active = k;
  sec(k).classList.add('playing');
  initCanvas(q<HTMLCanvasElement>(k, 'gcv'));
  resize();
  restart();
  document.querySelectorAll('#gnav .gitem').forEach((b) => b.classList.toggle('on', (b as HTMLElement).dataset.k === k));
  ($('gsel') as HTMLSelectElement).value = k;
}

/** 機制說明卡（全部展開）＋「到模擬器練這個」 */
const mechCard = (n: string, r: DrillRef): string =>
  mechInfoHtml(n, findInfo(n, r.enc), true).replace('</details>', `<button class="btn ghost sm gmigo" data-go="${singleForMech(n) ?? r.key}">到模擬器練這個</button></details>`);

function sectionHtml(r: DrillRef): string {
  const D = r.drill, info = D.info ?? [];
  return `<section class="gsec card" id="${sid(r.key)}" data-k="${r.key}">
    <div class="ghead"><h2>${D.name}</h2><span class="muted">${r.enc.name}・${D.sub}</span><span class="gwhy muted"></span></div>
    <div class="gcols">
      <div class="gplayer">
        <div class="gstage" title="點畫面暫停／播放"><canvas class="gcv"></canvas>
          <div class="gtop"><div class="gcap"></div><span class="gtime"></span></div>
          <div class="gbot"><span class="galert"></span></div>
          <div class="gidle">捲到這一段就會播放</div></div>
        ${groupsOf(r.key).length ? `<div class="gvar" data-var></div>` : ''}
        <div class="gctrl">
          <button class="btn ghost sm" data-go="${r.key}">到模擬器練這個</button>
          <span class="muted">點畫面＝暫停／播放・播完自動重播</span>
        </div>
      </div>
      <div class="gtext">
        ${D.brief ? `<div class="btext open">${D.brief}</div>` : ''}
        ${info.length ? `<div class="mihead"><span>機制說明（效果 → 預兆 → 應對）</span></div><div class="milist">${info.map((n) => mechCard(n, r)).join('')}</div>` : ''}
      </div>
    </div></section>`;
}

function renderPage(): void {
  const withData = RAIDS.filter((raid) => raid.encounters.length);
  const pending = RAIDS.filter((raid) => !raid.encounters.length);
  $('gnav').innerHTML = withData.map((raid) => `<div class="ggroup"><p>${raid.short}・${raid.name}</p>${raid.encounters.map((enc) =>
    `<span class="genc">${enc.name}</span>${ALL_DRILLS.filter((d) => d.enc === enc).map((d) => `<a class="gitem" href="#${sid(d.key)}" data-k="${d.key}">${d.drill.name}</a>`).join('')}`).join('')}</div>`).join('')
    + (pending.length ? `<div class="ggroup"><p>準備中</p>${pending.map((r) => `<span class="genc">${r.short}・${r.name}</span>`).join('')}</div>` : '');
  $('gsel').innerHTML = withData.map((raid) => raid.encounters.map((enc) =>
    `<optgroup label="${raid.short}・${enc.name}">${ALL_DRILLS.filter((d) => d.enc === enc).map((d) => `<option value="${d.key}">${d.drill.name}</option>`).join('')}</optgroup>`).join('')).join('');
  $('gbody').innerHTML = withData.map((raid) => `<h2 class="gphase">${raid.short}・${raid.name}</h2>${raid.encounters.map((enc) =>
    `<h3 class="genchead">${enc.name}<small>${enc.sub}</small></h3>${ALL_DRILLS.filter((d) => d.enc === enc).map(sectionHtml).join('')}`).join('')}`).join('')
    + pending.map((raid) => `<h2 class="gphase">${raid.short}・${raid.name}</h2><p class="muted">${raid.note ?? '資料準備中。'}</p>`).join('');
}

function renderSeat(): void {
  seg($('alSeg'), ALS, cfg.al, (v) => { cfg.al = v as Alliance; renderSeat(); restart(); });
  seg($('roleSeg'), ROLES, cfg.role, (v) => { cfg.role = v as Role; renderSeat(); restart(); });
  $('seatInfo').textContent = `${cfg.al} 隊 ${cfg.role}`;
  $('gnote').textContent = `動態圖中黃色「你」＝ ${cfg.al} 隊 ${cfg.role}`;
  KEYS.forEach((k) => {
    const r = drillRef(k)!, why = r.enc.unrelated?.(r.id, cfg.al, cfg.role);
    q(k, 'gwhy').textContent = why ? `・你的座位：${why}` : '';
    document.querySelector(`#gnav [data-k="${k}"]`)?.classList.toggle('dim', !!why);
  });
}

function jump(k: string): void {
  sec(k).scrollIntoView({ behavior: 'smooth', block: 'start' });
  history.replaceState(null, '', `#${sid(k)}`);
  activate(k);
}

const lastHtml = new Map<HTMLElement, string>();
const put = (el: HTMLElement, h: string): void => { if (lastHtml.get(el) !== h) { lastHtml.set(el, h); el.innerHTML = h; } };

/** 動態圖上方＝詠唱名稱／讀條／處理方式與時間；下方＝王台詞與提示 */
function updCaption(): void {
  const G = session.G;
  if (!G || !active) return;
  const c = G.cast && G.state === 'run' && G.t < G.cast.start + G.cast.dur ? G.cast : null;
  put(q(active, 'gcap'), c
    ? `<div class="gcast"><b>${c.name}</b><span>${Math.max(0, c.start + c.dur - G.t).toFixed(1)}</span></div><i class="gprog"><i style="width:${((G.t - c.start) / c.dur) * 100}%"></i></i>${c.tip ? `<em>${c.tip}</em>` : ''}`
    : '');
  const line = G.line && G.t < G.line.until ? G.line : null;
  const al = G.alert && G.t < G.alert.until ? G.alert.text : '';
  put(q(active, 'galert'), [line && `<span class="gline"><small>${line.who ?? ''}</small>${line.text}</span>`, al && `<b>${al}</b>`].filter(Boolean).join(''));
  q(active, 'gtime').textContent = !playing ? '⏸ 已暫停・點畫面繼續' : G.state === 'end' ? '結束，馬上重播' : fmtT(G.t);
}

let last = performance.now();
function frame(now: number): void {
  const real = Math.min(0.1, (now - last) / 1000);
  last = now;
  const G = session.G;
  if (G && playing) {
    if (G.state === 'end') { endWait += real; if (endWait > 2) restart(); }
    else session.advance(real * speed);
  }
  draw(session.G, cfg, { alpha: session.alpha });
  updCaption();
  requestAnimationFrame(frame);
}

renderPage();
KEYS.forEach(renderVariants);
renderSeat();
const renderSpeed = (): void => seg($('gSpeed'), SPEEDS, speed, (v) => { speed = +v; renderSpeed(); }, (v) => `${v}x`);
renderSpeed();

$('gnav').onclick = (e) => {
  const a = (e.target as HTMLElement).closest<HTMLElement>('[data-k]');
  if (!a) return;
  e.preventDefault();
  jump(a.dataset.k!);
};
($('gsel') as HTMLSelectElement).onchange = (e) => jump((e.target as HTMLSelectElement).value);
$('gbody').onclick = (e) => {
  const t = e.target as HTMLElement;
  const st = t.closest<HTMLElement>('.gstage');
  if (st) {
    const k = st.closest<HTMLElement>('.gsec')!.dataset.k!;
    if (k !== active) { activate(k); playing = true; } else playing = !playing;
    return;
  }
  // 到模擬器練這個：帶著座位與練習項目回到模擬器
  const go = t.closest<HTMLElement>('[data-go]');
  if (go) {
    const c = loadConfig(), r = drillRef(go.dataset.go!);
    Object.assign(c, { drill: go.dataset.go!, al: cfg.al, role: cfg.role, pick: 'one' }, r ? { raid: r.raid.id, enc: r.enc.id } : {});
    saveConfig(c);
    location.href = './index.html';
    return;
  }
  const v = t.closest<HTMLElement>('[data-vk]');
  if (v) {
    const k = v.closest<HTMLElement>('.gsec')!.dataset.k!;
    pickOf(k)[v.dataset.vk!] = v.dataset.vv!;
    renderVariants(k);
    if (k === active) restart(); else activate(k);
    playing = true;
  }
};

// 捲動時：畫面中露出最多的那一段開始播放
if (typeof IntersectionObserver === 'function') {
  const vis = new Map<string, number>();
  const io = new IntersectionObserver((es) => {
    es.forEach((en) => vis.set((en.target as HTMLElement).dataset.k!, en.isIntersecting ? en.intersectionRatio : 0));
    let best = '', bestR = 0;
    vis.forEach((r, k) => { if (r > bestR) { best = k; bestR = r; } });
    if (best && bestR > 0.25) activate(best);
  }, { threshold: [0, 0.25, 0.5, 0.75, 1] });
  document.querySelectorAll<HTMLElement>('.gsec').forEach((s) => io.observe(s));
}
window.addEventListener('resize', resize);

const fromHash = KEYS.find((k) => `#${sid(k)}` === location.hash);
if (KEYS.length) activate(fromHash ?? KEYS[0]);
if (fromHash) sec(fromHash).scrollIntoView();
requestAnimationFrame(frame);
