/*
 * 尼爾 2 人偶軍事基地・第二王：強化型飛行裝置（724P [A-lpha]／767P [B-eta]／772P [C-hi]）
 * 三台各對應一隊：724P 西南＝A 隊、767P 北＝B 隊、772P 東南＝C 隊；各隊在自己的王前面。
 * 資料：機制攻略/尼爾2_人偶軍事基地.md（灰機 wiki）＋ _攻略.md（新大陸見聞錄）。
 * 時間軸順序、詠唱秒數、場地大小、王的位置是估計（T）；範圍大小照資料。
 * 略過：導彈亂射、氣浪效果彈頭（輸出慢才出現）、大型燃燼導彈。
 */
import { ALS, type Alliance, type Vec } from '../../core/constants';
import { squareArena } from '../../core/arena';
import { angTo, deg, dirV, polar, dist } from '../../core/geometry';
import type { Shape } from '../../core/shapes';
import { addStatus, alertMsg, at, bossById, moveBoss, present, variant, type Entity, type GameState } from '../../game/state';
import { claim, npcs, settle } from '../../game/bots';
import { REACT } from '../../core/tuning';
import { aoe, buster, castAt, lineStack, raidwide } from '../../mechanics/common';
import { drill, flowHtml } from '../../drills/build';
import type { Encounter } from '../types';
import { gearSet, TOMES } from '../gear';
import { packAt } from '../layout';

const T = {
  half: 22,
  /** 燃燼導彈：每台點對應隊伍 2 人，半徑 8 m，留下火傷區域（資料）；火傷區域秒數（估計） */
  burn: { cast: 4.5, r: 8, fire: 15, spotR: 18, spread: deg(35) },
  /** 高功率激光：每台點對應隊伍 1 人，寬 14 m 直線分攤（資料） */
  laser: { cast: 5, w: 14, len: 40 },
  /** 迴轉斬擊：寬 30 m 直線（資料，這裡做成沿三角形的邊、劍那一側 15 m） */
  slash: { cast: 5, w: 15 },
  /** 高性能追蹤導彈：半徑 6 m（資料） */
  homing: { cast: 4.5, r: 6 },
  /** 突襲轟炸：中型對地導彈半徑 10 m、每秒一發共 9 次（資料）；旋迴斬擊半徑 15 m（資料） */
  raid: { cast: 5, r: 10, n: 9, gap: 1, show: 2.5, spinR: 15 },
  /** 衝鋒斬擊：三台依序對半場（資料：寬 30 m） */
  charge: { cast: 5, gap: 2.4, show: 2.2 },
};

/** 三台的位置（開戰前：724P 西南、767P 北、772P 東南） */
const POS: Record<Alliance, Vec> = { A: { x: -12, y: 9 }, B: { x: 0, y: -13 }, C: { x: 12, y: 9 } };
const ID: Record<Alliance, string> = { A: 'a', B: 'b', C: 'c' };
const NAME: Record<Alliance, string> = { A: '724P', B: '767P', C: '772P' };
const C0: Vec = { x: 0, y: 1.7 };
/** 各隊在自己的王前面（往場中靠） */
const home = (al: Alliance, role: Entity['role']): Vec => packAt({ x: POS[al].x * 0.55 + C0.x * 0.45, y: POS[al].y * 0.55 + C0.y * 0.45 }, role);
const outward = (al: Alliance): Vec => { const a = angTo(C0, POS[al]); return dirV(a); };

/** 啟用防禦程序：各台連線自己的隊伍，給防禦程序 */
function program(G: GameState, t0: number): number {
  const end = castAt(G, t0, '啟用防禦程序', 4, '各隊只能打自己的王（724P＝A、767P＝B、772P＝C）', '767P');
  at(G, end, () => present(G).forEach((e) => addStatus(e, { id: 'prog', name: `防禦程序 ${e.al}`, glyph: e.al, until: G.t + 60, kind: 'buff' })));
  return end + 0.8;
}

