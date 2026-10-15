/*
 * 尼爾 1 複製工廠廢墟・第一王：多關節型：司令機
 * 資料：灰機 wiki（機制效果）＋ 新大陸見聞錄（處理方式）。
 * 時間軸順序、詠唱秒數、AOE 大小、場地尺寸全部是估計（wiki 與攻略都沒有寫），集中在 T。
 */
import type { Vec } from '../../core/constants';
import { squareArena } from '../../core/arena';
import { angTo, deg, polar, DIR } from '../../core/geometry';
import type { Shape } from '../../core/shapes';
import { hitShape } from '../../core/shapes';
import { REACT } from '../../core/tuning';
import { at, bossById, encData, present, variant, type Entity, type GameState, type Telegraph } from '../../game/state';
import { bad, good, botHit } from '../../game/results';
import { claim, npcs, settle } from '../../game/bots';
import { aoe, castAt, knockback, passIf, raidwide, spread } from '../../mechanics/common';
import { drill, flowHtml } from '../../drills/build';
import { px, text } from '../../render/canvas';
import type { Encounter } from '../types';
import { clusterHome, yorha, TOMES } from './shared';

/** 估計值 */
const T = {
  half: 20,
  /** 包圍陣型：能量彈直線半寬、三輪間隔 */
  encircle: { cast: 4, hw: 2.5, gap: 2.6, show: 3 },
  mortar: { cast: 4, r: 5, n: 6, spotR: 16 },
  barrage: { cast: 5, r: 40, w: deg(50), n: 3, gap: 0.9 },
  guided: { cast: 4, tether: 4, fire: 1.5, w: 4 },
  /** 旋轉攻擊：預兆只出現不到 1 秒（新大陸見聞錄） */
  spin: { cast: 5, visible: 0.8, sideOff: 7.5, sideHW: 4.5, centerHW: 5, len: 20 },
  air: { cast: 4.5, outer: 16, inner: 6, r: 4, dur: 6, show: 1.6, safe: 11, kb: 10 },
  sweep: { cast: 4, show: 3.5 },
  omni: { cast: 4, steps: [6, 12, 18, 30], gap: 1.6, show: 2.4 },
};

const C0: Vec = { x: 0, y: 0 };
const home = clusterHome(C0, 7);
const boss = (G: GameState) => bossById(G, 'cmd');

interface CmdState { soldiers: Vec[]; soldierUntil: number; paths: Vec[][]; pathUntil: number }
const S = (G: GameState): CmdState => encData(G, 'cmd', () => ({ soldiers: [], soldierUntil: 0, paths: [], pathUntil: 0 }));
function showSoldiers(G: GameState, at0: number, list: Vec[], until: number): void {
  at(G, at0, () => { G.x.cmd = { ...S(G), soldiers: list, soldierUntil: until }; });
}

/** 包圍陣型：四邊各一隻士兵機沿邊移動，往場內射能量彈（三輪） */
function encircle(G: GameState, t0: number): number {
  const me = claim(G, t0), o = T.encircle, tag = '包圍陣型';
  const end = castAt(G, t0, tag, o.cast, '四邊的士兵機會沿邊移動、往場內射能量彈：看士兵機的位置，躲開它前方的直線');
  let t = end + 0.8;
  for (let k = 0; k < 3; k++) {
    const xs = [G.rng.rnd(-15, 15), G.rng.rnd(-15, 15)], ys = [G.rng.rnd(-15, 15), G.rng.rnd(-15, 15)];
    const E = T.half + 1.5;
    showSoldiers(G, t - o.show, [{ x: xs[0], y: -E }, { x: xs[1], y: E }, { x: -E, y: ys[0] }, { x: E, y: ys[1] }], t + 0.3);
    const lines: Shape[] = [...xs.map((x) => ({ k: 'line' as const, x, y: 0, a: 0, hw: o.hw })), ...ys.map((y) => ({ k: 'line' as const, x: 0, y, a: DIR.E, hw: o.hw }))];
    aoe(G, t, lines, { tag, show: o.show, why: '被士兵機的能量彈打中（能量爆炸）', ok: k === 2 ? '躲開了三輪能量彈' : null });
    t += o.gap;
  }
  settle(G, t, me);
  return t + 0.5;
}

