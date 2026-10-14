/*
 * 尼爾 1 複製工廠廢墟・第三王：昂格士
 * 王在北邊、面南。全場都要看王的手臂（麥喀士打擊沒有地面預兆，看動作）。
 * 資料：灰機 wiki（機制）＋ 新大陸見聞（處理方式）。尺寸、秒數、時間軸順序都是估計（T）。
 * 略過的部分：能量填充（小怪階段：大型逆關節、2P 轟小怪）、麥喀士夾擊（打手臂的 DPS 檢查），只顯示提示。
 */
import { ALS, ROLES, type Alliance, type Vec } from '../../core/constants';
import { squareArena } from '../../core/arena';
import { deg, DIR } from '../../core/geometry';
import type { Shape } from '../../core/shapes';
import { REACT } from '../../core/tuning';
import { alertMsg, at, encData, variant, type Entity, type GameState, type Telegraph } from '../../game/state';
import { claim, dodge, npcs, settle } from '../../game/bots';
import { aoe, buster, castAt, passIf, raidwide, towers, zone } from '../../mechanics/common';
import { drill, flowHtml } from '../../drills/build';
import { RUN } from '../../core/tuning';
import { px, text } from '../../render/canvas';
import type { Encounter } from '../types';
import { clusterHome, yorha, TOMES } from './shared';

const T = {
  half: 20,
  boss: { x: 0, y: -14 } as Vec,
  /** 麥喀士打擊：詠唱、地面預兆只出現一瞬間、第二擊間隔、高舉時後半場往前延伸幾公尺、兩側／中央的寬度 */
  smash: { cast: 5, visible: 0.6, gap: 1.6, rearLine: -4, sideX: 7 },
  homing: { cast: 4.5, r: 6 },
  burn: { cast: 4, r: 5, fire: 20 },
  chase: { cast: 4, n: 5, gap: 1, lag: 1, r: 3.5 },
  ground: { cast: 4, n: 8, r: 5 },
  barrage: { cast: 5, laser: 4, after: 2.5, r: 3, hw: 8 },
  terrain: { cast: 6, line: 4 },
  arms: { cast: 4, n: 3, h: 8, gap: 2.2, show: 2.6 },
  scatter: { cast: 4, dur: 12 },
};

const home = clusterHome({ x: 0, y: -7 }, 6, { A: deg(240), B: deg(180), C: deg(120) });

export type SmashKind = 'L' | 'R' | 'raise' | 'spread';
const SMASH_TIP: Record<SmashKind, string> = {
  L: '王舉起左手（畫面東側）：攻擊東半場，躲到西半場',
  R: '王舉起右手（畫面西側）：攻擊西半場，躲到東半場',
  raise: '高舉（身體前傾、雙手高舉）：先打後半場、再打兩側 → 站前方中間',
  spread: '展開（身體後仰、張開雙手）：先打前半場、再打中央 → 站後方兩側',
};
interface EngState { pose?: { k: SmashKind; until: number } }
const setPose = (G: GameState, k: SmashKind, until: number): void => { G.x.eng = { ...encData<EngState>(G, 'eng', () => ({})), pose: { k, until } }; };

/** 麥喀士打擊：看王的手臂；沒有地面預兆（只在判定前一瞬間畫出來） */
function smash(G: GameState, t0: number, k: SmashKind): number {
  const me = claim(G, t0), o = T.smash, tag = '麥喀士打擊';
  const end = castAt(G, t0, tag, o.cast, SMASH_TIP[k], '昂格士');
  at(G, t0, () => setPose(G, k, end + o.gap + 0.3));
  const half = (x: number, y: number, a: number): Shape => ({ k: 'half', x, y, r: 70, a });
  const steps: Shape[][] = k === 'L' ? [[half(0, 0, DIR.E)]] : k === 'R' ? [[half(0, 0, DIR.W)]]
    : k === 'raise' ? [[half(0, o.rearLine, DIR.S)], [half(o.sideX, 0, DIR.E), half(-o.sideX, 0, DIR.W)]]
      : [[half(0, 0, DIR.N)], [{ k: 'line', x: 0, y: 0, a: 0, hw: o.sideX }]];
  steps.forEach((s, i) => aoe(G, end + i * o.gap, s, { tag, show: end + i * o.gap - t0, visible: o.visible, why: i ? '第二擊沒躲開（受傷加重）' : '站在王攻擊的範圍（受傷加重）', ok: i === steps.length - 1 ? '看手臂躲開了麥喀士打擊' : null, dodge: false }));
  // Bot：兩擊都要安全的位置
  const all: Telegraph[] = steps.flat().map((s) => ({ ...s, until: end + o.gap }));
  at(G, t0 + REACT + 0.4, () => dodge(G, all, end + (steps.length - 1) * o.gap));
  settle(G, end + (steps.length - 1) * o.gap + 0.4, me);
  return end + (steps.length - 1) * o.gap + 1;
}

