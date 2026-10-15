/*
 * 尼爾 2 人偶軍事基地・最終王：融合的人偶群 → 2P：融合體
 * 資料：機制攻略/尼爾2_人偶軍事基地.md（灰機 wiki）＋ _攻略.md（新大陸見聞錄）。
 * 時間軸順序、詠唱秒數、場地大小、站位是估計（T）；範圍大小照資料。
 * 略過：傳送（光圈連線判斷真身）、分裂體、輔助機融合體 R011／R012。
 */
import { ALS, type Alliance, type Vec } from '../../core/constants';
import { squareArena } from '../../core/arena';
import { angTo, deg, polar } from '../../core/geometry';
import type { Shape } from '../../core/shapes';
import { REACT } from '../../core/tuning';
import { alertMsg, at, bossById, encData, moveBoss, present, variant, type Entity, type GameState, type Telegraph } from '../../game/state';
import { claim, findSafe, npcs, settle } from '../../game/bots';
import { aoe, castAt, chase, knockback, raidwide, spread, stack, towers } from '../../mechanics/common';
import { drill, flowHtml } from '../../drills/build';
import { text } from '../../render/canvas';
import type { Encounter } from '../types';
import { gearSet, TOMES } from '../gear';
import { assignSpots, clusterHome } from '../layout';

const T = {
  half: 20,
  /** 場地外側持續傷害區域寬度（估計） */
  edge: 2,
  /** 斬機光擊：環形，安全區半徑 8 m；斷機光擊：寬 11 m 直線（資料） */
  donut: { cast: 5, safe: 8 },
  cross: { cast: 5, w: 11 },
  /** 碎機光擊：每隊 2 人位置＋每隊 2 人點名，半徑 6 m（資料） */
  shatter: { cast: 5, r: 6, spotR: 15 },
  reverse: { cast: 4, w: 11, show: 3.5 },
  /** 渦狀光線奔湧：隨機 3 人，連續 3 次半徑 8 m（資料） */
  vortex: { cast: 4, n: 3, gap: 1.2, lag: 1.6, r: 8, lead: 3 },
  /** 斬機擊：填充：鋼鐵半徑 20 m、正面寬 20 m、月環安全區 8 m（資料） */
  fill: { cast: 5, steel: 20, front: 20, safe: 8 },
  /** 三連衝擊斬：半徑 6 m 分攤 ×3，擊退（距離估計） */
  triple: { cast: 4.5, r: 6, gap: 1.3, kb: 3 },
  /** 四連斷重擊：半徑 6 m 圓、寬 12 m 直線（資料） */
  four: { cast: 5, r: 6, w: 12, gap: 1.6, lead: 1.5 },
  /** 能量凝縮：6 個圈，有人＝半徑 5 m 爆炸（資料） */
  condense: { cast: 5, r: 3, boom: 5, ringR: 12 },
};

const C0: Vec = { x: 0, y: 0 };
const P2: Vec = { x: 0, y: -10 };
const home = clusterHome(C0, 8);

/** 第二階段：人偶群消失、2P 出現 */
function toPhase2(G: GameState, t: number): void {
  at(G, t, () => { bossById(G, 'group').hidden = true; const p = bossById(G, '2p'); p.hidden = false; p.x = p.px = P2.x; p.y = p.py = P2.y; });
}

// ---------- 第一階段：融合的人偶群 ----------

function donut(G: GameState, t0: number): number {
  const me = claim(G, t0), o = T.donut, tag = '斬機光擊';
  const end = castAt(G, t0, tag, o.cast, '人偶群水平旋轉＝環形：到王的腳下', '融合的人偶群');
  aoe(G, end, { k: 'ring', x: 0, y: 0, r0: o.safe, r1: 60 }, { tag, show: o.cast, why: '離王太遠，被斬機光擊打中（受傷加重）' });
  settle(G, end + 0.4, me);
  return end + 1;
}