/** 迫擊能量彈：點名數人，腳下圓形 AOE */
function mortar(G: GameState, t0: number): number {
  const me = claim(G, t0), o = T.mortar, tag = '迫擊能量彈';
  const end = castAt(G, t0, tag, o.cast, '頭上有圈的人分散到場邊，沒被點的人留在王身邊');
  const ang = (e: Entity): number => (angTo(C0, home(e.al, e.role)) + 2 * Math.PI) % (2 * Math.PI);
  const list = G.rng.shuffle(G.ents).slice(0, o.n).sort((a, b) => ang(a) - ang(b));
  spread(G, end, { tag, show: o.cast, r: o.r, targets: list, spot: (_e, i) => polar(C0, deg(30 + i * 60), o.spotR), rest: (e) => home(e.al, e.role) });
  settle(G, end + 0.5, me);
  return end + 1;
}

/** 連續能量彈：王轉身面向隨機一人（非一仇），連續打大扇形 */
function barrage(G: GameState, t0: number): number {
  const me = claim(G, t0), o = T.barrage, tag = '連續能量彈';
  const end = castAt(G, t0, tag, o.cast, '王突然轉身：繞到王的兩側或背後');
  const target = G.rng.pickOne(G.ents.filter((e) => e.role !== 'MT'));
  at(G, t0, () => {
    const b = boss(G), a = angTo(b, target);
    b.face = a;
    for (let k = 0; k < o.n; k++) {
      const t = end + k * o.gap;
      aoe(G, t, { k: 'fan', x: b.x, y: b.y, r: o.r, a, w: o.w }, { tag, show: t - G.t, why: '站在王的正面，被扇形彈幕打中', ok: k === o.n - 1 ? '躲到王的側面／背後' : null });
    }
  });
  at(G, end + o.n * o.gap, () => { boss(G).face = Math.PI; });
  settle(G, end + o.n * o.gap, me);
  return end + o.n * o.gap + 0.5;
}

/** 瞄準陣型：場外士兵機連線點名的人，一段時間後固定路線射雷射 */
const GUIDE_SOLDIER: Vec[] = [{ x: -T.half - 3, y: -10 }, { x: 10, y: -T.half - 3 }, { x: T.half + 3, y: -10 }];
const GUIDE_SPOT: Vec[] = [{ x: -17, y: 17 }, { x: -17, y: -17 }, { x: 17, y: 17 }];
function guided(G: GameState, t0: number): number {
  const me = claim(G, t0), o = T.guided, tag = '瞄準陣型';
  const end = castAt(G, t0, tag, o.cast, '被連線的人把雷射沿著場邊拉（到指定的角落），不要穿過人群、不要和別條線重疊');
  const marked = (['A', 'B', 'C'] as const).map((al) => G.rng.pickOne(G.ents.filter((e) => e.al === al && e.role !== 'MT')));
  const lock = end + o.tether, fire = lock + o.fire;
  showSoldiers(G, t0, GUIDE_SOLDIER, fire + 0.3);
  at(G, end, () => {
    marked.forEach((e, i) => { e.marker = { kind: 'target', until: lock, label: '雷射' }; G.fx.push({ k: 'tether', from: GUIDE_SOLDIER[i], to: e, until: lock, col: 'rgba(255,93,108,.85)' }); });
    const k = marked.indexOf(G.player);
    if (k >= 0) G.hints = [{ ...GUIDE_SPOT[k], r: 1.6, label: '把雷射拉到這裡' }];
  });
  at(G, end + REACT, () => npcs(G).forEach((e) => { const k = marked.indexOf(e); if (k >= 0) e.mt = { ...GUIDE_SPOT[k] }; }));
  let lines: Telegraph[] = [];
  at(G, lock, () => {
    G.hints = [];
    lines = marked.map((e, i) => ({ k: 'rect' as const, O: GUIDE_SOLDIER[i], H: angTo(GUIDE_SOLDIER[i], e), len: 70, w: o.w, until: fire }));
    G.tele.push(...lines);
  });
  at(G, fire, () => {
    const P = G.player, mine = marked.indexOf(P);
    present(G).forEach((e) => {
      const k = marked.indexOf(e);
      const hitBy = lines.findIndex((l, i) => i !== k && hitShape(e, l));
      const myHits = k >= 0 && present(G).some((x) => x !== e && hitShape(x, lines[k]));
      if (e === P) {
        const fix = mine >= 0 ? { ...GUIDE_SPOT[mine], r: 1.6, label: '沿場邊拉到角落' } : undefined;
        if (myHits) bad(G, tag, '你的雷射穿過了隊友', fix);
        else if (hitBy >= 0) bad(G, tag, '被別人的雷射打中', fix);
        else good(G, tag, mine >= 0 ? '雷射沒有打到任何人' : '沒被雷射打中', fix);
      } else if (hitBy >= 0 || myHits) botHit(G, e, tag, myHits ? '雷射穿過隊友' : '被雷射打中');
    });
  });
  settle(G, fire + 0.3, me);
  return fire + 0.8;
}

