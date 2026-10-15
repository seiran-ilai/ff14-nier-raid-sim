/*
 * 尼爾 2 人偶軍事基地・第一王：813P：裝備據點防衛裝置
 * 資料：機制攻略/尼爾2_人偶軍事基地.md（灰機 wiki）＋ _攻略.md（新大陸見聞錄）。
 * 時間軸順序、詠唱秒數、場地大小是估計（T）；扇形角度、半徑照資料。
 */
import type { Vec } from '../../core/constants';
import { squareArena } from '../../core/arena';
import { deg, polar } from '../../core/geometry';
import type { Shape } from '../../core/shapes';
import { at, present, type Entity, type GameState } from '../../game/state';
import { claim, settle } from '../../game/bots';
import { aoe, buster, castAt, chase, raidwide, stack } from '../../mechanics/common';
import { drill, flowHtml } from '../../drills/build';
import type { Encounter } from '../types';
import { gearSet, TOMES } from '../gear';
import { clusterHome } from '../layout';

const T = {
  half: 20,
  personLaser: { cast: 4.5, r: 3 },
  /** 收束粒子炮：五個間隔 72° 的扇形，全角 45／45／75／105／75（資料） */
  converge: { cast: 6, widths: [45, 45, 75, 105, 75] },
  /** 旋迴粒子炮：五個間隔 72° 的 30° 扇形（資料） */
  spin: { cast: 6, w: 30, visible: 2.5 },
  /** 對地激光：每隊一名 DPS，連續 10 次半徑 4 m（資料） */
  ground: { cast: 4, n: 10, gap: 1, lag: 1, r: 4, lead: 1.5 },
  /** 航空支援：突擊：3 台飛行裝置，寬 10 m 直線（資料） */
  raid: { cast: 4, w: 10, show: 3 },
  /** 偏向粒子炮：45° 扇形（資料） */
  deflect: { cast: 5, w: 45 },
  /** 高功率激光：半徑 6 m 分攤（資料） */
  stack: { cast: 5, r: 6 },
  /** 終焉之歌：三個間隔 120° 的 105° 扇形（資料）；兩輪（估計） */
  song: { cast: 5, w: 105, gap: 3, show: 2.6 },
};

const C0: Vec = { x: 0, y: 0 };
const home = clusterHome(C0, 8);
const fan = (a: number, wDeg: number): Shape => ({ k: 'fan', x: 0, y: 0, r: 40, a, w: deg(wDeg / 2) });

/** 炮擊命令：對人激光——點名每隊坦克，半徑 3 m */
const TB_SPOT: Record<string, Vec> = { A: { x: -15, y: 5 }, B: { x: 0, y: 15 }, C: { x: 15, y: 5 } };
function personLaser(G: GameState, t0: number): number {
  const me = claim(G, t0), o = T.personLaser, tag = '炮擊命令：對人激光';
  const end = castAt(G, t0, tag, o.cast, '坦克被點紅圈：遠離人群、開減傷', '813P');
  buster(G, end, { tag, show: o.cast, targets: G.ents.filter((e) => e.role === 'MT'), r: o.r, spot: (e) => TB_SPOT[e.al] });
  settle(G, end + 0.4, me);
  return end + 1;
}

/** 收束粒子炮：五個扇形（角度逐漸縮小） */
function converge(G: GameState, t0: number): number {
  const me = claim(G, t0), o = T.converge, tag = '攻擊：收束粒子炮';
  const end = castAt(G, t0, tag, o.cast, '五個扇形逐漸縮小：找縮得比較快（比較窄）的扇形旁邊躲', '813P');
  const a0 = G.rng.rnd(0, Math.PI * 2);
  aoe(G, end, o.widths.map((w, i) => fan(a0 + deg(72 * i), w)), { tag, show: o.cast, why: '被收束粒子炮打中（擊退、受傷加重）' });
  settle(G, end + 0.4, me);
  return end + 1;
}

/** 旋迴粒子炮：五個 30° 扇形旋轉後停下 */
function spinCannon(G: GameState, t0: number): number {
  const me = claim(G, t0), o = T.spin, tag = '攻擊：旋迴粒子炮';
  const end = castAt(G, t0, tag, o.cast, '五個扇形一邊轉一邊變慢：看它停在哪，站到扇形之間', '813P');
  const a0 = G.rng.rnd(0, Math.PI * 2);
  aoe(G, end, [0, 1, 2, 3, 4].map((i) => fan(a0 + deg(72 * i), o.w)), { tag, show: o.cast, visible: o.visible, why: '被旋迴粒子炮打中（擊退、受傷加重）' });
  settle(G, end + 0.4, me);
  return end + 1;
}