function crossCut(G: GameState, t0: number): number {
  const me = claim(G, t0), o = T.cross, tag = '斷機光擊';
  const end = castAt(G, t0, tag, o.cast, '人偶群前後旋轉＝直線：躲開紅色直線（到兩側）', '融合的人偶群');
  aoe(G, end, { k: 'line', x: 0, y: 0, a: 0, hw: o.w / 2 }, { tag, show: o.cast, why: '站在斷機光擊的直線上（受傷加重）' });
  settle(G, end + 0.4, me);
  return end + 1;
}

/** 碎機光擊：每隊 2 人位置的地面圓，接著每隊 2 人點名分散 */
const SHATTER_SPOT: Vec[] = [0, 45, 90, 135, 180, 225, 270, 315].map((a) => polar(C0, deg(a), T.shatter.spotR));
function shatter(G: GameState, t0: number): number {
  const me = claim(G, t0), o = T.shatter, tag = '碎機光擊';
  const end = castAt(G, t0, tag, o.cast, '地面圓圈（每隊 2 人的位置）＋點名圈（每隊 2 人）：先躲地面圓，被點的人再分散到場邊', '融合的人偶群');
  const ground = ALS.flatMap((al) => G.rng.shuffle(G.ents.filter((e) => e.al === al)).slice(0, 2));
  const marked = ALS.flatMap((al) => G.rng.shuffle(G.ents.filter((e) => e.al === al && !ground.includes(e))).slice(0, 2));
  let spotOf: number[] | null = null;
  const spot = (_e: Entity, i: number): Vec => SHATTER_SPOT[(spotOf ??= assignSpots(marked.map((e) => ({ x: e.x, y: e.y })), SHATTER_SPOT))[i]];
  // 地面圓落在每隊 2 人當下的位置：先全部躲地面圓（被點名的人也是），地面圓炸完被點名的人再去場邊分散
  at(G, end - 2.5, () => {
    const circles: Shape[] = ground.filter((e) => !e.dead).map((e) => ({ k: 'circle', x: e.x, y: e.y, r: o.r }));
    aoe(G, end, circles, { tag, show: 2.5, why: '被碎機光擊的地面圓打中', ok: null, dodge: false });
    const avoid: Telegraph[] = circles.map((s) => ({ ...s, until: end }));
    npcs(G).forEach((e) => { e.mt = findSafe(G, e, avoid); });
  });
  at(G, end + 0.05, () => npcs(G).forEach((e) => { const i = marked.indexOf(e); e.mt = i >= 0 ? spot(e, i) : { x: G.rng.rnd(-2, 2), y: G.rng.rnd(-2, 2) }; }));
  spread(G, end + 3, { tag, show: o.cast + 3, r: o.r, targets: marked, spot });
  settle(G, end + 3.4, me);
  return end + 4;
}

/** 逆斷震迴旋：人偶群消失，出現在相鄰兩邊，各打一條直線 */
function reverse(G: GameState, t0: number): number {
  const me = claim(G, t0), o = T.reverse, tag = '逆斷震迴旋';
  at(G, t0, () => { bossById(G, 'group').hidden = true; });
  const end = castAt(G, t0, tag, o.cast, '人偶群出現在場邊：站到它對應的那一行／列之外', '融合的人偶群');
  const x = G.rng.rnd(-12, 12), y = G.rng.rnd(-12, 12);
  const shapes: Shape[] = [{ k: 'line', x, y: 0, a: 0, hw: o.w / 2 }, { k: 'line', x: 0, y, a: deg(90), hw: o.w / 2 }];
  aoe(G, end + 0.5, shapes, { tag, show: o.show, why: '站在場邊人偶群對應的直線上（受傷加重）' });
  at(G, end + 0.8, () => { bossById(G, 'group').hidden = false; });
  settle(G, end + 0.9, me);
  return end + 1.4;
}

/** 壓制光擊（轉場）：全場傷害＋擊退，所有人擊倒；接著 2P：融合體登場 */
function transition(G: GameState, t0: number): number {
  const tag = '壓制光擊（轉場）';
  const end = castAt(G, t0, '壓制光擊', 5, '轉場：全場傷害＋從中央擊退，之後被擊倒', '融合的人偶群');
  knockback(G, end, { tag, show: 5, from: C0, dist: 6, spot: (e) => home(e.al, e.role) });
  at(G, end + 0.8, () => { present(G).forEach((e) => { e.stun = G.t + 2; e.stunKind = 'stun'; }); alertMsg(G, '2P：融合體', 2); });
  toPhase2(G, end + 1);
  return end + 3.5;
}