export type SpinKind = 'side' | 'center';
/** 側方／中央旋轉攻擊：讀條結束才出現不到 1 秒的預兆，要看技能名稱提前躲 */
function spin(G: GameState, t0: number, kind: SpinKind): number {
  const me = claim(G, t0), o = T.spin;
  const tag = kind === 'side' ? '側方旋轉攻擊' : '中央旋轉攻擊';
  const end = castAt(G, t0, tag, o.cast, kind === 'side' ? '王的左右手外側長方形：往王的正前／正後（中間）躲' : '王中央的長方形：往王的兩側躲');
  // 王固定在中央、面南（排機制時就要算好形狀；隨機練習時這時候的場地可能還是別的王）
  const b = Math.PI, c = C0;
  const shapes: Shape[] = kind === 'side'
    ? [-1, 1].map((s) => ({ k: 'line' as const, x: c.x + Math.cos(b) * s * o.sideOff, y: c.y + Math.sin(b) * s * o.sideOff, a: b, hw: o.sideHW, len: o.len }))
    : [{ k: 'line', x: c.x, y: c.y, a: b, hw: o.centerHW, len: o.len }];
  aoe(G, end + 0.3, shapes, { tag, show: o.cast + 0.3, visible: o.visible, why: kind === 'side' ? '站在王的左右兩側' : '站在王的正前或正後' });
  settle(G, end + 0.6, me);
  return end + 1;
}

