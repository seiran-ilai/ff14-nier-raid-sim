/*
 * 尼爾 2 人偶軍事基地・第三王：905P：裝備重型陸戰裝置
 * 資料：機制攻略/尼爾2_人偶軍事基地.md（灰機 wiki）＋ _攻略.md（新大陸見聞錄）。
 * 時間軸順序、詠唱秒數、場地大小、站位是估計（T）；範圍大小照資料。
 * 略過：環狀槍擊裝置（場外能量球）、第二次輔助機程序（斜向連線）。上方激光的三段改成簡化版。
 */
import { ALS, ROLES, type Alliance, type Vec } from '../../core/constants';
import { squareArena } from '../../core/arena';
import { angTo, deg, polar } from '../../core/geometry';
import type { Shape } from '../../core/shapes';
import { REACT } from '../../core/tuning';
import { alertMsg, at, bossById, moveBoss, variant, type Entity, type GameState } from '../../game/state';
import { claim, npcs, settle } from '../../game/bots';
import { aoe, castAt, passIf, raidwide, spread, towers } from '../../mechanics/common';
import { drill, flowHtml } from '../../drills/build';
import type { Encounter } from '../types';
import { gearSet, TOMES } from '../gear';
import { assignSpots, byAngle, clusterHome } from '../layout';

const T = {
  half: 20,
  boss: { x: 0, y: -10 } as Vec,
  /** 激光炮塔：下方＝連續 7 次 60° 半徑 30 m；上方＝5 次 60° 半徑 16 m → 弧形 16～23 m → 弧形 23～30 m（資料） */
  turret: { cast: 5, gap: 1.4, show: 1.8, r: 30, stand: 7, inner: 16, mid: 23 },
  /** 高功率激光：一仇＋另一名坦克，高傷害直線（寬度估計） */
  laser: { cast: 5, w: 6, gap: 1.2 },
  /** 集束電壓：隨機 4 人 30° 扇形（資料） */
  volt: { cast: 4.5, w: 30, r: 40, spotR: 12 },
  /** 迫擊能量彈：3 次、每次隨機 4 人，半徑 4 m（資料） */
  mortar: { cast: 4, r: 4, gap: 3.5 },
  /** 穿地潰碎：隨機 3 人位置半徑 8 m（資料）；迴旋激光安全區半徑 12 m（資料） */
  crush: { cast: 4, r: 8, gap: 2.2, safeR: 12, lead: 2.5 },
  /** 輔助機程序：R030 前方半徑 18 m 圓、R010 前方寬 12 m 直線（資料） */
  pods: { cast: 5, d: 24, r030: 18, r010w: 12 },
  /** 爆炸性化合物：圈內要 3 人（第二次 2 人，資料）；圈半徑 3 m（資料） */
  compound: { cast: 5, r: 3, ringR: 10 },
};

const C0: Vec = { x: 0, y: 0 };
const B = T.boss;
const home = clusterHome(B, 9);
const boss = (G: GameState) => bossById(G, 'heavy');

/** 下方激光：炮塔連續 7 次 60° 扇形，一格一格轉；站在剛打完的那一格 */
function lowLaser(G: GameState, t0: number): number {
  const me = claim(G, t0), o = T.turret, tag = '下方激光';
  const end = castAt(G, t0, '通信：激光炮塔', o.cast, '炮塔下側發光＝下方激光：連續 7 次 60° 扇形一格一格轉，旁邊那格打完立刻移過去', '905P');
  const a0 = deg(60 * Math.floor(G.rng.rnd(0, 6))), dir = G.rng.chance(0.5) ? 1 : -1;
  const sector = (k: number): number => a0 + dir * deg(60) * k;
  for (let k = 0; k < 7; k++) {
    aoe(G, end + 0.5 + k * o.gap, { k: 'fan', x: 0, y: 0, r: o.r, a: sector(k), w: deg(30) }, { tag, show: o.show, why: '被炮塔激光打中', ok: k === 6 ? '跟著炮塔一格一格移過去' : null, dodge: false });
  }
  // Bot：先站在第一發「後面」那一格，每一發打完就移進剛打完的那格
  const put = (k: number): Vec => polar(C0, sector(k), o.stand);
  at(G, t0 + REACT, () => { npcs(G).forEach((e) => { e.mt = put(-1); }); G.hints = [{ ...put(-1), r: 1.6, label: '先站這格' }]; });
  for (let k = 0; k < 7; k++) at(G, end + 0.5 + k * o.gap + 0.05, () => { npcs(G).forEach((e) => { e.mt = put(k); }); G.hints = k < 6 ? [{ ...put(k), r: 1.6, label: '移進剛打完的格子' }] : []; });
  const last = end + 0.5 + 6 * o.gap;
  settle(G, last + 0.4, me);
  return last + 1;
}