/** 燃燼導彈：每台點自己隊伍 2 人，半徑 8 m，留下火傷區域 */
function burn(G: GameState, t0: number): number {
  const me = claim(G, t0), o = T.burn, tag = '攻擊：燃燼導彈';
  const end = castAt(G, t0, tag, o.cast, '被點名的人到自己王的外側放，炸完立刻走出來（會留下火焰區）', '767P');
  const marked = ALS.flatMap((al) => G.rng.shuffle(G.ents.filter((e) => e.al === al)).slice(0, 2));
  const spot = (e: Entity): Vec => { const i = marked.filter((x) => x.al === e.al).indexOf(e); return polar(C0, angTo(C0, POS[e.al]) + (i ? 1 : -1) * o.spread, o.spotR); };
  buster(G, end, { tag, show: o.cast, targets: marked, r: o.r, kind: 'target', spot, why: '燃燼導彈打到隊友' });
  at(G, end, () => marked.forEach((e) => { G.zones.push({ shape: { k: 'circle', x: e.x, y: e.y, r: o.r }, from: G.t + 2.5, until: G.t + o.fire, tag: '火傷區域', why: '踩進燃燼導彈留下的火傷區域', col: 'fire' }); }));
  settle(G, end + 0.4, me);
  return end + 1;
}

/** 高功率激光：每台點自己隊伍 1 人，直線分攤；面向場外分攤 */
function laser(G: GameState, t0: number): number {
  const me = claim(G, t0), o = T.laser, tag = '攻擊：高功率激光';
  const end = castAt(G, t0, tag, o.cast, '各隊在自己王的外側直線分攤（面向場外，面向場內會打到別隊）', '767P');
  const tg = Object.fromEntries(ALS.map((al) => [al, G.rng.pickOne(G.ents.filter((e) => e.al === al))])) as Record<Alliance, Entity>;
  const spot = (e: Entity): Vec => { const v = outward(e.al); return { x: POS[e.al].x + v.x * 4, y: POS[e.al].y + v.y * 4 }; };
  lineStack(G, end, { tag, show: o.cast, from: (e) => bossById(G, ID[e.al]), targets: ALS.map((al) => tg[al]), groupOf: (e) => tg[e.al], w: o.w, len: o.len, spot });
  settle(G, end + 0.4, me);
  return end + 1;
}

/** 迴轉斬擊：三台互相面向（沿三角形的邊），全員左側或右側持劍：外側 → 進三角形內；內側 → 站到頂點正後方 */
export type SlashSide = 'out' | 'in';
function slash(G: GameState, t0: number, side: SlashSide): number {
  const me = claim(G, t0), o = T.slash, tag = '迴轉斬擊';
  at(G, t0, () => alertMsg(G, '協作：迴轉斬擊', 1.5));
  const end = castAt(G, t0, tag, o.cast, side === 'out' ? '光刃在三角形外側：進三角形內側躲' : '光刃在三角形內側：站到頂點（自己王）的正後方', '767P');
  const order: Alliance[] = ['A', 'B', 'C'];
  const shapes: Shape[] = order.map((al, i) => {
    const p = POS[al], q = POS[order[(i + 1) % 3]], H = angTo(p, q), v = dirV(H);
    // 三角形內側的法向量
    let n = { x: -v.y, y: v.x };
    if ((C0.x - p.x) * n.x + (C0.y - p.y) * n.y < 0) n = { x: -n.x, y: -n.y };
    const s = side === 'in' ? 1 : -1;
    return { k: 'rect', O: { x: p.x + n.x * s * (o.w / 2), y: p.y + n.y * s * (o.w / 2) }, H, len: dist(p, q) + 4, w: o.w };
  });
  at(G, t0, () => order.forEach((al, i) => { bossById(G, ID[al]).face = angTo(POS[al], POS[order[(i + 1) % 3]]); }));
  aoe(G, end, shapes, { tag, show: o.cast, why: '站在光刃那一側', ok: side === 'out' ? '進到三角形內側' : '站到頂點後方' });
  at(G, end + 0.3, () => ALS.forEach((al) => { bossById(G, ID[al]).face = angTo(POS[al], C0); }));
  settle(G, end + 0.4, me);
  return end + 1;
}

