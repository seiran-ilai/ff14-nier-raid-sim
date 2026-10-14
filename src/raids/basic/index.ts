// 基礎機制訓練場：FF14 常見的通用機制（不是尼爾特有的），用來熟悉操作，也驗證模擬器本身。
// 數值全部是示意用的估計值。
import type { Alliance, Role, Vec } from '../../core/constants';
import { ALS, ROLES } from '../../core/constants';
import { squareArena } from '../../core/arena';
import { deg, polar, angTo } from '../../core/geometry';
import type { Shape } from '../../core/shapes';
import { at, setCast, seqAdd, variant, type Entity, type GameState } from '../../game/state';
import { claim, settle } from '../../game/bots';
import { aoe, stack, spread, knockback, towers, gaze } from '../../mechanics/common';
import { drill, flowHtml } from '../../drills/build';
import type { Encounter, Raid } from '../types';

/** 估計值 */
const T = {
  half: 20,
  boss: { x: 0, y: -6 } as Vec,
  cast: 3.5,
  steelR: 9,
  donutR0: 5,
  fanW: deg(60),
  crossHW: 3,
  stackR: 3,
  spreadR: 5,
  spreadSpotR: 16,
  kbDist: 12,
  towerR: 3.5,
};

const AL_X: Record<Alliance, number> = { A: -8, B: 0, C: 8 };
/** 原位：王南邊，A 西、B 中、C 東；每隊 4×2 */
function home(al: Alliance, role: Role): Vec {
  const i = ROLES.indexOf(role);
  return { x: AL_X[al] + (-2.4 + (i % 4) * 1.6), y: 2 + Math.floor(i / 4) * 1.6 };
}
const alCenter = (al: Alliance): Vec => ({ x: AL_X[al], y: 2.8 });

const B = T.boss;
const SHAPES: Record<string, () => Shape> = {
  鋼鐵: () => ({ k: 'circle', x: B.x, y: B.y, r: T.steelR }),
  月環: () => ({ k: 'ring', x: B.x, y: B.y, r0: T.donutR0, r1: 60 }),
  正面扇形: () => ({ k: 'fan', x: B.x, y: B.y, r: 60, a: Math.PI, w: T.fanW }),
  十字: () => ({ k: 'cross', x: B.x, y: B.y, a: 0, hw: T.crossHW }),
};
const TIPS: Record<string, string> = { 鋼鐵: '離開王身邊', 月環: '貼近王（進中間的安全圈）', 正面扇形: '繞到王的背後或兩側', 十字: '避開王的正南北與正東西' };

function dodgeSeg(G: GameState, t0: number, n = 4): number {
  const me = claim(G, t0);
  const keys = Object.keys(SHAPES);
  let t = t0, last = '';
  for (let i = 0; i < n; i++) {
    const k = i === 0 ? variant(G, 'dodge', G.rng.pickOne(keys)) : G.rng.pickOne(keys.filter((x) => x !== last));
    last = k;
    seqAdd(G, t, k);
    at(G, t, () => setCast(G, k, T.cast, TIPS[k]));
    aoe(G, t + T.cast, SHAPES[k](), { tag: k, show: T.cast, why: `被${k}打中` });
    t += T.cast + 1.6;
  }
  settle(G, t, me);
  return t;
}

const allianceTargets = (G: GameState): Record<Alliance, Entity> =>
  Object.fromEntries(ALS.map((al) => [al, G.rng.pickOne(G.ents.filter((e) => e.al === al))])) as Record<Alliance, Entity>;

function stackSeg(G: GameState, t0: number): number {
  const me = claim(G, t0);
  seqAdd(G, t0, '分攤');
  let tg: Record<Alliance, Entity> | null = null;
  at(G, t0, () => { tg = allianceTargets(G); setCast(G, '分攤', T.cast + 1, '每個隊伍點 1 人：到自己隊伍的點名者身邊'); });
  // 點名要在詠唱開始時決定，stack() 的參數用延遲取值
  at(G, t0 + 0.01, () => {
    const map = tg!;
    stack(G, G.t + T.cast + 1, { tag: '分攤', show: T.cast + 1, r: T.stackR, targets: ALS.map((al) => map[al]), groupOf: (e) => map[e.al], spot: (x) => alCenter(x.al), need: 8 });
  });
  settle(G, t0 + T.cast + 1.6, me);
  return t0 + T.cast + 2;
}

