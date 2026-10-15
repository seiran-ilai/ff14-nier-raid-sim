// 上方：隊伍（A／B／C）、職能（坦／補／D）、副本 → 練習方式 → 王 → 練習項目；右側：本項目紀錄、最常錯的機制
import { saveConfig, type PickMode } from '../core/config';
import { RAIDS, raidById } from '../raids';
import type { Raid } from '../raids/types';
import { SINGLES, encMain, getDrill, randKey, singleForMech } from '../drills';
import type { Session } from '../game/session';
import { getDrillStat, worstMechs, clearMechStats } from '../game/stats';
import { ALS, PICK_NAME, PICK_ROLES, roleType, type Alliance, type Role } from '../core/constants';
import { syncActs } from '../core/config';
import { renderBar } from './actionbar';
import { $, seg } from './dom';

export function renderStats(session: Session): void {
  const s = getDrillStat(session.cfg.drill);
  $('sOk').textContent = String(s.ok);
  $('sAll').textContent = String(s.all);
  $('sStreak').textContent = String(s.streak);
  renderWeak(session);
}

/** 常錯機制：錯最多的在上面；一鍵只練最常錯的 3 個 */
function renderWeak(session: Session): void {
  const w = worstMechs(99);
  const keys = [...new Set(w.slice(0, 3).map((m) => singleForMech(m.mech)).filter((k): k is string => !!k))];
  $('weak').innerHTML = `<h3>常錯機制${w.length ? `（${w.length}）` : ''}</h3>${w.length
    ? `<div class="weakhead"><span>機制</span><span>失誤</span><span>成功率</span></div>
       <ul class="weaklist">${w.map((m) => `<li><span class="wn" title="${m.mech}">${m.mech}</span><b>${m.all - m.ok}</b>
         <span class="wr"><i style="width:${Math.round(m.rate * 100)}%"></i><em>${Math.round(m.rate * 100)}%</em></span></li>`).join('')}</ul>
       <div class="row">${keys.length ? '<button class="btn sm" id="wGo">只練最常錯的</button>' : ''}<button class="btn ghost sm" id="wClr">清除紀錄</button></div>`
    : '<p class="muted">還沒有失誤紀錄。自己練（不是教學示範）結束後會統計每個機制的成功率。</p>'}`;
  const go = document.getElementById('wGo');
  if (go) go.onclick = () => pickDrill(session, 'weak:' + keys.join(','));
  const clr = document.getElementById('wClr');
  if (clr) clr.onclick = () => { clearMechStats(); renderWeak(session); };
}

export function pickDrill(session: Session, key: string): void {
  const cfg = session.cfg;
  cfg.drill = key;
  const r = getDrill(key);
  if (!key.startsWith('rand:') && !key.startsWith('weak:')) { cfg.raid = r.raid.id; cfg.enc = r.enc.id; }
  session.startAt = 0;
  saveConfig(cfg);
  renderTop(session);
  session.newGame();
}

const modeOf = (key: string): PickMode => (key.startsWith('rand:') ? 'rand' : key.startsWith('cont:') ? 'cont' : 'one');

/** 上方選的副本（沒選過就是目前練習所在的副本） */
const selRaid = (session: Session): Raid => raidById(session.cfg.raid) ?? getDrill(session.cfg.drill).raid;
const selEnc = (raid: Raid, id: string) => raid.encounters.find((e) => e.id === id) ?? raid.encounters[0];