/** 高性能追蹤導彈：各台的一仇（坦克）半徑 6 m */
function homing(G: GameState, t0: number): number {
  const me = claim(G, t0), o = T.homing, tag = '攻擊：高性能追蹤導彈';
  const end = castAt(G, t0, tag, o.cast, '坦克頭上紅圈：到自己王的外側吃、開減傷', '767P');
  const spot = (e: Entity): Vec => { const v = outward(e.al); return { x: POS[e.al].x + v.x * 6, y: POS[e.al].y + v.y * 6 }; };
  buster(G, end, { tag, show: o.cast, targets: G.ents.filter((e) => e.role === 'MT'), r: o.r, spot });
  settle(G, end + 0.4, me);
  return end + 1;
}

/** 協作：突襲轟炸——三台旋迴斬擊（遠離王），接著場邊步進式對地導彈（之後靠近王躲） */
function raid(G: GameState, t0: number): number {
  const me = claim(G, t0), o = T.raid, tag = '協作：突襲轟炸';
  const end = castAt(G, t0, tag, o.cast, '先遠離王（旋迴斬擊），王的範圍結束後靠近王，躲開另一側過來的步進式導彈', '767P');
  aoe(G, end, ALS.map((al) => ({ k: 'circle' as const, ...POS[al], r: o.spinR })), { tag: '旋迴斬擊', show: o.cast, why: '離王太近，吃到旋迴斬擊（受傷加重）' });
  // 步進式對地導彈：從場地一側橫越到另一側（路線在場地南北其中一邊）
  const fromW = G.rng.chance(0.5), y = G.rng.pickOne([-4, 4]);
  for (let k = 0; k < o.n; k++) {
    const x = (fromW ? -1 : 1) * (T.half - 1 - (k * (T.half * 2 - 2)) / (o.n - 1));
    aoe(G, end + o.show + 0.1 + k * o.gap, { k: 'circle', x, y, r: o.r }, { tag: '中型對地導彈', show: o.show, why: '被步進式對地導彈打中（火傷）', ok: k === o.n - 1 ? '躲開了步進式對地導彈' : null });
  }
  const last = end + o.show + 0.1 + (o.n - 1) * o.gap;
  settle(G, last + 0.4, me);
  return last + 1;
}

/** 協作：衝鋒斬擊——三台飛到北側排成一列，依序左側或右側持劍打半場 */
function charge(G: GameState, t0: number): number {
  const me = claim(G, t0), o = T.charge, tag = '衝鋒斬擊';
  const ROW: Record<Alliance, Vec> = { A: { x: -12, y: -19 }, B: { x: 0, y: -19 }, C: { x: 12, y: -19 } };
  at(G, t0, () => ALS.forEach((al) => { moveBoss(G, ID[al], ROW[al], 1.2); bossById(G, ID[al]).face = Math.PI; }));
  const end = castAt(G, t0, '協作：衝鋒斬擊', o.cast, '三台排在北側，依序伸出光劍：站在沒有光劍的那一側（動畫判定）；先靠近中線比較好換邊', '767P');
  // Bot：先靠到中線附近，換邊比較快
  at(G, t0 + REACT, () => npcs(G).forEach((e) => { const h = home(e.al, e.role); e.mt = { x: Math.sign(h.x || 1) * 1.5, y: h.y }; }));
  for (let k = 0; k < 3; k++) {
    const east = G.rng.chance(0.5);
    aoe(G, end + 0.5 + k * o.gap, { k: 'half', x: 0, y: 0, r: 70, a: east ? deg(90) : deg(270) }, { tag, show: o.show, why: '站在光劍那一側（受傷加重）', ok: k === 2 ? '三次都站在沒有光劍的一側' : null });
  }
  const last = end + 0.5 + 2 * o.gap;
  at(G, last + 0.4, () => ALS.forEach((al) => { moveBoss(G, ID[al], POS[al], 1.2); bossById(G, ID[al]).face = angTo(POS[al], C0); }));
  settle(G, last + 0.4, me);
  return last + 1.6;
}