function spreadSeg(G: GameState, t0: number): number {
  const me = claim(G, t0);
  seqAdd(G, t0, '分散');
  at(G, t0, () => setCast(G, '分散', T.cast + 1, '頭上有圈的人分散到場邊；沒圈的人留在原位'));
  at(G, t0 + 0.01, () => {
    // 被點的人依原位的方位（從北順時針）排序，對應到同樣順序的分散點，跑最短的路
    const ang = (e: Entity): number => { const a = angTo({ x: 0, y: 0 }, home(e.al, e.role)); return (a + 2 * Math.PI) % (2 * Math.PI); };
    const list = G.rng.shuffle(G.ents).slice(0, 6).sort((a, b) => ang(a) - ang(b));
    spread(G, G.t + T.cast + 1, { tag: '分散', show: T.cast + 1, r: T.spreadR, targets: list, spot: (_e, i) => polar({ x: 0, y: 0 }, deg(30 + i * 60), T.spreadSpotR), rest: (e) => home(e.al, e.role) });
  });
  settle(G, t0 + T.cast + 1.6, me);
  return t0 + T.cast + 2;
}

function kbSeg(G: GameState, t0: number): number {
  const me = claim(G, t0);
  seqAdd(G, t0, '擊退');
  at(G, t0, () => setCast(G, '擊退', T.cast + 1, '貼近王再被擊退（或開防擊退），不要被推到場邊'));
  knockback(G, t0 + T.cast + 1, {
    tag: '擊退', show: T.cast + 1, from: 'dummy', dist: T.kbDist,
    // Bot：站到王身邊（自己原位的方向），被推出去也碰不到場邊
    spot: (e) => polar(B, angTo(B, home(e.al, e.role)), 2.5),
    fix: (g) => ({ ...polar(B, angTo(B, g.player), 2.5), r: 1.4, label: '貼近王（或開防擊退）' }),
  });
  settle(G, t0 + T.cast + 2.2, me);
  return t0 + T.cast + 2.5;
}

const TOWER_AT: Record<Alliance, Vec> = { A: { x: -10, y: 8 }, B: { x: 0, y: 13 }, C: { x: 10, y: 8 } };
function towerSeg(G: GameState, t0: number): number {
  const me = claim(G, t0);
  seqAdd(G, t0, '踩塔');
  at(G, t0, () => setCast(G, '踩塔', T.cast + 1.5, '每個隊伍進自己的塔：A 西、B 南、C 東'));
  towers(G, t0 + T.cast + 1.5, { tag: '踩塔', show: T.cast + 1.5, list: ALS.map((al) => ({ ...TOWER_AT[al], r: T.towerR, need: 4, label: `${al} 隊伍的塔` })), assign: (e) => ALS.indexOf(e.al) });
  settle(G, t0 + T.cast + 2, me);
  return t0 + T.cast + 2.5;
}

function gazeSeg(G: GameState, t0: number): number {
  const me = claim(G, t0);
  seqAdd(G, t0, '背對');
  at(G, t0, () => setCast(G, '背對', T.cast + 1, '判定時背對王（按住右鍵轉面向）'));
  gaze(G, t0 + T.cast + 1, { tag: '背對', show: T.cast + 1, src: 'dummy' });
  settle(G, t0 + T.cast + 1.5, me);
  return t0 + T.cast + 2;
}

const ALL = ['鋼鐵', '月環', '正面扇形', '十字', '分攤', '分散', '擊退', '踩塔', '背對'];