/** 上方激光（簡化）：先內圈 5 次扇形，再中圈、外圈 5 次弧形；先站中圈，內圈打完進內圈 */
function highLaser(G: GameState, t0: number): number {
  const me = claim(G, t0), o = T.turret, tag = '上方激光';
  const end = castAt(G, t0, '通信：激光炮塔', o.cast, '炮塔上側發光＝上方激光：先打內圈、再打中圈、外圈 → 先站中圈，內圈打完立刻進內圈', '905P');
  const a0 = deg(60 * Math.floor(G.rng.rnd(0, 6))), dir = G.rng.chance(0.5) ? 1 : -1;
  const sec = (k: number): number => a0 + dir * deg(60) * k;
  const rings: [number, number][] = [[0, o.inner], [o.inner, o.mid], [o.mid, o.r]];
  let t = end + 0.5;
  rings.forEach(([r0, r1], w) => {
    for (let k = 0; k < 5; k++) {
      const a = sec(k), s: Shape[] = r0 === 0 ? [{ k: 'fan', x: 0, y: 0, r: r1, a, w: deg(30) }]
        : [{ k: 'fan', x: 0, y: 0, r: r1, a, w: deg(30) }];
      aoe(G, t + k * o.gap * 0.6, s, { tag, show: o.show, why: '被炮塔激光打中', ok: w === 2 && k === 4 ? '躲開三段上方激光' : null, dodge: false, only: (e) => Math.hypot(e.x, e.y) >= r0 - 0.5 });
    }
    t += 5 * o.gap * 0.6 + 1;
  });
  const midSpot = (e: Entity): Vec => polar(C0, angTo(C0, home(e.al, e.role)), (o.inner + o.mid) / 2);
  const inSpot = (e: Entity): Vec => polar(C0, angTo(C0, home(e.al, e.role)), 6);
  at(G, t0 + REACT, () => { npcs(G).forEach((e) => { e.mt = midSpot(e); }); G.hints = [{ ...midSpot(G.player), r: 1.6, label: '先站中圈' }]; });
  const innerDone = end + 0.5 + 4 * o.gap * 0.6 + 0.05;
  at(G, innerDone, () => { npcs(G).forEach((e) => { e.mt = inSpot(e); }); G.hints = [{ ...inSpot(G.player), r: 1.6, label: '進內圈' }]; });
  at(G, t, () => { G.hints = []; });
  settle(G, t, me);
  return t + 0.5;
}

/** 高功率激光：一仇與另一名坦克，依序高傷害直線；把直線引向場外 */
const TANK_SPOT: Record<Alliance, Vec> = { A: { x: -15, y: -17 }, B: { x: 15, y: -17 }, C: { x: 0, y: 0 } };
function laser(G: GameState, t0: number): number {
  const me = claim(G, t0), o = T.laser, tag = '攻擊：高功率激光';
  const end = castAt(G, t0, tag, o.cast, '兩名坦克被點名：分開把直線引向場外（北邊兩角），其他人躲開他們的方向', '905P');
  const tanks = [G.ents.find((e) => e.al === 'A' && e.role === 'MT')!, G.ents.find((e) => e.al === 'B' && e.role === 'MT')!];
  at(G, t0, () => tanks.forEach((e) => { e.marker = { kind: 'tb', until: end + o.gap, label: '直線' }; }));
  at(G, t0 + REACT, () => npcs(G).forEach((e) => { if (tanks.includes(e)) e.mt = { ...TANK_SPOT[e.al] }; }));
  tanks.forEach((tk, i) => at(G, end + i * o.gap - 1.5, () => {
    const b = boss(G);
    aoe(G, end + i * o.gap, { k: 'rect', O: { x: b.x, y: b.y }, H: angTo(b, tk), len: 45, w: o.w }, { tag, show: 1.5, why: '被坦克的高功率激光掃到（必死）', ok: i ? '躲開兩條高功率激光' : null, only: (e) => e !== tk });
  }));
  settle(G, end + o.gap + 0.4, me);
  return end + o.gap + 1;
}