/** 空袭陣型：四角內外兩圈士兵機沿箭頭路線連續投彈；第二次先放衝擊波（擊退） */
function squarePath(h: number, step: number): Vec[] {
  const pts: Vec[] = [], corners = [{ x: -h, y: -h }, { x: h, y: -h }, { x: h, y: h }, { x: -h, y: h }];
  corners.forEach((p, i) => {
    const q = corners[(i + 1) % 4], L = Math.hypot(q.x - p.x, q.y - p.y), n = Math.round(L / step);
    for (let k = 0; k < n; k++) pts.push({ x: p.x + ((q.x - p.x) * k) / n, y: p.y + ((q.y - p.y) * k) / n });
  });
  return pts;
}
const AIR_SAFE: Vec[] = [{ x: -T.air.safe, y: -T.air.safe }, { x: T.air.safe, y: -T.air.safe }, { x: T.air.safe, y: T.air.safe }, { x: -T.air.safe, y: T.air.safe }];
const nearestSafe = (p: Vec): Vec => AIR_SAFE.reduce((a, b) => (Math.hypot(b.x - p.x, b.y - p.y) < Math.hypot(a.x - p.x, a.y - p.y) ? b : a));
function airstrike(G: GameState, t0: number, shock: boolean): number {
  const me = claim(G, t0), o = T.air, tag = '空襲陣型';
  const end = castAt(G, t0, tag, o.cast, shock ? '先開防擊退擋衝擊波，再到內外兩圈路線中間的安全點（四個角內側）' : '到內外兩圈路線中間的安全點（四個角內側、地板兩根水管交叉處）');
  const outer = squarePath(o.outer, 4), inner = squarePath(o.inner, 3);
  const start = end + (shock ? 2.5 : 0.8);
  at(G, t0, () => { G.x.cmd = { ...S(G), paths: [outer, inner], pathUntil: start + o.dur + 0.5 }; G.hints = [nearestSafe(G.player)].map((p) => ({ ...p, r: 1.4, label: '安全點' })); });
  at(G, t0 + REACT, () => npcs(G).forEach((e) => { e.mt = { ...nearestSafe(e) }; }));
  if (shock) {
    castAt(G, end + 0.2, '衝擊波', 2, '以王為中心的擊退：開防擊退', undefined, false);
    knockback(G, end + 2.2, { tag: '衝擊波', show: 2, from: 'cmd', dist: o.kb, akbBots: true });
  }
  [outer, inner].forEach((path) => path.forEach((p, k) => {
    const t = start + (o.dur * k) / path.length;
    aoe(G, t, { k: 'circle', x: p.x, y: p.y, r: o.r }, { tag, show: o.show, why: '被士兵機投下的能量炸彈打中', ok: null, dodge: false });
  }));
  passIf(G, start + o.dur + 0.1, tag, t0, '躲開了所有能量炸彈', (g) => ({ ...nearestSafe(g.player), r: 1.4, label: '四角內側的安全點' }));
  at(G, start + o.dur + 0.1, () => { G.hints = []; });
  settle(G, start + o.dur + 0.3, me);
  return start + o.dur + 0.8;
}

/** 掃射陣型：場邊士兵機打半場直線，兩輪；第二次起第二輪是橫豎兩組（只剩四分之一安全） */
function sweep(G: GameState, t0: number, second: boolean): number {
  const me = claim(G, t0), o = T.sweep, tag = '掃射陣型';
  const end = castAt(G, t0, tag, o.cast, second ? '第二輪橫豎兩組：只剩一個角落安全' : '看士兵機在哪一邊：躲到另外半場');
  const dirs = [DIR.N, DIR.E, DIR.S, DIR.W];
  const a1 = G.rng.pickOne(dirs), perp = G.rng.pickOne([a1 + Math.PI / 2, a1 - Math.PI / 2]);
  const half = (a: number): Shape => ({ k: 'half', x: 0, y: 0, r: 60, a });
  const t1 = end + 0.5, t2 = t1 + o.show;
  aoe(G, t1, half(a1), { tag, show: t1 - t0, visible: o.show, why: '站在士兵機掃射的半場', ok: null });
  aoe(G, t2, second ? [half(perp), half(a1 + Math.PI)] : half(perp), { tag, show: o.show, why: '第二輪掃射沒躲開', ok: '躲開了兩輪掃射' });
  settle(G, t2 + 0.3, me);
  return t2 + 0.8;
}