// ---------- 第二階段：2P：融合體 ----------

/** 渦狀光線奔湧：隨機 3 人位置連續 3 次半徑 8 m；被點的人沿場邊跑，其他人到場中 */
function vortex(G: GameState, t0: number): number {
  const me = claim(G, t0), o = T.vortex, tag = '渦狀光線奔湧';
  const end = castAt(G, t0, tag, o.cast, '被點名的 3 人沿著場邊一直跑（連炸 3 次），其他人到場中', '2P');
  const list = G.rng.shuffle(G.ents).slice(0, 3);
  const STARTS = [0, 120, 240].map(deg);
  let startOf: number[] | null = null;
  const len = (o.n * o.gap + o.lag + 1.5) * 6;
  const lane = (e: Entity): Vec[] => {
    startOf ??= assignSpots(list.map((x) => ({ x: x.x, y: x.y })), STARTS.map((a) => polar(C0, a, 16)));
    const a0 = STARTS[startOf[list.indexOf(e)]], pts: Vec[] = [];
    for (let a = 0; a <= len / 16 + 1e-6; a += deg(10)) pts.push(polar(C0, a0 + a, 16));
    return pts;
  };
  at(G, t0 + REACT, () => npcs(G).forEach((e) => { if (!list.includes(e)) e.mt = { x: G.rng.rnd(-2, 2), y: G.rng.rnd(-2, 2) }; }));
  const last = chase(G, t0, { tag, targets: list, n: o.n, gap: o.gap, lag: o.lag, r: o.r, lead: end - t0 + o.lead, lane, why: '被渦狀光線奔湧打中（受傷加重）' });
  settle(G, last + 0.4, me);
  return last + 1;
}

export type FillKind = 'steel' | 'front' | 'donut';
const FILL_TIP: Record<FillKind, string> = {
  steel: '半蹲舉劍蓄力（俯身）＝大範圍鋼鐵：遠離 2P',
  front: '直立、劍舉在腦後＝正面直線：站 2P 側面或背後',
  donut: '直立、劍插在地上＝月環：站 2P 腳下',
};
interface CpState { pose?: { k: FillKind; until: number } }
/** 斬機擊：填充——看動作：俯身鋼鐵／劍舉頭上正面直線／劍插地月環 */
function fill(G: GameState, t0: number, k: FillKind): number {
  const me = claim(G, t0), o = T.fill, tag = '斬機擊：填充';
  const end = castAt(G, t0, tag, o.cast, FILL_TIP[k], '2P');
  at(G, t0, () => { G.x.cp = { ...encData<CpState>(G, 'cp', () => ({})), pose: { k, until: end } }; });
  at(G, t0, () => {
    const b = bossById(G, '2p');
    let s: Shape;
    if (k === 'steel') s = { k: 'circle', x: b.x, y: b.y, r: o.steel };
    else if (k === 'donut') s = { k: 'ring', x: b.x, y: b.y, r0: o.safe, r1: 60 };
    else {
      const tg = G.rng.pickOne(present(G));
      b.face = angTo(b, tg);
      s = { k: 'rect', O: { x: b.x, y: b.y }, H: b.face, len: 45, w: o.front };
    }
    aoe(G, end, s, { tag, show: o.cast, why: '看錯 2P 的動作（受傷加重）' });
  });
  at(G, end + 0.3, () => { bossById(G, '2p').face = Math.PI; });
  settle(G, end + 0.4, me);
  return end + 1;
}