/** 集束電壓：隨機 4 人，從王往他們打 30° 扇形 */
const VOLT_ANG = [60, 100, 260, 300].map(deg);
function volt(G: GameState, t0: number): number {
  const me = claim(G, t0), o = T.volt, tag = '攻擊：集束電壓';
  const end = castAt(G, t0, tag, o.cast, '被點名的人分開站（不要重疊），其他人躲開扇形', '905P');
  const list = byAngle(B, G.rng.shuffle(G.ents).slice(0, 4), (e) => home(e.al, e.role));
  const spot = (e: Entity): Vec => polar(B, VOLT_ANG[list.indexOf(e)], o.spotR);
  at(G, t0, () => { list.forEach((e) => { e.marker = { kind: 'target', until: end, label: '扇形' }; }); if (list.includes(G.player)) G.hints = [{ ...spot(G.player), r: 1.4, label: '站這裡' }]; });
  at(G, t0 + REACT, () => npcs(G).forEach((e) => { if (list.includes(e)) e.mt = spot(e); }));
  at(G, end - 1.5, () => {
    G.hints = [];
    const b = boss(G);
    list.forEach((tg) => aoe(G, end, { k: 'fan', x: b.x, y: b.y, r: o.r, a: angTo(b, tg), w: deg(o.w / 2) }, { tag, show: 1.5, why: '被別人的集束電壓扇形打中', ok: null, only: (e) => e !== tg }));
  });
  passIf(G, end + 0.05, tag, t0, '集束電壓沒有打到別人');
  settle(G, end + 0.4, me);
  return end + 1;
}

/** 迫擊能量彈：3 次、每次隨機 4 人，半徑 4 m */
/** 被點名的人可以去的場邊位置（每輪 4 人挑最近的 4 個） */
const MORTAR_SPOT: Vec[] = [{ x: -16, y: -12 }, { x: -16, y: 2 }, { x: -12, y: 15 }, { x: 0, y: 17 }, { x: 12, y: 15 }, { x: 16, y: 2 }, { x: 16, y: -12 }];
function mortar(G: GameState, t0: number): number {
  const me = claim(G, t0), o = T.mortar, tag = '迫擊能量彈';
  const end = castAt(G, t0, tag, o.cast, '每次隨機 4 人頭上有圈：被點的人到場邊，連續 3 次', '905P');
  for (let k = 0; k < 3; k++) {
    const list = G.rng.shuffle(G.ents).slice(0, 4);
    // 點名出現時，依每個人「當下的位置」分配最近的場邊位置
    let spotOf: number[] | null = null;
    const spot = (_e: Entity, i: number): Vec => MORTAR_SPOT[(spotOf ??= assignSpots(list.map((e) => ({ x: e.x, y: e.y })), MORTAR_SPOT))[i]];
    spread(G, end + k * o.gap, { tag, show: o.gap - 0.2 + (k ? 0 : o.cast - o.gap + 0.2), r: o.r, targets: list, spot, rest: (e) => home(e.al, e.role) });
    // 炸完被點的人回原位，讓下一輪的人過來
    at(G, end + k * o.gap + 0.05, () => npcs(G).forEach((e) => { if (list.includes(e)) e.mt = home(e.al, e.role); }));
  }
  settle(G, end + 2 * o.gap + 0.4, me);
  return end + 2 * o.gap + 1;
}