export function renderTop(session: Session): void {
  const cfg = session.cfg;
  const raid = selRaid(session), enc = selEnc(raid, cfg.enc);
  const mode = modeOf(cfg.drill);
  seg($('alSeg'), ALS, cfg.al, (v) => { cfg.al = v as Alliance; saveConfig(cfg); renderTop(session); session.newGame(); });
  seg($('roleSeg'), PICK_ROLES, cfg.role as (typeof PICK_ROLES)[number], (v) => { cfg.role = v as Role; syncActs(cfg); saveConfig(cfg); renderBar(cfg); renderTop(session); session.newGame(); }, (v) => PICK_NAME[v]);
  // 機制說明裡自己職能的那一行要醒目（CSS：body[data-role]）
  document.body.dataset.role = roleType(cfg.role);
  const row = (label: string, items: string): string => `<span class="lbl">${label}</span><div class="items">${items}</div>`;

  $('raidRow').innerHTML = row('副本', RAIDS.map((r) =>
    `<button class="raidbtn" data-raid="${r.id}" aria-pressed="${r.id === raid.id}"><small>${r.short}</small>${r.name}${r.encounters.length ? '' : '<em>準備中</em>'}</button>`).join(''));

  const MODES: [PickMode, string, string][] = [
    ['one', '單一王', '練一個王的完整時間軸或單一機制'],
    ['cont', '整個副本', '從第一個王連續打到最後一個王'],
    ['rand', '隨機練習', '從勾選的機制隨機出題'],
  ];
  $('drillsMode').innerHTML = row('練習方式', `<div class="modeseg" role="radiogroup">${MODES.map(([m, name, tip]) =>
    `<button class="modebtn" role="radio" data-mode="${m}" aria-checked="${m === mode}" title="${tip}">${name}</button>`).join('')}</div>`);

  const btn = (key: string, label: string, sub: string, tl = false): string =>
    `<button class="drill${tl ? ' tl' : ''}" data-k="${key}" aria-pressed="${key === cfg.drill}" title="${sub}">${label}</button>`;
  if (!raid.encounters.length) {
    $('drillsEnc').innerHTML = row('王', `<span class="muted rowhint">${raid.short}「${raid.name}」${raid.note ?? '資料準備中。'}</span>`);
    $('drillsOne').innerHTML = '';
  } else if (mode === 'rand') {
    $('drillsEnc').innerHTML = row('王', `<span class="muted rowhint">隨機練習：在左側勾選要出的機制、重複與時間（目前 ${cfg.rand.mins} 分鐘・${cfg.rand.repeat ? '可重複' : '不重複'}）</span>`);
    $('drillsOne').innerHTML = '';
  } else if (mode === 'cont') {
    $('drillsEnc').innerHTML = row('王', btn(`cont:${raid.id}`, `${raid.encounters.map((e) => e.name).join(' → ')}`, '從第一個王連續打到最後', true));
    $('drillsOne').innerHTML = '';
  } else {
    $('drillsEnc').innerHTML = row('王', raid.encounters.map((e, i) =>
      `<button class="drill tl" data-enc="${e.id}" aria-pressed="${e === enc}" title="${e.sub}"><small>${i + 1}</small> ${e.name}</button>`).join(''));
    $('drillsOne').innerHTML = row('練習項目', Object.entries(enc.drills).map(([id, d]) =>
      btn(`${raid.id}/${enc.id}/${id}`, d.tl ? `${d.name}（完整）` : d.name, d.sub, d.tl)).join(''));
  }
  renderStats(session);
}

export function bindDrillPicker(session: Session): void {
  const cfg = session.cfg;
  const pickEnc = (raid: Raid, encId: string): void => {
    const e = selEnc(raid, encId);
    if (e) pickDrill(session, encMain(raid, e).key);
  };
  $('raidRow').onclick = (e) => {
    const b = (e.target as HTMLElement).closest<HTMLElement>('[data-raid]');
    if (!b) return;
    const raid = raidById(b.dataset.raid!)!;
    cfg.raid = raid.id;
    b.blur();
    if (!raid.encounters.length) { saveConfig(cfg); renderTop(session); return; }
    if (modeOf(cfg.drill) === 'cont') pickDrill(session, `cont:${raid.id}`);
    else pickEnc(raid, raid.encounters[0].id);
  };
  $('drillsMode').onclick = (e) => {
    const b = (e.target as HTMLElement).closest<HTMLElement>('[data-mode]');
    if (!b) return;
    const m = b.dataset.mode as PickMode, raid = selRaid(session);
    cfg.pick = m;
    b.blur();
    if (m === 'rand') {
      const ids = cfg.rand.ids.filter((id) => SINGLES.some((d) => d.key === id));
      pickDrill(session, randKey({ repeat: cfg.rand.repeat, mins: cfg.rand.mins, ids: ids.length ? ids : SINGLES.map((d) => d.key) }));
    } else if (!raid.encounters.length) { saveConfig(cfg); renderTop(session); }
    else if (m === 'cont') pickDrill(session, `cont:${raid.id}`);
    else pickEnc(raid, cfg.enc);
  };
  $('drillsEnc').onclick = (e) => {
    const b = (e.target as HTMLElement).closest<HTMLElement>('[data-enc],[data-k]');
    if (!b) return;
    b.blur();
    if (b.dataset.k) pickDrill(session, b.dataset.k);
    else pickEnc(selRaid(session), b.dataset.enc!);
  };
  $('drillsOne').onclick = (e) => {
    const b = (e.target as HTMLElement).closest<HTMLElement>('[data-k]');
    if (!b) return;
    b.blur();
    pickDrill(session, b.dataset.k!);
  };
}