/** 三連衝擊斬：點名 1 人分攤 ×3，每下都會擊退（方向同突進方向）；擊退要朝場中 */
function triple(G: GameState, t0: number): number {
  const me = claim(G, t0), o = T.triple, tag = '三連衝擊斬';
  at(G, t0, () => moveBoss(G, '2p', { x: 0, y: -16 }, 1));
  const end = castAt(G, t0, tag, o.cast, 'MT 把 2P 拉到場邊，大家在 2P 和場中之間分攤：擊退方向朝場中', '2P');
  const tg = G.rng.pickOne(G.ents);
  const S: Vec = { x: 0, y: -8 };
  for (let k = 0; k < 3; k++) {
    const t = end + k * o.gap;
    stack(G, t, { tag, show: k ? o.gap - 0.2 : o.cast, r: o.r, targets: [tg], groupOf: () => tg, spot: () => S, need: 12 });
    knockback(G, t + 0.05, { tag: `${tag}（擊退）`, show: 0.5, from: '2p', dist: o.kb, time: 0.3 });
  }
  const last = end + 2 * o.gap;
  at(G, last + 0.5, () => moveBoss(G, '2p', P2, 1));
  settle(G, last + 0.6, me);
  return last + 1.4;
}

/** 四連斷重擊：1 號跳過去圓、2 號直線、3 號跳過去圓、4 號直線 */
const FOUR_SPOT: Vec[] = [{ x: -14, y: -14 }, { x: 14, y: -14 }, { x: 14, y: 14 }, { x: -14, y: 14 }];
function four(G: GameState, t0: number): number {
  const me = claim(G, t0), o = T.four, tag = '四連斷重擊';
  const end = castAt(G, t0, tag, o.cast, '4 人頭上有 1～4 號：依序 跳向 1 → 劈向 2 → 跳向 3 → 劈向 4。1、3 號不要動，2、4 號不要重疊，其他人在中間', '2P');
  const list = G.rng.shuffle(G.ents).slice(0, 4);
  at(G, t0, () => { list.forEach((e, i) => { e.marker = { kind: 'num', until: end + o.lead + 3 * o.gap, label: String(i + 1) }; }); const k = list.indexOf(G.player); G.hints = [{ ...(k >= 0 ? FOUR_SPOT[k] : C0), r: k >= 0 ? 1.6 : 3, label: k >= 0 ? `${k + 1} 號站這裡` : '在中間' }]; });
  at(G, t0 + REACT, () => npcs(G).forEach((e) => { const k = list.indexOf(e); e.mt = k >= 0 ? { ...FOUR_SPOT[k] } : { x: G.rng.rnd(-3, 3), y: G.rng.rnd(-3, 3) }; }));
  list.forEach((tg, i) => {
    const t = end + o.lead + i * o.gap;
    at(G, t - 1.4, () => {
      if (i % 2 === 0) {
        aoe(G, t, { k: 'circle', x: tg.x, y: tg.y, r: o.r }, { tag, show: 1.4, why: `被跳向 ${i + 1} 號的斷重擊打中`, ok: null, dodge: false, only: (e) => e !== tg });
        at(G, t - 0.2, () => moveBoss(G, '2p', { x: tg.x, y: tg.y }, 0.2));
      } else {
        const b = bossById(G, '2p'), H = angTo(b, tg);
        aoe(G, t, { k: 'rect', O: { x: b.x, y: b.y }, H, len: 45, w: o.w }, { tag, show: 1.4, why: `被劈向 ${i + 1} 號的斷重斬打中`, ok: null, dodge: false, only: (e) => e !== tg && e !== list[i - 1] });
      }
    });
  });
  const last = end + o.lead + 3 * o.gap;
  at(G, last + 0.1, () => { G.hints = []; if (!G.checks.some((c) => c.tag === tag && !c.ok && c.t >= t0) && !G.player.dead) G.checks.push({ t: G.t, tag, ok: true, text: '躲開了四連斷重擊' }); });
  at(G, last + 0.5, () => moveBoss(G, '2p', P2, 1));
  settle(G, last + 0.4, me);
  return last + 1.6;
}