/** 高性能跟蹤導彈：點名三隊坦克，高傷害圓形 */
const TB_SPOT: Record<Alliance, Vec> = { A: { x: -17, y: 0 }, B: { x: 0, y: 10 }, C: { x: 17, y: 0 } };
function homing(G: GameState, t0: number): number {
  const me = claim(G, t0), o = T.homing, tag = '高性能跟蹤導彈';
  const end = castAt(G, t0, tag, o.cast, '三隊坦克頭上紅圈：坦克各自離開人群（開減傷）', '昂格士');
  const tanks = G.ents.filter((e) => e.role === 'MT');
  buster(G, end, { tag, show: o.cast, targets: tanks, r: o.r, spot: (e) => TB_SPOT[e.al] });
  settle(G, end + 0.4, me);
  return end + 1;
}

/** 燃燒導彈：每隊點 1 人，圓形 AOE 後留下火焰區 */
/** 燃燒導彈的落點（估計）：避開追蹤導彈的跑道與人群 */
const BURN_SPOT: Record<Alliance, Vec> = { A: { x: -17, y: -14 }, B: { x: 0, y: 17 }, C: { x: 17, y: -14 } };
function burn(G: GameState, t0: number, spots = BURN_SPOT): number {
  const me = claim(G, t0), o = T.burn, tag = '燃燒導彈';
  const end = castAt(G, t0, tag, o.cast, '被點名的人到場邊角落放，炸完立刻走出來（會留下火焰區）', '昂格士');
  const list = ALS.map((al) => G.rng.pickOne(G.ents.filter((e) => e.al === al && e.role !== 'MT')));
  buster(G, end, { tag, show: o.cast, targets: list, r: o.r, kind: 'target', spot: (e) => spots[e.al], why: '燃燒導彈打到隊友' });
  // 火焰區在炸完後一點點才生效（投放的人要立刻走出來）
  at(G, end, () => list.forEach((e) => { G.zones.push({ shape: { k: 'circle', x: e.x, y: e.y, r: o.r }, from: G.t + 1.6, until: G.t + o.fire, tag: '火焰區', why: '踩進燃燒導彈留下的火焰區（火傷）', col: 'fire' }); }));
  settle(G, end + 0.5, me);
  return end + 1;
}

/** 追蹤導彈：每隊點 1 人，黃色箭頭追著他連炸 5 次 */
/** 被追的人跑的路線（估計）：A 西側往南、C 東側往南、B 在南邊繞一圈；都要跑超過 5 秒 */
const LANES: Record<Alliance, Vec[]> = {
  A: [{ x: -14, y: -8 }, { x: -14, y: 16 }, { x: -6, y: 18.5 }],
  B: [{ x: -6, y: 5 }, { x: 6, y: 5 }, { x: 6, y: 10 }, { x: -6, y: 10 }, { x: -6, y: 6 }],
  C: [{ x: 14, y: -8 }, { x: 14, y: 16 }, { x: 6, y: 18.5 }],
};
/** 從 pts[0] 出發，依序走過每個點（到了一個點就換下一個） */
function walk(G: GameState, e: Entity, t: number, pts: Vec[]): void {
  let tt = t;
  for (let i = 1; i < pts.length; i++) {
    const q = pts[i];
    at(G, tt, () => { e.mt = { ...q }; });
    tt += Math.hypot(q.x - pts[i - 1].x, q.y - pts[i - 1].y) / RUN - 0.05;
  }
}
function chase(G: GameState, t0: number): number {
  const me = claim(G, t0), o = T.chase, tag = '追蹤導彈';
  const end = castAt(G, t0, tag, o.cast, '被點名的人一直跑，不要回人群（會連炸 5 次）', '昂格士');
  const list = ALS.map((al) => G.rng.pickOne(G.ents.filter((e) => e.al === al && e.role !== 'MT')));
  const tc = end + 1.5;
  at(G, t0, () => {
    list.forEach((e) => { e.marker = { kind: 'target', until: tc + o.n * o.gap, label: '追蹤' }; });
    const k = list.indexOf(G.player);
    if (k >= 0) G.hints = [{ ...LANES[G.player.al][0], r: 1.4, label: '從這裡開始跑' }];
  });
  // Bot：先到跑道起點，第一發前開始跑
  at(G, t0 + REACT, () => list.forEach((e) => { if (npcs(G).includes(e)) e.mt = { ...LANES[e.al][0] }; }));
  list.forEach((e) => { if (!e.isPlayer || G.auto) walk(G, e, tc - o.lag - 0.2, LANES[e.al]); });
  for (let i = 0; i < o.n; i++) {
    const th = tc + i * o.gap;
    at(G, th - o.lag, () => {
      G.hints = [];
      list.forEach((e) => { if (!e.dead) aoe(G, th, { k: 'circle', x: e.x, y: e.y, r: o.r }, { tag, show: o.lag, why: '被追蹤導彈炸到（受傷加重）', ok: null, dodge: false, col: 'orange' }); });
    });
  }
  passIf(G, tc + o.n * o.gap, tag, t0, '躲開了追蹤導彈');
  settle(G, tc + o.n * o.gap + 0.2, me);
  return tc + o.n * o.gap + 0.8;
}