/** 全方位能量彈：從王身上由內往外 4 段（圓 → 環 → 環 → 環） */
function omni(G: GameState, t0: number): number {
  const me = claim(G, t0), o = T.omni, tag = '全方位能量彈';
  const end = castAt(G, t0, tag, o.cast, '由內往外擴散：先站在第一圈外面，第一圈炸完立刻進到王腳下');
  const t1 = end + 0.6;
  o.steps.forEach((r, k) => {
    const s: Shape = k === 0 ? { k: 'circle', x: 0, y: 0, r } : { k: 'ring', x: 0, y: 0, r0: o.steps[k - 1], r1: r };
    aoe(G, t1 + k * o.gap, s, { tag, show: o.show, why: `被第 ${k + 1} 段擴散打中`, ok: k === o.steps.length - 1 ? '第一段炸完就進到中間' : null, dodge: false });
  });
  const ang = (e: Entity): number => angTo(C0, home(e.al, e.role));
  at(G, t0 + REACT, () => { npcs(G).forEach((e) => { e.mt = polar(C0, ang(e), o.steps[0] + 2.5); }); G.hints = [{ ...polar(C0, ang(G.player), o.steps[0] + 2.5), r: 1.4, label: '先站這裡' }]; });
  at(G, t1 + 0.05, () => { npcs(G).forEach((e) => { e.mt = polar(C0, ang(e), 2.5); }); G.hints = [{ ...polar(C0, ang(G.player), 2.5), r: 1.4, label: '進中間' }]; });
  at(G, t1 + o.gap * 3 + 0.1, () => { G.hints = []; });
  settle(G, t1 + o.gap * 3 + 0.3, me);
  return t1 + o.gap * 3 + 0.8;
}

const strike = (G: GameState, t0: number): number => castAt(G, t0, '強攻擊', 4.5, '對一仇的大傷害（坦克死刑）：坦克開減傷') + 0.5;
const quake = (G: GameState, t0: number): number => raidwide(G, t0, '大震動', 5) + 0.8;

/** 估計的完整時間軸（wiki 沒寫順序） */
function fullSeg(G: GameState, t0: number): number {
  const sp = (): SpinKind => (G.rng.chance(0.5) ? 'side' : 'center');
  let t = t0;
  for (const f of [
    encircle, mortar, strike, barrage, quake, guided,
    (g: GameState, x: number) => spin(g, x, sp()),
    (g: GameState, x: number) => airstrike(g, x, false),
    (g: GameState, x: number) => sweep(g, x, false),
    (g: GameState, x: number) => spin(g, x, sp()),
    omni, quake,
    (g: GameState, x: number) => airstrike(g, x, true),
    (g: GameState, x: number) => sweep(g, x, true),
    barrage,
  ]) t = f(G, t) + 1.5;
  return t;
}

const ALL = ['包圍陣型', '迫擊能量彈', '強攻擊', '連續能量彈', '大震動', '瞄準陣型', '側方旋轉攻擊', '中央旋轉攻擊', '空襲陣型', '衝擊波', '掃射陣型', '全方位能量彈'];