/** 能量凝縮：6 個圈各要 1 人（有人＝半徑 5 m 爆炸，沒人＝全場大爆炸）；其他人離開 */
function condense(G: GameState, t0: number): number {
  const me = claim(G, t0), o = T.condense, tag = '能量凝縮';
  const end = castAt(G, t0, tag, o.cast, '6 個圈各站 1 人（坦克、補師 1），其他人到場中、離圈遠一點（會爆炸）', '2P');
  const list = ALS.flatMap((al) => [-1, 1].map((s) => ({ ...polar(C0, deg({ A: 240, B: 180, C: 120 }[al as Alliance] + s * 22), o.ringR), r: o.r, need: 1, label: al })));
  const assign = (e: Entity): number | null => (e.role === 'MT' ? ALS.indexOf(e.al) * 2 : e.role === 'H1' ? ALS.indexOf(e.al) * 2 + 1 : null);
  towers(G, end, { tag, show: o.cast, list, assign });
  at(G, t0 + REACT + 0.1, () => npcs(G).forEach((e) => { if (assign(e) == null) e.mt = { x: G.rng.rnd(-3, 3), y: G.rng.rnd(-6, -2) }; }));
  aoe(G, end + 0.05, list.map((d) => ({ k: 'circle' as const, x: d.x, y: d.y, r: o.boom })), { tag: `${tag}（爆炸）`, show: o.cast, why: '離別人的圈太近，被爆炸波及', ok: null, dodge: false, only: (e) => assign(e) == null });
  settle(G, end + 0.4, me);
  return end + 1;
}

const p1Raid = (G: GameState, t0: number): number => raidwide(G, t0, '壓制光擊', 5, undefined, '融合的人偶群') + 0.8;
const p2Raid = (G: GameState, t0: number): number => raidwide(G, t0, '全方位斬機', 5, undefined, '2P') + 0.8;
const randFill = (G: GameState): FillKind => G.rng.pickOne<FillKind>(['steel', 'front', 'donut']);

function p1Seg(G: GameState, t0: number): number {
  let t = t0;
  for (const f of [p1Raid, donut, crossCut, shatter, reverse, crossCut, donut]) t = f(G, t) + 1.5;
  return transition(G, t);
}
function p2Seg(G: GameState, t0: number): number {
  toPhase2(G, t0);
  let t = t0 + 0.5;
  for (const f of [p2Raid, vortex, (g: GameState, x: number) => fill(g, x, randFill(g)), triple, four, (g: GameState, x: number) => fill(g, x, randFill(g)), condense, vortex, (g: GameState, x: number) => fill(g, x, randFill(g))]) t = f(G, t) + 1.5;
  return t;
}

const ALL = ['壓制光擊', '斬機光擊', '斷機光擊', '碎機光擊', '逆斷震迴旋', '全方位斬機', '渦狀光線奔湧', '斬機擊：填充', '三連衝擊斬', '四連斷重擊', '能量凝縮'];