/** 對地導彈：場上若干圓形 AOE */
function ground(G: GameState, t0: number): number {
  const me = claim(G, t0), o = T.ground, tag = '對地導彈';
  const end = castAt(G, t0, tag, o.cast, '地上一堆圓圈：躲開', '昂格士');
  const cs: Shape[] = Array.from({ length: o.n }, () => ({ k: 'circle', x: G.rng.rnd(-16, 16), y: G.rng.rnd(-12, 16), r: o.r }));
  aoe(G, end + 0.4, cs, { tag, show: o.cast + 0.4, why: '被對地導彈打中' });
  settle(G, end + 0.8, me);
  return end + 1.2;
}

/** 能量彈幕＋激光照射：12 座塔，中間 6 座被雷射蓋住，雷射結束才去踩 */
const TOWERS: Vec[] = [-6, 2, 10].flatMap((y) => [-12, -4, 4, 12].map((x) => ({ x, y })));
function energy(G: GameState, t0: number): number {
  const me = claim(G, t0), o = T.barrage, tag = '能量彈幕';
  const end = castAt(G, t0, tag, o.cast, '地上 12 座塔，中間 6 座被雷射蓋住：雷射結束後立刻去踩（每座塔都要有人）', '昂格士');
  const laserEnd = end + o.laser, tt = laserEnd + o.after;
  zone(G, end, { shape: { k: 'rect', O: T.boss, H: DIR.S, len: 45, w: o.hw * 2 }, until: laserEnd, tag: '激光照射', why: '站進昂格士正前方的雷射', col: 'purple' });
  const assign = (e: Entity): number => (ALS.indexOf(e.al) * 8 + ROLES.indexOf(e.role)) % 12;
  towers(G, tt, { tag, show: tt - t0, list: TOWERS.map((p) => ({ ...p, r: o.r, need: 1 })), assign });
  // Bot：中間兩排的塔先在雷射外等，雷射結束再進去
  at(G, t0 + REACT + 0.1, () => npcs(G).forEach((e) => { const p = TOWERS[assign(e)]; if (Math.abs(p.x) < o.hw) e.mt = { x: Math.sign(p.x) * (o.hw + 1.8), y: p.y }; }));
  at(G, laserEnd + 0.05, () => npcs(G).forEach((e) => { const p = TOWERS[assign(e)]; if (Math.abs(p.x) < o.hw) e.mt = { x: p.x + G.rng.rnd(-0.6, 0.6), y: p.y + G.rng.rnd(-0.6, 0.6) }; }));
  settle(G, tt + 0.4, me);
  return tt + 1;
}