/** 穿地潰碎：隨機 3 人位置依序被王突進（半徑 8 m），最後迴旋激光（安全區＝王身邊 12 m） */
const CRUSH_SPOT: Vec[] = [{ x: -15, y: 12 }, { x: 15, y: 12 }, { x: 0, y: 16 }];
function crush(G: GameState, t0: number): number {
  const me = claim(G, t0), o = T.crush, tag = '攻擊：穿地潰碎';
  const end = castAt(G, t0, tag, o.cast, '被點名的 3 人分開；其他人離預兆遠一點，最後一下之後靠近王（迴旋激光的安全區在王身邊）', '905P');
  const list = G.rng.shuffle(G.ents).slice(0, 3);
  const wait: Vec = { x: 0, y: 5.5 }, close: Vec = { x: 0, y: 12.5 };
  at(G, t0, () => { list.forEach((e, i) => { e.marker = { kind: 'num', until: end + o.lead + i * o.gap, label: String(i + 1) }; }); const k = list.indexOf(G.player); G.hints = [{ ...(k >= 0 ? CRUSH_SPOT[k] : wait), r: 1.6, label: k >= 0 ? '站這裡' : '在這裡等' }]; });
  at(G, t0 + REACT, () => npcs(G).forEach((e) => { const k = list.indexOf(e); e.mt = { ...(k >= 0 ? CRUSH_SPOT[k] : wait) }; }));
  list.forEach((tg, i) => {
    const t = end + o.lead + i * o.gap;
    at(G, t - 1.8, () => { aoe(G, t, { k: 'circle', x: tg.x, y: tg.y, r: o.r }, { tag, show: 1.8, why: '被王突進的穿地潰碎打中（受傷加重）', ok: null, dodge: false, only: (e) => e !== tg }); });
    at(G, t - 0.3, () => moveBoss(G, 'heavy', { x: tg.x, y: tg.y }, 0.3));
  });
  const t3 = end + o.lead + 2 * o.gap, tl = t3 + 2.6;
  at(G, t3 + 0.05, () => { npcs(G).forEach((e) => { e.mt = { x: close.x + G.rng.rnd(-3, 3), y: close.y + G.rng.rnd(-1.5, 1.5) }; }); G.hints = [{ ...close, r: 2.5, label: '靠近王' }]; });
  castAt(G, t3 + 0.1, '攻擊：迴旋激光', tl - t3 - 0.1, '王身邊是安全區：靠近王', '905P', false);
  at(G, t3 + 0.1, () => {
    const b = boss(G);
    aoe(G, tl, { k: 'ring', x: b.x, y: b.y, r0: o.safeR, r1: 60 }, { tag: '攻擊：迴旋激光', show: tl - t3 - 0.1, why: '離王太遠，被迴旋激光打中', ok: '躲進王身邊的安全區', dodge: false });
  });
  at(G, tl + 0.3, () => { G.hints = []; moveBoss(G, 'heavy', B, 1); });
  passIf(G, t3 + 0.05, tag, t0, '躲開了三次穿地潰碎');
  settle(G, tl + 0.4, me);
  return tl + 1.4;
}

/** 輔助機程序（第一次）：四邊的輔助機執行 R010（直線）或 R030（圓），兩台中間靠場邊安全 */
export type Program = 'R010' | 'R030';
function pods(G: GameState, t0: number): number {
  const me = claim(G, t0), o = T.pods, tag = '輔助機程序';
  at(G, t0 - 1, () => alertMsg(G, '支援：輔助機射出', 1.5));
  const end = castAt(G, t0, '通信：輔助機程序', o.cast, '屏幕顯示 R010（直線）或 R030（圓）：站在兩台輔助機中間、靠場邊（角落）', '905P');
  const P: Vec[] = [{ x: 0, y: -o.d }, { x: o.d, y: 0 }, { x: 0, y: o.d }, { x: -o.d, y: 0 }];
  const progs: Program[] = P.map(() => variant<Program>(G, 'prog', G.rng.chance(0.5) ? 'R010' : 'R030'));
  const shapes: Shape[] = P.map((p, i) => (progs[i] === 'R010' ? { k: 'rect', O: p, H: angTo(p, C0), len: o.d * 2, w: o.r010w } : { k: 'circle', x: p.x, y: p.y, r: o.r030 }));
  at(G, t0, () => P.forEach((p, i) => G.objs.push({ k: 'orb', x: p.x * 0.85, y: p.y * 0.85, r: 1.3, col: '#9aa0a9', until: end + 0.6, label: progs[i] })));
  aoe(G, end + 0.5, shapes, { tag, show: o.cast + 0.5, visible: 2, why: '站在輔助機程序的範圍裡（受傷加重）', ok: '躲在兩台輔助機中間的角落' });
  settle(G, end + 0.9, me);
  return end + 1.5;
}

/** 爆炸性化合物：場上的圈要站滿人數（3 人，第二次 2 人），不夠就全場大爆炸 */
function compound(G: GameState, t0: number, need = 3): number {
  const me = claim(G, t0), o = T.compound, tag = '通信：爆炸性化合物';
  const end = castAt(G, t0, tag, o.cast, `場上的黃圈每個要 ${need} 人以上（變藍）：照分配站進去`, '905P');
  // 6 個圈：A 隊西側兩個、B 隊南側兩個、C 隊東側兩個；每隊前 4 人一圈、後 4 人一圈
  const ANG: Record<Alliance, number[]> = { A: [220, 270], B: [160, 200], C: [90, 140] };
  const list = ALS.flatMap((al) => ANG[al].map((a) => ({ ...polar(C0, deg(a), o.ringR), r: o.r, need, label: `${al} 隊` })));
  const assign = (e: Entity): number => ALS.indexOf(e.al) * 2 + Math.floor(ROLES.indexOf(e.role) / 4);
  towers(G, end, { tag, show: o.cast, list, assign });
  settle(G, end + 0.4, me);
  return end + 1;
}