export const compound: Encounter = {
  id: 'compound',
  name: '融合的人偶群 → 2P：融合體',
  sub: '最終王',
  arena: squareArena(T.half, 'wall'),
  bosses: [
    { id: 'group', name: '融合的人偶群', x: 0, y: 0, face: Math.PI, r: 4 },
    { id: '2p', name: '2P', x: P2.x, y: P2.y, face: Math.PI, r: 2.5, hidden: true },
  ],
  home,
  startFace: Math.PI,
  // 場地外側有持續傷害區域（感電）
  onEnter(G) {
    const H = T.half, E = T.edge, z = (O: Vec, Hd: number): void => { G.zones.push({ shape: { k: 'rect', O, H: Hd, len: H * 2, w: E * 2 }, from: 0, until: 1e9, tag: '感電區域', why: '踩進場地外側的感電區域', col: 'elec' }); };
    z({ x: -H, y: -H }, deg(90)); z({ x: -H, y: H }, deg(90)); z({ x: -H, y: -H }, deg(180)); z({ x: H, y: -H }, deg(180));
  },
  info: {
    壓制光擊: { effect: '全場 AOE。血量降到 1 時變為不可選中，在場中放全場 AOE＋擊退，之後所有人被擊倒（轉場）。', tell: '人偶群詠唱。', how: '不用走位；轉場那次會被擊退，不要站在場邊。' },
    斬機光擊: { effect: '人偶群水平旋轉，環形 AOE（安全區半徑 8 m）；受傷加重 60 秒。', tell: '王身邊出現<b>紅色光點與連線</b>。', how: '到<b>王身下</b>躲（月環）。' },
    斷機光擊: { effect: '人偶群前後旋轉，寬 11 m 直線 AOE；受傷加重 60 秒。', tell: '王開始旋轉並出現<b>紅色直線</b>。', how: '躲開直線方向。' },
    碎機光擊: { effect: '同時兩種：每隊隨機 2 人位置出現地面圓形預兆（半徑 6 m），以及每隊隨機 2 人被點名（跟人的半徑 6 m 圓）。', tell: '地面圓形預兆＋頭上點名圈。', how: '躲開地面圓；被點名的人離開人群分散。' },
    逆斷震迴旋: { effect: '人偶群變為不可選中，場地相鄰兩邊各出現一個分裂的人偶群，對兩側發動直線 AOE；受傷加重 60 秒。', tell: '王消失並出現在場邊。', how: '站到王所對應的行列之外。' },
    全方位斬機: { effect: '全場 AOE（物理）。', tell: '2P 詠唱。', how: '不用走位。' },
    渦狀光線奔湧: { effect: '點名隨機 3 人，他們的位置連續出現 3 次半徑 8 m 圓形 AOE；受傷加重 60 秒。', tell: '被點名的人腳下連續出現圓形預兆。', how: '被點的人一直跑，不要把圈帶進人群。' },
    '斬機擊：填充': { effect: '三種變化：俯身蓄力＝自身半徑 20 m 圓；面向隨機玩家、劍舉過頭＝前方寬 20 m 直線；劍插地面、環形光效＝環形（安全區 8 m）。之後可能接傳送（光圈連線，有光點的那端是真身位置）。', tell: '看 2P 的動作：<b>半蹲舉劍蓄力</b>／<b>直立、劍舉在腦後</b>／<b>直立、劍插在地上</b>。', how: '半蹲蓄力 → <b>遠離</b>；劍在腦後 → 站 <b>側面或背後</b>；劍插地 → 站 <b>腳下</b>。' },
    三連衝擊斬: { effect: '點名隨機 1 人分攤，突進到他身邊連續 3 次半徑 6 m 分攤，每次擊退（方向同突進方向），第三擊較痛。', tell: '頭上出現分攤標記。', how: 'MT 把王拉到場邊，大家分攤；讓擊退方向<b>朝向場中</b>，不然可能全員被推到場邊團滅。' },
    四連斷重擊: { effect: '先後點名 4 人並標上 1～4 號：跳向 1 號（半徑 6 m 圓）→ 朝 2 號劈出寬 12 m 直線 → 跳向 3 號 → 朝 4 號直線。', tell: '4 名玩家頭頂出現編號。', how: '1、3 號不要移動；2、4 號彼此不重疊；其他人注意迴避。' },
    能量凝縮: { effect: '場上出現 6 個圓形預兆並落下光球：預兆內有玩家＝半徑 5 m 爆炸；沒人＝全場大爆炸。', tell: '場上出現 6 個圈，光球落下。', how: '每個圈站 1 人（踩塔），其他人離圈遠一點。' },
  },
  drills: {
    full: drill({ tl: true, name: '完整時間軸', sub: '人偶群 → 2P，順序為估計', brief: flowHtml(['【融合的人偶群】壓制光擊', '斬機光擊（月環）／斷機光擊（直線）', '碎機光擊', '逆斷震迴旋', '壓制光擊（轉場）', '【2P：融合體】全方位斬機', '渦狀光線奔湧', '斬機擊：填充', '三連衝擊斬', '四連斷重擊', '能量凝縮']) + '<p class="bnote">資料沒有寫技能順序，這是估計的排法；傳送、分裂體、輔助機融合體略過。</p>', info: ALL, seg: (G, t0) => p2Seg(G, p1Seg(G, t0) + 1) }),
    p1: drill({ tl: true, name: '第一階段', sub: '融合的人偶群', brief: '', info: ['壓制光擊', '斬機光擊', '斷機光擊', '碎機光擊', '逆斷震迴旋'], seg: p1Seg }),
    p2: drill({ tl: true, name: '第二階段', sub: '2P：融合體', brief: '', info: ['全方位斬機', '渦狀光線奔湧', '斬機擊：填充', '三連衝擊斬', '四連斷重擊', '能量凝縮'], seg: p2Seg }),
    cuts: drill({ name: '斬機光擊／斷機光擊', sub: '月環・直線', brief: '', info: ['斬機光擊', '斷機光擊'], mechs: ['斬機光擊', '斷機光擊'], seg: (G, t0) => crossCut(G, donut(G, t0) + 1) }),
    shatter: drill({ name: '碎機光擊', sub: '地面圓＋點名', brief: '', info: ['碎機光擊'], mechs: ['碎機光擊'], seg: shatter }),
    reverse: drill({ name: '逆斷震迴旋', sub: '場邊直線', brief: '', info: ['逆斷震迴旋'], mechs: ['逆斷震迴旋'], seg: reverse }),
    fill: drill({ name: '斬機擊：填充', sub: '看 2P 動作', brief: '', info: ['斬機擊：填充'], mechs: ['斬機擊：填充'], seg: (G, t0) => { toPhase2(G, t0 - 0.5); return fill(G, t0, variant<FillKind>(G, 'fill', randFill(G))); } }),
    vortex: drill({ name: '渦狀光線奔湧', sub: '點名者跑', brief: '', info: ['渦狀光線奔湧'], mechs: ['渦狀光線奔湧'], seg: (G, t0) => { toPhase2(G, t0 - 0.5); return vortex(G, t0); } }),
    triple: drill({ name: '三連衝擊斬', sub: '擊退朝場中', brief: '', info: ['三連衝擊斬'], mechs: ['三連衝擊斬'], seg: (G, t0) => { toPhase2(G, t0 - 0.5); return triple(G, t0); } }),
    four: drill({ name: '四連斷重擊', sub: '1～4 號', brief: '', info: ['四連斷重擊'], mechs: ['四連斷重擊'], seg: (G, t0) => { toPhase2(G, t0 - 0.5); return four(G, t0); } }),
    condense: drill({ name: '能量凝縮', sub: '踩圈', brief: '', info: ['能量凝縮'], mechs: ['能量凝縮'], seg: (G, t0) => { toPhase2(G, t0 - 0.5); return condense(G, t0); } }),
  },
  variants: {
    fill: [{ key: 'fill', label: '動作', opts: (['steel', 'front', 'donut'] as FillKind[]).map((k) => ({ value: k, label: { steel: '俯身蓄力', front: '劍舉腦後', donut: '劍插地' }[k], tell: FILL_TIP[k].split('＝')[0], how: FILL_TIP[k].split('：').slice(1).join('：') })) }],
  },
  draw(c, G, layer) {
    if (layer !== 'top') return;
    const p = (G.x.cp as CpState | undefined)?.pose, b = G.bosses.find((x) => x.id === '2p');
    if (p && b && !b.hidden && G.t < p.until) text(c, { steel: '半蹲舉劍蓄力', front: '劍舉在腦後', donut: '劍插在地上' }[p.k], b.x, b.y - 4, 13, '#ffd36b');
  },
  loot: {
    currency: [[TOMES.詩學, 40], [TOMES.數理, 40], [TOMES.記憶, 12]],
    items: [
      ...(['頭部', '身體', '手部', '腿部'] as const).flatMap((s) => gearSet(s, '寄葉五三式', { 頭部: '軍帽', 身體: '軍裝', 手部: '手套', 腿部: '軍褲' }[s], 'Lv80・品級 490')),
      { name: '自走人偶 2B', kind: '寵物' }, { name: '自走人偶 2P', kind: '寵物' },
      { name: '九宮幻卡：2P', kind: '九宮幻卡' },
      ...['謊言之城', '祖母／破壞', '異形的末路', '天降之力～破壞一切的黑色巨人／混合版'].map((n) => ({ name: `管絃樂琴樂譜：${n}`, kind: '管絃樂琴樂譜' })),
    ],
  },
};