/** 地形破壞攻擊：不在後半場（南）會被擊飛出場外 */
function terrain(G: GameState, t0: number): number {
  const me = claim(G, t0), o = T.terrain, tag = '地形破壞攻擊';
  at(G, t0 - 2, () => alertMsg(G, '小怪階段（能量填充）略過：各隊坦克拉好大型逆關節', 2));
  const end = castAt(G, t0, tag, o.cast, '所有人到南半場（平臺後側），會被擊飛到後方平臺', '昂格士');
  aoe(G, end, { k: 'half', x: 0, y: o.line, r: 70, a: DIR.N }, { tag, show: o.cast, why: '不在南半場，被擊飛出場外', lethal: true, ok: '在南半場，落到後方平臺' });
  at(G, end + 0.3, () => alertMsg(G, '落到後方平臺', 1.5));
  settle(G, end + 0.6, me);
  return end + 1.2;
}

/** 麥喀士啟動：左右兩側手臂移動，打橫向條狀 AOE（麥喀士突擊） */
function arms(G: GameState, t0: number): number {
  const me = claim(G, t0), o = T.arms, tag = '麥喀士突擊';
  const end = castAt(G, t0, '麥喀士啟動', o.cast, '兩側手臂往中央碾過來：看手臂的位置躲開橫條', '昂格士');
  for (let i = 0; i < o.n; i++) {
    const y = G.rng.rnd(-14, 14), t = end + 0.5 + i * o.gap;
    aoe(G, t, { k: 'rect', O: { x: -T.half, y }, H: DIR.E, len: T.half * 2, w: o.h }, { tag, show: o.show, why: '被麥喀士手臂碾過（受傷加重）', ok: i === o.n - 1 ? '躲開三次手臂' : null });
  }
  const last = end + 0.5 + (o.n - 1) * o.gap;
  settle(G, last + 0.4, me);
  return last + 1;
}

/** 擴散燃燒導彈：後半場被火焰封鎖 */
function scatter(G: GameState, t0: number): number {
  const o = T.scatter, tag = '擴散燃燒導彈';
  const end = castAt(G, t0, tag, o.cast, '後半場（南）變成火焰區：留在北半場', '昂格士');
  zone(G, end, { shape: { k: 'half', x: 0, y: 4, r: 70, a: DIR.S }, until: end + o.dur, tag, why: '踩進後半場的火焰區（火傷）', col: 'fire' });
  return end + 0.5;
}

const RAND_SMASH = (G: GameState): SmashKind => G.rng.pickOne<SmashKind>(['L', 'R', 'raise', 'spread']);

/** 估計的完整時間軸 */
function fullSeg(G: GameState, t0: number): number {
  let t = t0;
  t = smash(G, t, 'raise') + 1.5;
  t = homing(G, t) + 1.5;
  t = burn(G, t) + 1.5;
  t = chase(G, t) + 1.5;
  t = ground(G, t) + 1.5;
  t = smash(G, t, 'spread') + 1.5;
  t = raidwide(G, t, '擴散射線', 4.5, undefined, '昂格士') + 1.5;
  t = energy(G, t) + 1.5;
  t = smash(G, t, RAND_SMASH(G)) + 3;
  t = terrain(G, t) + 1.5;
  t = arms(G, t) + 1.5;
  t = scatter(G, t);
  t = smash(G, t + 1, G.rng.pickOne<SmashKind>(['L', 'R'])) + 1.5;
  t = ground(G, t) + 1.5;
  at(G, t, () => alertMsg(G, '導彈亂射：燃燒 → 對地 → 追蹤', 2));
  t = burn(G, t + 1) + 1;
  t = ground(G, t) + 1;
  t = chase(G, t) + 1.5;
  return smash(G, t, RAND_SMASH(G));
}

const ALL = ['麥喀士打擊', '高性能跟蹤導彈', '燃燒導彈', '追蹤導彈', '對地導彈', '擴散射線', '能量彈幕', '能量填充', '地形破壞攻擊', '麥喀士啟動', '擴散燃燒導彈', '導彈亂射', '麥喀士夾擊'];