/** 沿著半徑 r 的圓順時針走：從角度 a0 開始走 len 公尺（每 10° 一個點） */
function arcPath(r: number, a0: number, len: number): Vec[] {
  const pts: Vec[] = [], step = deg(10), total = len / r;
  for (let a = 0; a <= total + 1e-6; a += step) pts.push(polar(C0, a0 + a, r));
  return pts;
}

/** 炮擊命令：對地激光——每隊一名 DPS，原地連炸 10 次 */
function groundLaser(G: GameState, t0: number): number {
  const me = claim(G, t0), o = T.ground, tag = '炮擊命令：對地激光';
  const end = castAt(G, t0, tag, o.cast, '被點名的人沿著場邊一直跑（會連炸 10 次），不要回人群', '813P');
  const list = (['A', 'B', 'C'] as const).map((al) => G.rng.pickOne(G.ents.filter((e) => e.al === al && e.role[0] === 'D')));
  // 三人在同一個圓形跑道上、從自己隊伍的方向出發（A 西南、B 南、C 東南），順時針同方向跑：相隔 45°，不會碰到彼此的 AOE
  const len = (o.n * o.gap + o.lag + 1.5) * 6;
  const START: Record<string, number> = { A: deg(225), B: deg(180), C: deg(135) };
  const lane = (e: Entity): Vec[] => arcPath(16, START[e.al], len);
  const last = chase(G, t0, { tag, targets: list, n: o.n, gap: o.gap, lag: o.lag, r: o.r, lead: end - t0 + o.lead, lane, why: '被對地激光炸到' });
  settle(G, last + 0.4, me);
  return last + 1;
}

/** 航空支援：突擊——場外 3 台飛行裝置面向最近的玩家，寬 10 m 直線 */
function airRaid(G: GameState, t0: number): number {
  const me = claim(G, t0), o = T.raid, tag = '突擊機動';
  const end = castAt(G, t0, '航空支援：突擊', o.cast, '場外 3 台飛行裝置會朝最近的人打直線：離開它們的正面', '813P');
  const H = T.half + 3;
  const units: Vec[] = [0, 1, 2].map((i) => polar(C0, deg(G.rng.rnd(0, 120) + i * 120), H * 1.2));
  const t = end + 1;
  at(G, t - o.show, () => {
    units.forEach((u) => G.objs.push({ k: 'orb', ...u, r: 1.5, col: '#8f8870', until: t + 0.3, label: '飛行裝置' }));
    const shapes: Shape[] = units.map((u) => {
      const near = present(G).reduce((a, b) => (Math.hypot(b.x - u.x, b.y - u.y) < Math.hypot(a.x - u.x, a.y - u.y) ? b : a));
      return { k: 'rect', O: u, H: Math.atan2(near.x - u.x, -(near.y - u.y)), len: 60, w: o.w };
    });
    aoe(G, t, shapes, { tag, show: o.show, why: '被飛行裝置的突擊打中（擊退、受傷加重）' });
  });
  settle(G, t + 0.4, me);
  return t + 1;
}

/** 偏向粒子炮：機翼偏轉，45° 扇形 */
function deflect(G: GameState, t0: number): number {
  const me = claim(G, t0), o = T.deflect, tag = '攻擊：偏向粒子炮';
  const end = castAt(G, t0, tag, o.cast, '頭頂的機械裝置轉向哪一側就打哪一側：躲到機械翼背面', '813P');
  const a = deg(45 * Math.floor(G.rng.rnd(0, 8)));
  aoe(G, end, fan(a, o.w), { tag, show: o.cast, why: '站在偏向粒子炮的方向（受傷加重）' });
  settle(G, end + 0.4, me);
  return end + 1;
}

/** 炮擊命令：高功率激光——每隊一名隨機玩家，半徑 6 m 分攤 */
function highLaser(G: GameState, t0: number): number {
  const me = claim(G, t0), o = T.stack, tag = '炮擊命令：高功率激光';
  const end = castAt(G, t0, tag, o.cast, '每隊一人分攤：到自己隊伍的點名者身邊', '813P');
  const tg = Object.fromEntries((['A', 'B', 'C'] as const).map((al) => [al, G.rng.pickOne(G.ents.filter((e) => e.al === al))])) as Record<string, Entity>;
  const spot = (e: Entity): Vec => home(e.al, 'H2');
  stack(G, end, { tag, show: o.cast, r: o.r, targets: Object.values(tg), groupOf: (e) => tg[e.al], spot, need: 6 });
  settle(G, end + 0.4, me);
  return end + 1;
}