export const commander: Encounter = {
  id: 'cmd',
  name: '多關節型：司令機',
  sub: '第一王・召喚無法選中的士兵機',
  arena: squareArena(T.half, 'wall'),
  bosses: [{ id: 'cmd', name: '司令機', x: 0, y: 0, face: Math.PI, r: 4 }],
  home,
  startFace: Math.PI,
  info: {
    包圍陣型: { effect: '場地四邊各召喚一隻士兵機，沿著邊來回隨機移動，往場內射圓形能量彈（能量爆炸，魔法傷害）。', tell: '詠唱「包圍陣型」；四邊出現士兵機。', how: '看每隻士兵機的位置，躲開它正前方的彈道；士兵機會換位置，連躲三輪。' },
    迫擊能量彈: { effect: '王射出多發能量彈，點名數名玩家，在他們腳下產生圓形 AOE。', tell: '被點名的人頭上出現圈。', how: '被點的人離開人群到場邊各自的位置；沒被點的人留在王身邊。' },
    強攻擊: { effect: '對一仇的大傷害。', tell: '王詠唱「強攻擊」。', how: '坦克開減傷；其他人不用處理。', tank: '只有一仇（拉王的坦克）吃：開減傷。', heal: '讀條時先替一仇上盾、抬滿血。' },
    連續能量彈: { effect: '面向隨機一名非一仇目標，連續發射多段大範圍扇形 AOE。', tell: '<b>王突然轉身</b>面向某人。', how: '很容易暴斃：看到王轉身就<b>站到王的兩側或背後</b>。', tank: '不會點一仇，但扇形很大：坦克也要確認自己不在王轉過去的方向。', heal: '可能被點：看到王轉身就往王的兩側或背後移動。', dps: '可能被點：看到王轉身就往王的兩側或背後移動。' },
    大震動: { effect: '全場 AOE。', tell: '王詠唱「大震動」。', how: '不用走位，補師注意抬血。', heal: '全場傷害：讀條時先上群盾，結束後群補。' },
    瞄準陣型: { effect: '場邊外召喚數隻士兵機準備發射制導雷射，隨機點名數人並跟隨一小段時間，之後固定路線發射。', tell: '被點名的人和場外士兵機之間<b>連線</b>。', how: '被點的人把線引導向場外（模擬器：沿著場邊拉到指定角落），不要穿過人群、不要和別條線重疊。' },
    側方旋轉攻擊: { effect: '在王左右手外側產生長方形 AOE。', tell: '詠唱「側方旋轉攻擊」；<b>讀條結束才出現不到 1 秒的預兆</b>。', how: '看技能名稱提前躲：<b>側方 → 往王的中間（正前／正後）躲</b>。' },
    中央旋轉攻擊: { effect: '在王中央產生長方形 AOE。', tell: '詠唱「中央旋轉攻擊」；<b>讀條結束才出現不到 1 秒的預兆</b>。', how: '看技能名稱提前躲：<b>中央 → 往王的兩側躲</b>。' },
    空襲陣型: { effect: '王在場地四角生成會連續移動的內外兩圈士兵機，地面顯示箭頭路線，士兵機沿路線連續投下能量炸彈。', tell: '詠唱「空襲陣型」；地面出現內外兩圈箭頭路線。', how: '到<b>安全點</b>：士兵機出現位置的內側、地板下兩根水管的交叉處（四個角內側）；或跑步躲避。' },
    衝擊波: { effect: '配合第二次空襲陣型，以王為中心的全場擊退。', tell: '王詠唱「衝擊波」。', how: '開<b>防擊退</b>，不然會被推進炸彈路線。' },
    掃射陣型: { effect: '場地周圍召喚多組士兵機，向場內發射覆蓋半場的直線 AOE，共兩輪；第二次起第二輪會有橫豎兩組士兵機。', tell: '場邊哪一側出現士兵機，就是那半場會被掃射。', how: '躲到另外半場；第二次起第二輪只剩一個角落安全。' },
    全方位能量彈: { effect: '以王為中心，由內往外 4 段步進式 AOE（圓形 → 環形擴散）。', tell: '王詠唱「全方位能量彈」。', how: '先站在第一圈外面，<b>第一圈炸完立刻進到王腳下</b>，後面三段都在外面。' },
  },
  drills: {
    full: drill({ tl: true, name: '完整時間軸', sub: '順序為估計', brief: flowHtml(['包圍陣型', '迫擊能量彈', '強攻擊', '連續能量彈', '大震動', '瞄準陣型', '側方／中央旋轉攻擊', '空襲陣型', '掃射陣型', '側方／中央旋轉攻擊', '全方位能量彈', '大震動', '空襲陣型＋衝擊波', '掃射陣型（橫豎兩組）', '連續能量彈']) + '<p class="bnote">wiki 與攻略都沒有寫技能順序，這是估計的排法。</p>', info: ALL, seg: fullSeg }),
    encircle: drill({ name: '包圍陣型', sub: '四邊士兵機能量彈', brief: '', info: ['包圍陣型'], mechs: ['包圍陣型'], seg: encircle }),
    mortar: drill({ name: '迫擊能量彈', sub: '點名分散', brief: '', info: ['迫擊能量彈'], mechs: ['迫擊能量彈'], seg: mortar }),
    barrage: drill({ name: '連續能量彈', sub: '王轉身扇形', brief: '', info: ['連續能量彈'], mechs: ['連續能量彈'], seg: barrage }),
    guided: drill({ name: '瞄準陣型', sub: '制導雷射連線', brief: '', info: ['瞄準陣型'], mechs: ['瞄準陣型'], seg: guided }),
    spin: drill({ name: '側方／中央旋轉攻擊', sub: '預兆不到 1 秒', brief: '', info: ['側方旋轉攻擊', '中央旋轉攻擊'], mechs: ['側方旋轉攻擊', '中央旋轉攻擊'],
      seg: (G, t0) => spin(G, t0, variant<SpinKind>(G, 'spin', G.rng.chance(0.5) ? 'side' : 'center')) }),
    air: drill({ name: '空襲陣型', sub: '內外兩圈投彈', brief: '', info: ['空襲陣型', '衝擊波'], mechs: ['空襲陣型', '衝擊波'],
      seg: (G, t0) => airstrike(G, t0, variant(G, 'air', G.rng.chance(0.5) ? 'shock' : 'plain') === 'shock') }),
    sweep: drill({ name: '掃射陣型', sub: '半場直線兩輪', brief: '', info: ['掃射陣型'], mechs: ['掃射陣型'],
      seg: (G, t0) => sweep(G, t0, variant(G, 'sweep', G.rng.chance(0.5) ? '2' : '1') === '2') }),
    omni: drill({ name: '全方位能量彈', sub: '由內往外 4 段', brief: '', info: ['全方位能量彈'], mechs: ['全方位能量彈'], seg: omni }),
  },
  variants: {
    spin: [{ key: 'spin', label: '種類', opts: [
      { value: 'side', label: '側方', tell: '詠唱「側方旋轉攻擊」', how: '往王的<b>中間</b>（正前／正後）躲。' },
      { value: 'center', label: '中央', tell: '詠唱「中央旋轉攻擊」', how: '往王的<b>兩側</b>躲。' },
    ] }],
    air: [{ key: 'air', label: '版本', opts: [
      { value: 'plain', label: '第一次', tell: '只有空襲陣型', how: '到四角內側的安全點。' },
      { value: 'shock', label: '第二次（衝擊波）', tell: '空襲陣型後王詠唱衝擊波', how: '先開防擊退，再待在安全點。' },
    ] }],
    sweep: [{ key: 'sweep', label: '版本', opts: [
      { value: '1', label: '第一次', tell: '兩輪各一組士兵機', how: '每輪躲到另外半場。' },
      { value: '2', label: '第二次起', tell: '第二輪橫豎兩組士兵機', how: '第二輪只剩一個角落安全。' },
    ] }],
  },
  draw(c, G, layer) {
    const s = G.x.cmd as CmdState | undefined;
    if (!s) return;
    if (layer === 'floor' && s.paths.length && G.t < s.pathUntil) {
      // 空襲路線：虛線＋箭頭方向
      c.save(); c.strokeStyle = 'rgba(255,190,120,.55)'; c.lineWidth = px(2); c.setLineDash([px(8), px(6)]);
      s.paths.forEach((p) => { c.beginPath(); p.forEach((q, i) => (i ? c.lineTo(q.x, q.y) : c.moveTo(q.x, q.y))); c.closePath(); c.stroke(); });
      c.restore();
    }
    if (layer === 'top' && G.t < s.soldierUntil) {
      s.soldiers.forEach((p) => {
        c.save(); c.fillStyle = '#6e6853'; c.strokeStyle = '#f1ecd8'; c.lineWidth = px(1.5);
        c.beginPath(); c.rect(p.x - 1.1, p.y - 1.1, 2.2, 2.2); c.fill(); c.stroke(); c.restore();
        text(c, '士兵機', p.x, p.y - 2, 10.5, '#f1ecd8', 700);
      });
    }
  },
  loot: {
    currency: [[TOMES.詩學, 10], [TOMES.數理, 10]],
    items: [...yorha('頭部', '軍帽'), ...yorha('腳部', '軍靴')],
  },
};