export const engels: Encounter = {
  id: 'eng',
  name: '昂格士',
  sub: '第三王・看手臂',
  arena: squareArena(T.half, 'wall'),
  bosses: [{ id: 'eng', name: '昂格士', x: T.boss.x, y: T.boss.y, face: Math.PI, r: 5 }],
  home,
  startFace: 0,
  info: {
    麥喀士打擊: { effect: '三種攻擊方式，打中疊受傷加重：<b>單手</b>＝打舉起手臂的半場（傷害極高）；<b>高舉</b>＝先打後半場（比後半場線再前面幾公尺）、再打兩側；<b>展開</b>＝先打前半場、再打中央。', tell: '看王的手臂：<b>舉單手</b>／<b>身體前傾高舉雙手</b>（高舉）／<b>身體後仰張開雙手</b>（展開）。前搖結束時眼睛紅光閃爍、有機械聲；沒有地面預兆。', how: '單手 → 往<b>沒抬手的那側</b>躲。高舉 → 站<b>前方中間</b>。展開 → 站<b>後方兩側</b>。（攻略：雙手第一次必為情況①、第二次為情況②，之後隨機）' },
    高性能跟蹤導彈: { effect: '點名三隊坦克，高傷害圓形 AOE。', tell: '坦克身上出現紅色圓環。', how: '坦克各自離開人群、開減傷。' },
    燃燒導彈: { effect: '每隊點 1 人放圓形 AOE，並在範圍留下火焰區（站進去疊火傷，離開就解除）。', tell: '被點名的人頭上出現標記。', how: '被點的人到場邊角落放，不要放在人群裡；之後別踩火焰區。' },
    追蹤導彈: { effect: '每隊點 1 人，黃色箭頭追蹤 AOE，顯示黃圈後開始追，共 5 次；打中疊受傷加重。', tell: '黃色箭頭追著尾巴的點名。', how: '被點的人<b>一直跑、不要急著回人群</b>（會連炸好幾次）。' },
    對地導彈: { effect: '在場上生成若干圓形 AOE。', tell: '地上出現多個圓形預兆。', how: '躲開。' },
    擴散射線: { effect: '全場 AOE。', tell: '昂格士詠唱「擴散射線」。', how: '不用走位。' },
    能量彈幕: { effect: '場上 12 座塔，判定時每座至少 1 人；踩塔的人受小傷害（能量霧散），漏踩全場高傷害（能量炸裂）並疊受傷加重。同時昂格士對前方持續放直線雷射（激光照射），蓋住中間 6 座塔。', tell: '昂格士胸口出現雷射蓄力，地上出現 12 座塔。', how: '等<b>雷射結束後立刻去踩</b>中間的塔；每座塔都要有人。' },
    能量填充: { effect: '昂格士無法選中，召喚三隻大型逆關節與九隻小型二足；2P 會用彈幕轟掉小型二足並打大型逆關節約 30% 血。進度條滿前沒打倒全部大型逆關節就全滅。', tell: '台詞「開始充能……」。', how: '各隊坦克把大型逆關節拉好、<b>面向場外</b>（腕部雷射是正面扇形）；兩隻大型逆關節靠近會連線減傷，分開拉。（模擬器略過）' },
    地形破壞攻擊: { effect: '中央距離衰減 AOE，把所有人擊飛到空中：在平臺後側區域會落到後方平臺，否則被擊飛出場外。', tell: '小怪階段結束後昂格士詠唱。', how: '所有人<b>到南半場集合</b>（不在南半場基本上必死）。' },
    麥喀士啟動: { effect: '場地左右兩側的麥喀士手臂啟動，移動並施放橫向條狀 AOE（麥喀士突擊），打中疊受傷加重；新平臺開場碾 3 次。', tell: '兩側手臂出現並移動。', how: '觀察手臂位置，躲開橫條。' },
    擴散燃燒導彈: { effect: '後半場被火焰區域封鎖，踩進去疊火傷。', tell: '昂格士詠唱，後半場出現火焰。', how: '留在前半場（北）。' },
    導彈亂射: { effect: '依序放燃燒導彈 → 對地導彈 → 追蹤導彈。', tell: '昂格士詠唱「導彈亂射」。', how: '照順序處理三種導彈。' },
    麥喀士夾擊: { effect: '前半場左右出現小塊 AOE，昂格士無法選中、左右臂（麥喀士左／右）可選中並詠唱碾輪夾擊；每次讀條結束更靠近中心並放全場 AOE，讀條完成前沒打倒就強制秒殺。', tell: '左右臂出現在前半場的 AOE 上。', how: 'DPS 檢查：打倒麥喀士左與麥喀士右。（模擬器略過）' },
  },
  drills: {
    full: drill({ tl: true, name: '完整時間軸', sub: '順序為估計', brief: flowHtml(['麥喀士打擊（高舉）', '高性能跟蹤導彈', '燃燒導彈', '追蹤導彈', '對地導彈', '麥喀士打擊（展開）', '擴散射線', '能量彈幕＋激光照射', '麥喀士打擊', '（能量填充：略過）', '地形破壞攻擊 → 後方平臺', '麥喀士啟動', '擴散燃燒導彈', '導彈亂射', '麥喀士打擊']) + '<p class="bnote">wiki 與攻略都沒有寫完整順序；高舉／展開哪個是攻略說的「情況①」也待確認。</p>', info: ALL, seg: fullSeg }),
    smash: drill({ name: '麥喀士打擊', sub: '看手臂', brief: '', info: ['麥喀士打擊'], mechs: ['麥喀士打擊'], seg: (G, t0) => smash(G, t0, variant<SmashKind>(G, 'smash', RAND_SMASH(G))) }),
    missiles: drill({ name: '導彈', sub: '跟蹤・燃燒・追蹤・對地', brief: flowHtml(['高性能跟蹤導彈（坦克）', '燃燒導彈', '追蹤導彈', '對地導彈']), info: ['高性能跟蹤導彈', '燃燒導彈', '追蹤導彈', '對地導彈'], mechs: ['高性能跟蹤導彈', '燃燒導彈', '追蹤導彈', '對地導彈'],
      steps: [['跟蹤（坦克）', '高性能跟蹤導彈'], ['燃燒', '燃燒導彈'], ['追蹤', '追蹤導彈'], ['對地', '對地導彈']],
      seg(G, t0) { let t = homing(G, t0) + 1; t = burn(G, t) + 1; t = chase(G, t) + 1; return ground(G, t); } }),
    energy: drill({ name: '能量彈幕', sub: '12 座塔＋雷射', brief: '', info: ['能量彈幕'], mechs: ['能量彈幕'], seg: energy }),
    terrain: drill({ name: '地形破壞＋麥喀士啟動', sub: '到南半場、躲手臂', brief: '', info: ['地形破壞攻擊', '麥喀士啟動'], mechs: ['地形破壞攻擊', '麥喀士突擊'], seg(G, t0) { return arms(G, terrain(G, t0 + 2) + 1); } }),
  },
  variants: {
    smash: [{ key: 'smash', label: '動作', opts: (['L', 'R', 'raise', 'spread'] as SmashKind[]).map((k) => ({ value: k, label: { L: '舉左手', R: '舉右手', raise: '高舉', spread: '展開' }[k], tell: { L: '王舉起左手（畫面東側）', R: '王舉起右手（畫面西側）', raise: '身體前傾、雙手高舉', spread: '身體後仰、張開雙手' }[k], how: SMASH_TIP[k].split('：')[1] ?? SMASH_TIP[k] })) }],
  },
  draw(c, G, layer) {
    if (layer !== 'top') return;
    const p = (G.x.eng as EngState | undefined)?.pose;
    if (!p || G.t > p.until) return;
    const b = G.bosses[0];
    if (!b || b.id !== 'eng') return;
    // 王的手臂：舉起＝金色往北伸、放下＝灰色往南；高舉＝雙手往北、展開＝雙手往兩側張開
    const arm = (s: number, up: boolean, wide = false): void => {
      c.save(); c.strokeStyle = up ? '#ffd36b' : '#8f8870'; c.lineWidth = px(7); c.lineCap = 'round';
      const ex = b.x + s * (wide ? 10 : 6.5), ey = b.y + (wide ? 0.5 : up ? -6 : 5);
      c.beginPath(); c.moveTo(b.x + s * 3.5, b.y); c.quadraticCurveTo(b.x + s * 7, b.y, ex, ey); c.stroke();
      c.fillStyle = up ? '#ffd36b' : '#8f8870'; c.beginPath(); c.arc(ex, ey, 1.2, 0, Math.PI * 2); c.fill(); c.restore();
    };
    // 王面南：左手在畫面東側（s = +1）
    if (p.k === 'L') { arm(1, true); arm(-1, false); } else if (p.k === 'R') { arm(-1, true); arm(1, false); }
    else if (p.k === 'raise') { arm(1, true); arm(-1, true); } else { arm(1, false, true); arm(-1, false, true); }
    if (G.enc.id === 'eng') text(c, { L: '舉左手', R: '舉右手', raise: '高舉（前傾）', spread: '展開（後仰）' }[p.k], b.x, b.y - 7.5, 13, '#ffd36b');
  },
  loot: {
    currency: [[TOMES.詩學, 30], [TOMES.數理, 30]],
    items: [...yorha('身體', '軍裝'), ...yorha('腳部', '軍靴')],
  },
};