/** 終焉之歌：三個間隔 120° 的 105° 扇形（缺口安全），兩輪 */
function song(G: GameState, t0: number): number {
  const me = claim(G, t0), o = T.song, tag = '終焉之歌';
  const end = castAt(G, t0, tag, o.cast, '執行「終焉之歌」程序：站在擴散黃圈的缺口；等傷害動畫出現後再移往下一個缺口', '813P');
  const a0 = G.rng.rnd(0, Math.PI * 2), dir = G.rng.chance(0.5) ? 1 : -1;
  for (let k = 0; k < 2; k++) {
    const t = end + k * o.gap;
    aoe(G, t, [0, 1, 2].map((i) => fan(a0 + dir * deg(60 * k) + deg(120 * i), o.w)), { tag, show: k ? o.show : o.cast, why: '沒站在缺口（受傷加重）', ok: k ? '兩輪都站在缺口' : null });
  }
  settle(G, end + o.gap + 0.4, me);
  return end + o.gap + 1;
}

const diffuse = (G: GameState, t0: number): number => raidwide(G, t0, '攻擊：擴散粒子炮', 5, undefined, '813P') + 0.8;
const bombing = (G: GameState, t0: number): number => {
  const end = castAt(G, t0, '航空支援：轟炸', 3, '場地內側出現 3 台飛行裝置', '813P');
  return raidwide(G, end + 0.5, '攻擊：全方位導彈轟炸', 4, undefined, '飛行裝置') + 0.8;
};

function fullSeg(G: GameState, t0: number): number {
  let t = t0;
  for (const f of [personLaser, converge, groundLaser, diffuse, airRaid, deflect, spinCannon, highLaser, bombing, song, converge, groundLaser, deflect, song]) t = f(G, t) + 1.5;
  return t;
}

const ALL = ['炮擊命令：對人激光', '攻擊：收束粒子炮', '攻擊：旋迴粒子炮', '炮擊命令：對地激光', '航空支援：突擊', '攻擊：偏向粒子炮', '攻擊：擴散粒子炮', '航空支援：轟炸', '炮擊命令：高功率激光', '終焉之歌'];