export const training: Encounter = {
  id: 'dummy',
  name: '訓練木人',
  sub: '通用機制練習（不是尼爾特有）',
  arena: squareArena(T.half, 'death'),
  bosses: [{ id: 'dummy', name: '木人', x: B.x, y: B.y, face: Math.PI, r: 3 }],
  home,
  waymarks: { A: { x: 0, y: -16 }, B: { x: 16, y: 0 }, C: { x: 0, y: 16 }, D: { x: -16, y: 0 } },
  info: {
    鋼鐵: { effect: '王身邊的圓形 AOE。', tell: '王詠唱，腳下出現大圓預兆。', how: '離開王身邊，走到圓外。' },
    月環: { effect: '王身邊環形 AOE，中間一小圈是安全的。', tell: '王詠唱，腳下出現中空的環形預兆。', how: '貼近王，站進中間的安全圈。' },
    正面扇形: { effect: '王正面的扇形 AOE。', tell: '王詠唱，正面出現扇形預兆。', how: '繞到王的背後或兩側。' },
    十字: { effect: '以王為中心的十字直線 AOE。', tell: '王詠唱，出現十字形預兆。', how: '避開十字線，站到斜角。' },
    分攤: { effect: '點名者腳下的圓形傷害，圈裡的人平分。', tell: '點名者頭上出現<b>黃色箭頭圈</b>。', how: '到自己隊伍的點名者身邊（圈內），一起吃。' },
    分散: { effect: '點名者腳下的圓形 AOE，碰到的人都吃傷害。', tell: '點名者頭上出現<b>紫色圈</b>。', how: '被點的人分散到場邊各自的位置；沒被點的人不要靠近。' },
    擊退: { effect: '從王往外推，碰到場邊死亡牆就陣亡。', tell: '王詠唱，出現擊退提示。', how: '<b>貼近王</b>再被擊退（推出去也碰不到場邊），或開<b>防擊退</b>。' },
    踩塔: { effect: '地上出現塔，人數不夠會全場大傷害。', tell: '地上出現有人數的圓形塔。', how: '照分配進自己的塔，站在圈內。' },
    背對: { effect: '判定時面向王會中招（石化或傷害）。', tell: '王詠唱，畫面出現視線。', how: '判定前<b>背對王</b>（按住滑鼠右鍵轉面向），判定完再轉回來。' },
  },
  drills: {
    all: drill({ tl: true, name: '綜合練習', sub: '全部基礎機制連續', brief: flowHtml(['躲 AOE ×2', '分攤', '分散', '擊退', '踩塔', '背對']), info: ALL,
      seg(G, t0) { let t = dodgeSeg(G, t0, 2) + 1; t = stackSeg(G, t) + 1; t = spreadSeg(G, t) + 1; t = kbSeg(G, t) + 1; t = towerSeg(G, t) + 1; return gazeSeg(G, t); } }),
    dodge: drill({ name: '躲 AOE', sub: '鋼鐵・月環・扇形・十字', brief: '連續 4 發，看預兆形狀決定站位。', info: ['鋼鐵', '月環', '正面扇形', '十字'], mechs: ['鋼鐵', '月環', '正面扇形', '十字'], seg: (G, t0) => dodgeSeg(G, t0) }),
    stack: drill({ name: '分攤', sub: '每隊點 1 人', brief: '', info: ['分攤'], mechs: ['分攤'], seg: stackSeg }),
    spread: drill({ name: '分散', sub: '點 6 人', brief: '', info: ['分散'], mechs: ['分散'], seg: spreadSeg }),
    kb: drill({ name: '擊退', sub: '場邊是死亡牆', brief: '', info: ['擊退'], mechs: ['擊退'], seg: kbSeg }),
    tower: drill({ name: '踩塔', sub: 'A 西・B 南・C 東', brief: '', info: ['踩塔'], mechs: ['踩塔'], seg: towerSeg }),
    gaze: drill({ name: '背對', sub: '判定時不能面向王', brief: '', info: ['背對'], mechs: ['背對'], seg: gazeSeg }),
  },
  variants: {
    dodge: [{ key: 'dodge', label: '第一發', opts: Object.keys(SHAPES).map((k) => ({ value: k, label: k, tell: '', how: TIPS[k] })) }],
  },
};

export const basic: Raid = {
  id: 'basic',
  name: '基礎機制',
  short: '新手',
  encounters: [training],
  sources: [],
  note: 'FF14 通用機制的操作練習（鋼鐵、月環、分攤、分散、擊退、踩塔、背對）。',
};