const fullMissile = (G: GameState, t0: number): number => raidwide(G, t0, '攻擊：導彈全彈發射', 5, '三台依序全場 AOE：補師抬血', '767P') + 1;

function fullSeg(G: GameState, t0: number): number {
  let t = t0;
  const sd = (): SlashSide => (G.rng.chance(0.5) ? 'out' : 'in');
  for (const f of [program, laser, burn, (g: GameState, x: number) => slash(g, x, sd()), homing, fullMissile, raid, charge, laser, (g: GameState, x: number) => slash(g, x, sd()), burn]) t = f(G, t) + 1.5;
  return t;
}

const ALL = ['啟用防禦程序', '攻擊：導彈全彈發射', '攻擊：燃燼導彈', '攻擊：高功率激光', '迴轉斬擊', '攻擊：高性能追蹤導彈', '協作：突襲轟炸', '協作：衝鋒斬擊'];

export const flight: Encounter = {
  id: 'flight',
  name: '強化型飛行裝置',
  sub: '第二王・724P／767P／772P，三隊各打一台',
  arena: squareArena(T.half, 'wall'),
  bosses: ALS.map((al) => ({ id: ID[al], name: NAME[al], ...POS[al], face: angTo(POS[al], C0), r: 3.5, col: { A: '#ff8a8a', B: '#8ad0ff', C: '#ffd36b' }[al] })),
  home,
  pulls: { A: 'a', B: 'b', C: 'c' },
  info: {
    啟用防禦程序: { effect: '724P 連線 A 隊、767P 連線 B 隊、772P 連線 C 隊，給對應的防禦程序：只能打自己隊伍的王（對其他王的攻擊無效）。任一台被打倒時清除所有人的防禦程序。', tell: '三台各自連線一隊。', how: '各隊打自己的王：A 打 724P（西南）、B 打 767P（北）、C 打 772P（東南）。', tank: 'A 隊坦克拉 724P（西南）、B 隊拉 767P（北）、C 隊拉 772P（東南）。', dps: '只能打自己隊的王：打別隊的王無效。' },
    '攻擊：導彈全彈發射': { effect: '三台依序全場 AOE（導彈連續命中）。', tell: '詠唱「導彈全彈發射」。', how: '不用走位，補師抬血。', heal: '三台依序全場傷害，連續三段：先上群盾，持續群補。' },
    '攻擊：燃燼導彈': { effect: '每台點名對應隊伍隨機 2 人，半徑 8 m 圓形，火屬性；留下火傷區域。', tell: '被點名的人頭上出現紫圈。', how: '被點的人把圈放到外側（場外），不要在王身下留下火堆。' },
    '攻擊：高功率激光': { effect: '每台點名對應隊伍隨機 1 人，寬 14 m 直線分攤；魔法受傷加重 5 秒。', tell: '頭上出現分攤標記，王朝他打直線。', how: '<b>面向場外</b>分攤（面向場內可能打到別隊）。' },
    迴轉斬擊: { effect: '三台互相連線、面向彼此，全員左側或右側持劍，對相應半場發動寬 30 m 直線 AOE。', tell: '三台連成三角形，轉向並伸出光刃。', how: '自己王的光刃在三角形<b>外側</b> → 進三角形<b>內側</b>；在<b>內側</b> → 站在三角形<b>頂點正後方</b>。' },
    '攻擊：高性能追蹤導彈': { effect: '一仇出現高傷害預兆，半徑 6 m 圓形高傷害 AOE。', tell: '坦克頭上紅圈。', how: '坦克離開人群、開減傷。', tank: '各隊坦克到自己王的外側吃，開減傷。', heal: '三名坦克同時吃高傷害：先替自己隊的坦克上盾、抬滿血。' },
    '協作：突襲轟炸': { effect: '場邊出現帶箭頭的步進式圓形 AOE（中型對地導彈：半徑 10 m、每秒一發共 9 次，火傷）；同時三台以自身為中心放半徑 15 m 的旋迴斬擊。', tell: '場邊出現帶箭頭的步進式預兆，王準備旋迴斬擊。', how: '先<b>遠離王</b>，站在步進 AOE 的反方向等；王的 AOE 結束後立刻<b>靠近王</b>，躲開另一側過來的步進 AOE。' },
    '協作：衝鋒斬擊': { effect: '三台飛到場地一角／北側排成一列，依序左側或右側持劍，對相應半場發動寬 30 m 直線 AOE；第二次起搭配隨機 4 人的對人導彈。', tell: '三台移到北側排成一列。', how: '看光劍伸出的方向，站在<b>沒有光劍的一側</b>（動畫判定）。' },
  },
  drills: {
    full: drill({ tl: true, name: '完整時間軸', sub: '順序為估計', brief: flowHtml(['啟用防禦程序', '高功率激光', '燃燼導彈', '迴轉斬擊', '高性能追蹤導彈', '導彈全彈發射', '突襲轟炸', '衝鋒斬擊', '（重複）']) + '<p class="bnote">各隊在自己的王前面；資料沒有寫技能順序，這是估計的排法。</p>', info: ALL, seg: fullSeg }),
    laser: drill({ name: '高功率激光', sub: '面向場外直線分攤', brief: '', info: ['攻擊：高功率激光'], mechs: ['攻擊：高功率激光'], seg: laser }),
    burn: drill({ name: '燃燼導彈＋追蹤導彈', sub: '放外側、坦克點名', brief: '', info: ['攻擊：燃燼導彈', '攻擊：高性能追蹤導彈'], mechs: ['攻擊：燃燼導彈', '攻擊：高性能追蹤導彈'], seg: (G, t0) => homing(G, burn(G, t0) + 1) }),
    slash: drill({ name: '迴轉斬擊', sub: '三角形內／外', brief: '', info: ['迴轉斬擊'], mechs: ['迴轉斬擊'], seg: (G, t0) => slash(G, t0, variant<SlashSide>(G, 'slash', G.rng.chance(0.5) ? 'out' : 'in')) }),
    raid: drill({ name: '突襲轟炸', sub: '先遠離、再靠近', brief: '', info: ['協作：突襲轟炸'], mechs: ['旋迴斬擊', '中型對地導彈'], seg: raid }),
    charge: drill({ name: '衝鋒斬擊', sub: '沒有光劍的一側', brief: '', info: ['協作：衝鋒斬擊'], mechs: ['衝鋒斬擊'], seg: charge }),
  },
  variants: {
    slash: [{ key: 'slash', label: '光刃', opts: [
      { value: 'out', label: '在外側', tell: '自己王的光刃在三角形外側', how: '進三角形<b>內側</b>。' },
      { value: 'in', label: '在內側', tell: '自己王的光刃在三角形內側', how: '站在三角形<b>頂點（自己王）正後方</b>。' },
    ] }],
  },
  loot: {
    currency: [[TOMES.詩學, 20], [TOMES.數理, 20]],
    items: [...gearSet('手部', '寄葉五三式', '手套', 'Lv80・品級 490'), ...gearSet('腿部', '寄葉五三式', '軍褲', 'Lv80・品級 490')],
  },
};