export const aegis: Encounter = {
  id: 'aegis',
  name: '813P：裝備據點防衛裝置',
  sub: '第一王',
  arena: squareArena(T.half, 'wall'),
  bosses: [{ id: 'aegis', name: '813P', x: 0, y: 0, face: Math.PI, r: 5 }],
  home,
  startFace: Math.PI,
  info: {
    '炮擊命令：對人激光': { effect: '點名每隊一名坦克（高傷害預兆），半徑 3 m 圓形 AOE。', tell: '坦克頭上出現紅色點名。', how: '遠離人群並開減傷；出現光柱後立刻離開原地，回到人群。', tank: '三隊坦克各自離開人群、互相不要重疊，開減傷（模擬器站位：A 隊西側、B 隊南側、C 隊東側）。出現光柱後立刻回人群。', heal: '三名坦克同時吃高傷害：先替自己隊的坦克上盾、抬滿血。' },
    '攻擊：收束粒子炮': { effect: '五個間隔 72°、角度逐漸縮小的扇形，詠唱結束時為兩個 45°、兩個 75°、一個 105° 的扇形；擊退＋受傷加重 60 秒。', tell: '場地出現五個黃色扇形範圍，慢慢縮小。', how: '找<b>面積縮小較快</b>的黃色區域旁邊躲；不確定就跟著人群。' },
    '攻擊：旋迴粒子炮': { effect: '五個間隔 72° 的旋轉扇形，角速度逐漸降低，詠唱結束發動五個 30° 扇形；擊退＋受傷加重 60 秒。', tell: '五個扇形預兆一邊轉一邊變慢。', how: '看最後停下來的位置，站到扇形之間。' },
    '炮擊命令：對地激光': { effect: '點名每隊一名 DPS，在他的位置連續發動 10 次半徑 4 m 圓形 AOE。', tell: 'DPS 頭上出現點名。', how: '被點的人<b>一直跑、不要回人群</b>（模擬器：沿著場邊同一方向跑）。', dps: '只點 DPS（每隊 1 人）：被點到就沿場邊一直跑，不要回人群。' },
    '航空支援：突擊': { effect: '場地外側生成 3 台飛行裝置，面向最近的玩家發動寬 10 m 直線（突擊機動）；擊退＋受傷加重 60 秒。', tell: '場外出現飛行裝置。', how: '離開飛行裝置的正面。' },
    '攻擊：偏向粒子炮': { effect: '王的機翼偏轉一定角度，從粒子炮位置發動 45° 扇形 AOE；受傷加重 60 秒。', tell: '頭頂深處的機械裝置轉向。', how: '會朝旋轉那一側發射：躲到<b>機械翼背面</b>。' },
    '攻擊：擴散粒子炮': { effect: '全場 AOE。', tell: '813P 詠唱。', how: '不用走位。', heal: '全場傷害：讀條時先上群盾，結束後群補。' },
    '航空支援：轟炸': { effect: '場地內側生成 3 台飛行裝置，放全場 AOE（全方位導彈轟炸）。', tell: '場內出現飛行裝置。', how: '不用走位，補師抬血。', heal: '全場傷害：讀條時先上群盾，結束後群補。' },
    '炮擊命令：高功率激光': { effect: '點名每隊一名隨機玩家，半徑 6 m 分攤；魔法受傷加重 3 秒。', tell: '頭上出現分攤標記。', how: '各隊到自己的點名者身邊分攤。', heal: '分攤後有 3 秒魔法受傷加重：注意接下來的傷害。' },
    終焉之歌: { effect: '王的中心出現三個間隔 120°、不斷擴散的終焉之歌，擴散到場外時發動 105° 扇形 AOE；受傷加重 60 秒。', tell: '王喊話「執行"終焉之歌"程序……」，身上出現向外擴散、有缺口的黃圈。', how: '站在<b>缺口</b>處；動畫判定：等地面出現傷害動畫後再移往下一個缺口。' },
  },
  drills: {
    full: drill({ tl: true, name: '完整時間軸', sub: '順序為估計', brief: flowHtml(['對人激光', '收束粒子炮', '對地激光', '擴散粒子炮', '航空支援：突擊', '偏向粒子炮', '旋迴粒子炮', '高功率激光', '航空支援：轟炸', '終焉之歌', '（重複）']) + '<p class="bnote">資料沒有寫技能順序，這是估計的排法。</p>', info: ALL, seg: fullSeg }),
    cannons: drill({ name: '收束／旋迴粒子炮', sub: '五個扇形', brief: '', info: ['攻擊：收束粒子炮', '攻擊：旋迴粒子炮'], mechs: ['攻擊：收束粒子炮', '攻擊：旋迴粒子炮'], steps: [['收束', '收束'], ['旋迴', '旋迴']], seg: (G, t0) => spinCannon(G, converge(G, t0) + 1) }),
    ground: drill({ name: '對地激光', sub: '點名者一直跑', brief: '', info: ['炮擊命令：對地激光'], mechs: ['炮擊命令：對地激光'], seg: groundLaser }),
    raid: drill({ name: '航空支援：突擊', sub: '飛行裝置直線', brief: '', info: ['航空支援：突擊'], mechs: ['突擊機動'], seg: airRaid }),
    deflect: drill({ name: '偏向粒子炮', sub: '躲機械翼背面', brief: '', info: ['攻擊：偏向粒子炮'], mechs: ['攻擊：偏向粒子炮'], seg: deflect }),
    marks: drill({ name: '對人激光＋高功率激光', sub: '坦克點名、分攤', brief: '', info: ['炮擊命令：對人激光', '炮擊命令：高功率激光'], mechs: ['炮擊命令：對人激光', '炮擊命令：高功率激光'], seg: (G, t0) => highLaser(G, personLaser(G, t0) + 1) }),
    song: drill({ name: '終焉之歌', sub: '站缺口', brief: '', info: ['終焉之歌'], mechs: ['終焉之歌'], seg: song }),
  },
  loot: {
    currency: [[TOMES.詩學, 10], [TOMES.數理, 10]],
    items: [...gearSet('頭部', '寄葉五三式', '軍帽', 'Lv80・品級 490'), ...gearSet('腳部', '寄葉五三式', '軍靴', 'Lv80・品級 490')],
  },
};