const diffuse = (G: GameState, t0: number): number => raidwide(G, t0, '攻擊：擴散電壓', 5, undefined, '905P') + 0.8;

function fullSeg(G: GameState, t0: number): number {
  let t = t0;
  for (const f of [diffuse, lowLaser, laser, volt, mortar, crush, diffuse]) t = f(G, t) + 1.5;
  at(G, t, () => alertMsg(G, '通信：21O 自我數據——場地下降，外側出現屏幕', 2.5));
  t += 3;
  for (const f of [pods, compound, highLaser, laser, (g: GameState, x: number) => compound(g, x, 2), crush]) t = f(G, t) + 1.5;
  return t;
}

const ALL = ['攻擊：擴散電壓', '通信：激光炮塔', '攻擊：高功率激光', '攻擊：集束電壓', '迫擊能量彈', '攻擊：穿地潰碎', '通信：21O 自我數據', '通信：輔助機程序', '通信：爆炸性化合物'];

export const heavy: Encounter = {
  id: 'heavy',
  name: '905P：裝備重型陸戰裝置',
  sub: '第三王・中央激光炮塔',
  arena: squareArena(T.half, 'wall'),
  bosses: [{ id: 'heavy', name: '905P', x: B.x, y: B.y, face: Math.PI, r: 4 }],
  home,
  startFace: 0,
  info: {
    '攻擊：擴散電壓': { effect: '全場 AOE，雷屬性。', tell: '905P 詠唱。', how: '不用走位。', heal: '全場傷害：讀條時先上群盾，結束後群補。' },
    '通信：激光炮塔': { effect: '場地中心的激光炮塔上側或下側發光。<b>下方激光</b>：連續 7 次 60°、半徑 30 m 扇形。<b>上方激光</b>：先 5 次 60° 半徑 16 m 扇形 → 5 次半徑 23 m 弧形 → 5 次半徑 30 m 弧形。', tell: '中央炮塔<b>上側或下側發光</b>（高低不同的光點）。', how: '全員到<b>高點所在的扇形場邊</b>，等旁邊扇區的 AOE 結束後立刻移過去。（模擬器：下方＝站在剛打完的那格；上方＝先站中圈，內圈打完進內圈）' },
    '攻擊：高功率激光': { effect: '點名一仇與另一名坦克（高傷害預兆），依序發動高傷害直線。', tell: '兩名坦克被點名，有明顯的動畫提示。', how: '被點的坦克<b>不要重疊</b>，把直線引向場外；其他人務必躲開這兩人的方向（被掃到必死）。', tank: '被點的兩名坦克分開，把直線引向場外，開減傷（模擬器：A 隊坦克到西北角、B 隊坦克到東北角）。', heal: '直線傷害很高：先替被點的坦克上盾。', dps: '絕對不要站在王和被點坦克之間（被掃到必死）。' },
    '攻擊：集束電壓': { effect: '點名隨機 4 人，從王往他們打 30° 扇形（雷屬性）。', tell: '被點名的人出現扇形預兆。', how: '被點名者不重疊即可、不要亂跑；其他人視情況躲開扇形。' },
    迫擊能量彈: { effect: '點名 3 次、每次隨機 4 人，半徑 4 m 圓形；受傷加重 60 秒。', tell: '頭上出現點名圈。', how: '被點的人到場邊，不要碰到別人。' },
    '攻擊：穿地潰碎': { effect: '隨機 3 人位置出現圓形預兆，王依序突進過去，半徑 8 m；全部結束後以自身為中心放環形 AOE（迴旋激光，安全區半徑 12 m）。', tell: '3 人腳下出現圓形預兆。', how: '被點的人分開；最後一下突進之後<b>靠近王</b>躲迴旋激光。' },
    '通信：21O 自我數據': { effect: '場地下降，外側出現屏幕，部分機制受屏幕影響（輔助機程序、爆炸性化合物）。', tell: '場地下降、外側出現屏幕。', how: '注意屏幕上的顯示。' },
    '通信：輔助機程序': { effect: '屏幕顯示程序並連線輔助機：<b>R030：重錘</b>＝前方半徑 18 m 圓；<b>R010：激光</b>＝前方寬 12 m 直線；受傷加重 60 秒。', tell: '場外屏幕顯示 R010 或 R030（第一次連線自己正前方的輔助機；第二次連線斜向的，R010 與 R030 交替）。', how: '兩種都在<b>兩台輔助機中間、靠場邊</b>躲。第二次：找兩個相鄰 R010 屏幕所連的輔助機，站在兩者中間。' },
    '通信：爆炸性化合物': { effect: '場上出現圓形預兆並與屏幕連線，屏幕顯示所缺人數與倒數；人數夠＝半徑 3 m 小爆炸，不夠＝全場大爆炸。', tell: '場上出現黃圈，屏幕顯示缺幾人。', how: '每圈超過 3 人會變藍（第二次只要 2 人）；照分配站進去。', tank: '模擬器分配：每隊兩個圈，坦克、兩名補師、DPS 1 一圈，其他 4 名 DPS 一圈。' },
  },
  drills: {
    full: drill({ tl: true, name: '完整時間軸', sub: '順序為估計', brief: flowHtml(['擴散電壓', '激光炮塔（下方）', '高功率激光', '集束電壓', '迫擊能量彈 ×3', '穿地潰碎＋迴旋激光', '擴散電壓', '21O 自我數據（場地下降）', '輔助機程序', '爆炸性化合物', '激光炮塔（上方）', '高功率激光', '爆炸性化合物（2 人）', '穿地潰碎']) + '<p class="bnote">資料沒有寫技能順序，這是估計的排法。</p>', info: ALL, seg: fullSeg }),
    turret: drill({ name: '激光炮塔', sub: '下方／上方', brief: '', info: ['通信：激光炮塔'], mechs: ['下方激光', '上方激光'], seg: (G, t0) => (variant(G, 'turret', G.rng.chance(0.5) ? 'low' : 'high') === 'low' ? lowLaser(G, t0) : highLaser(G, t0)) }),
    tanks: drill({ name: '高功率激光＋集束電壓', sub: '坦克直線、扇形點名', brief: '', info: ['攻擊：高功率激光', '攻擊：集束電壓'], mechs: ['攻擊：高功率激光', '攻擊：集束電壓'], seg: (G, t0) => volt(G, laser(G, t0) + 1) }),
    mortar: drill({ name: '迫擊能量彈', sub: '三次點名', brief: '', info: ['迫擊能量彈'], mechs: ['迫擊能量彈'], seg: mortar }),
    crush: drill({ name: '穿地潰碎＋迴旋激光', sub: '分開、再靠近王', brief: '', info: ['攻擊：穿地潰碎'], mechs: ['攻擊：穿地潰碎', '攻擊：迴旋激光'], seg: crush }),
    pods: drill({ name: '輔助機程序', sub: 'R010／R030', brief: '', info: ['通信：輔助機程序'], mechs: ['輔助機程序'], seg: (G, t0) => pods(G, t0 + 1) }),
    compound: drill({ name: '爆炸性化合物', sub: '踩圈', brief: '', info: ['通信：爆炸性化合物'], mechs: ['通信：爆炸性化合物'], seg: (G, t0) => compound(G, t0) }),
  },
  variants: {
    turret: [{ key: 'turret', label: '炮塔', opts: [
      { value: 'low', label: '下方激光', tell: '炮塔<b>下側</b>發光', how: '站在第一發旁邊那格，每一發打完就移進剛打完的格子。' },
      { value: 'high', label: '上方激光', tell: '炮塔<b>上側</b>發光', how: '先站中圈，內圈打完立刻進內圈。' },
    ] }],
    pods: [{ key: 'prog', label: '程序', opts: [
      { value: 'R010', label: 'R010：激光', tell: '屏幕顯示 R010', how: '寬 12 m 直線：站在兩台輔助機中間、靠場邊。' },
      { value: 'R030', label: 'R030：重錘', tell: '屏幕顯示 R030', how: '前方半徑 18 m 圓：站在兩台輔助機中間、靠場邊（角落）。' },
    ] }],
  },
  loot: {
    currency: [[TOMES.詩學, 30], [TOMES.數理, 30]],
    items: [...gearSet('身體', '寄葉五三式', '軍裝', 'Lv80・品級 490'), ...gearSet('腳部', '寄葉五三式', '軍靴', 'Lv80・品級 490')],
  },
};
