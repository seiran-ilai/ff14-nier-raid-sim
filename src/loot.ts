// 掉落物整理頁：依部位（部位 → 哪些王掉）或依王（王 → 掉哪些東西）切換；可以只看某個職能版本的裝備
import './styles/tokens.css';
import './styles/layout.css';
import './styles/loot.css';
import { store } from './core/storage';
import { RAIDS, raidById } from './raids';
import { SLOTS, type Encounter, type LootItem, type Raid } from './raids/types';
import { $, seg } from './ui/dom';

/** 裝備的職能版本（寄葉五一式等）：名稱 → 適用職業 */
export const GEAR_KINDS: [string, string][] = [
  ['禦敵', '坦克（騎士・戰士・暗黑騎士・絕槍戰士）'],
  ['制敵', '龍騎士・奪魂者'],
  ['強襲', '武僧・武士'],
  ['遊擊', '忍者・蝰蛇劍士'],
  ['精準', '遠程物理（吟遊詩人・機工士・舞者）'],
  ['詠咒', '法系（黑魔法師・召喚師・赤魔法師・繪靈法師）'],
  ['治癒', '補師（白魔法師・學者・占星術士・賢者）'],
];
const KIND_NAMES = GEAR_KINDS.map(([k]) => k);

type View = 'slot' | 'boss';
const withLoot = RAIDS.filter((r) => r.encounters.some((e) => e.loot));
let raid: Raid = raidById(store.get('lootRaid', '')) ?? withLoot[0];
let view: View = store.get<View>('lootView', 'slot');
let kind: string = store.get('lootKind', 'all');

/** 同一個部位、同一個王掉的裝備：依職能版本列出（選了版本就只列那一件） */
function gearHtml(items: LootItem[]): string {
  const shown = kind === 'all' ? items : items.filter((i) => i.kind === kind);
  if (!shown.length) return '<span class="muted">（沒有這個版本）</span>';
  return `<ul class="litems">${shown.map((i) => `<li><b>${i.name}</b>${i.note ? `<small>${i.note}</small>` : ''}</li>`).join('')}</ul>`;
}

const bosses = (): Encounter[] => raid.encounters.filter((e) => e.loot);
const gearOf = (e: Encounter): LootItem[] => e.loot!.items.filter((i) => i.slot);
const otherOf = (e: Encounter): LootItem[] => e.loot!.items.filter((i) => !i.slot);
const bossTag = (e: Encounter): string => `<span class="lboss">${raid.encounters.indexOf(e) + 1}・${e.name}</span>`;

function bySlot(): string {
  const parts = SLOTS.map((slot) => {
    const from = bosses().filter((e) => gearOf(e).some((i) => i.slot === slot));
    if (!from.length) return '';
    return `<section class="card lsec"><h2>${slot}<span class="muted">${from.length} 個王會掉</span></h2>
      ${from.map((e) => `<div class="lline">${bossTag(e)}${gearHtml(gearOf(e).filter((i) => i.slot === slot))}</div>`).join('')}</section>`;
  }).join('');
  const others = bosses().filter((e) => otherOf(e).length);
  const otherHtml = others.length ? `<section class="card lsec"><h2>其他（寵物、幻卡、樂譜、兌換道具）</h2>
    ${others.map((e) => `<div class="lline">${bossTag(e)}<ul class="litems">${otherOf(e).map((i) => `<li><b>${i.name}</b><small>${i.kind ?? ''}</small></li>`).join('')}</ul></div>`).join('')}</section>` : '';
  return parts + otherHtml + currencyHtml();
}

function byBoss(): string {
  return bosses().map((e) => {
    const L = e.loot!, slots = SLOTS.filter((s) => gearOf(e).some((i) => i.slot === s));
    return `<section class="card lsec"><h2>${raid.encounters.indexOf(e) + 1}・${e.name}<span class="muted">${slots.join('・') || '沒有裝備'}</span></h2>
      ${L.currency?.length ? `<p class="lcur">${L.currency.map(([n, c]) => `${n} ×${c}`).join('　')}</p>` : ''}
      ${slots.map((s) => `<div class="lline"><span class="lslot">${s}</span>${gearHtml(gearOf(e).filter((i) => i.slot === s))}</div>`).join('')}
      ${otherOf(e).length ? `<div class="lline"><span class="lslot">其他</span><ul class="litems">${otherOf(e).map((i) => `<li><b>${i.name}</b><small>${i.kind ?? ''}</small></li>`).join('')}</ul></div>` : ''}
    </section>`;
  }).join('');
}

function currencyHtml(): string {
  const list = bosses().filter((e) => e.loot!.currency?.length);
  if (!list.length) return '';
  return `<section class="card lsec"><h2>通關貨幣</h2>${list.map((e) => `<div class="lline">${bossTag(e)}<span>${e.loot!.currency!.map(([n, c]) => `${n} ×${c}`).join('　')}</span></div>`).join('')}</section>`;
}

function render(): void {
  seg($('lRaid'), withLoot.map((r) => r.id), raid.id, (v) => { raid = raidById(v)!; store.set('lootRaid', v); render(); }, (v) => { const r = raidById(v)!; return `${r.short}・${r.name}`; });
  seg($('lView'), ['slot', 'boss'], view, (v) => { view = v as View; store.set('lootView', v); render(); }, (v) => (v === 'slot' ? '依部位（部位 → 王）' : '依王（王 → 部位）'));
  seg($('lKind'), ['all', ...KIND_NAMES], kind, (v) => { kind = v; store.set('lootKind', v); render(); }, (v) => (v === 'all' ? '全部' : v));
  const legend = `<details class="card llegend"><summary>職能版本對照</summary><dl>${GEAR_KINDS.map(([k, j]) => `<dt>${k}</dt><dd>${j}</dd>`).join('')}</dl></details>`;
  $('lBody').innerHTML = (bosses().length ? (view === 'slot' ? bySlot() : byBoss()) : '<p class="muted">這個副本的掉落還沒整理。</p>') + legend;
  $('lSrc').innerHTML = raid.sources.length ? `資料來源：${raid.sources.map((s) => `<a href="${s.url}" target="_blank" rel="noopener">${s.label}</a>`).join('・')}` : '';
}

render();
