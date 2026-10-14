// 遊戲狀態型別、建立新局與機制檔共用的小工具
import { ALS, ROLES, type Alliance, type Role, type Vec } from '../core/constants';
import type { Arena } from '../core/arena';
import type { Shape } from '../core/shapes';
import type { Config } from '../core/config';
import type { Rng } from '../core/rng';
import type { Encounter } from '../raids/types';
import { Scheduler } from './scheduler';

export interface Buffs { sprint?: number; akb?: number; heavy?: number }
/** 頭上／狀態列的增減益（機制自己加的，例如「出血」「點名」） */
export interface Status { id: string; name: string; glyph: string; until: number; kind: 'buff' | 'debuff' }
export interface Forced { vx: number; vy: number; left: number }
/** 頭上標記：分攤、分散、死刑、點名、數字 */
export type MarkerKind = 'stack' | 'spread' | 'tb' | 'target' | 'num';
export interface Marker { kind: MarkerKind; until: number; label?: string; r?: number }

export interface Entity {
  al: Alliance;
  role: Role;
  isPlayer: boolean;
  x: number;
  y: number;
  face: number;
  /** 主要移動目標 */
  mt: Vec | null;
  /** 覆蓋目標（優先於 mt），例如臨時躲 AOE */
  ov: Vec | null;
  /** 臨時躲避（ov）到幾秒為止 */
  ovUntil?: number;
  faceLock: number | null;
  forced: Forced | null;
  buffs: Buffs;
  statuses: Status[];
  marker?: Marker;
  /** 眩暈／石化等不能動到幾秒 */
  stun: number;
  stunKind?: 'stun' | 'stone' | 'fear' | 'bind';
  dead: boolean;
  /** 不在這個場地上（例如霍布斯各隊在不同平臺：只模擬自己那隊）：不畫、不動、不判定 */
  away?: boolean;
  /** 上一個模擬步的位置與面向（渲染插值用） */
  px: number;
  py: number;
  pface: number;
  fellAt?: number;
  /** 最後一次被地面區域（火焰、帶電）傷到的時間（避免每一步都記失誤） */
  zoneAt?: number;
}

/** 持續性地面區域：火焰區、帶電區等，站進去就受傷（from～until 之間有效） */
export interface Zone { shape: Shape; from: number; until: number; tag: string; why: string; col?: 'fire' | 'elec' | 'purple'; lethal?: boolean }

/** 王（可以有好幾隻，例如雙王） */
export interface BossEnt {
  id: string;
  name: string;
  x: number;
  y: number;
  face: number;
  /** 目標圈半徑（畫圖用） */
  r: number;
  col?: string;
  hidden?: boolean;
  px: number;
  py: number;
  pface: number;
  /** 移動中：從 (fx,fy) 在 t0～t1 移到 (tx,ty) */
  mv?: { fx: number; fy: number; tx: number; ty: number; t0: number; t1: number };
}

/** 地面預兆：形狀＋判定時間；col 預設橘色 */
export type Telegraph = Shape & { until: number; start?: number; col?: 'orange' | 'blue' | 'purple' };

/** 場上物件（塔、球、標點等） */
export type FieldObj =
  | { k: 'tower'; x: number; y: number; r: number; need: number; until: number; label?: string }
  | { k: 'orb'; x: number; y: number; r: number; col: string; until: number; label?: string };

export type Effect =
  | { k: 'flash'; until: number }
  | { k: 'hit'; x: number; y: number; until: number }
  /** 預兆判定瞬間的爆發特效 */
  | { k: 'burst'; tele: Telegraph; start: number; until: number }
  | { k: 'kb' | 'pull'; x: number; y: number; until: number }
  | { k: 'stack'; x: number; y: number; r: number; until: number }
  /** 連線：從王（boss id）或某個點連到角色 */
  | { k: 'tether'; from: string | Vec; to: Entity; until: number; col?: string }
  /** 視線（背對）：從來源畫到每個人 */
  | { k: 'gaze'; src: Vec; until: number };

/** 正確處理方式（回放時標出）：位置、可選的正確面向 */
export interface Fix { x: number; y: number; r?: number; face?: number; label: string }
/** from：要「從此機制開始」練時的起點秒數 */
export interface Check { t: number; tag: string; ok: boolean; warn?: boolean; text: string; fix?: Fix; from?: number }
export interface Hint { x: number; y: number; r?: number; label?: string }
/** Bot（非玩家）違反規則被打中的紀錄：自動測試要求為 0 */
export interface BotFail { t: number; tag: string; who: string; why: string }
export type Sfx = 'cast' | 'hit' | 'ok' | 'ng' | 'alert';
/** tip：詠唱條下方的處理提示；who：誰在詠唱（雙王時用） */
export interface Cast { name: string; start: number; dur: number; tip?: string; who?: string }
export interface TimedText { text: string; until: number; danger?: boolean; who?: string }
export interface SeqItem { t: number; label: string }

/** ready＝等玩家按「開始」；count＝倒數；run＝進行中；end＝結束 */
export type Phase = 'ready' | 'count' | 'run' | 'end';

export interface GameState {
  t: number;
  state: Phase;
  countT: number;
  ents: Entity[];
  player: Entity;
  ev: Scheduler;
  tele: Telegraph[];
  fx: Effect[];
  objs: FieldObj[];
  zones: Zone[];
  bosses: BossEnt[];
  /** 目前的王（場地、原位、說明都從這裡取；隨機練習會中途換） */
  enc: Encounter;
  arena: Arena;
  cast: Cast | null;
  line: TimedText | null;
  alert: TimedText | null;
  toasts: TimedText[];
  /** 示範模式：Bot 代打玩家 */
  auto: boolean;
  checks: Check[];
  fails: string[];
  endT: number;
  hints: Hint[];
  paused: boolean;
  /** 技能冷卻結束時間（依技能列索引） */
  cds: Record<number, number>;
  /** 時間軸（多個機制連在一起） */
  tl: boolean;
  seq: SeqItem[];
  /** 指定機制樣式（教學頁用，例如 { dir: 'east' }）；沒指定的照亂數 */
  pick?: Record<string, string>;
  ff: boolean;
  /** 目前「擁有」Bot 回原位權的機制 */
  active?: object;
  result?: { ok: boolean };
  cfg: Config;
  rng: Rng;
  /** 待播放的音效（UI 每幀取走） */
  sfx: Sfx[];
  botFails: BotFail[];
  /** 從時間軸的某個機制開始練：之前的部分已快轉 */
  startAt: number;
  /** 本局每個機制目前處理情形（給失誤統計）：tag → 有沒有失誤 */
  mech: Record<string, boolean>;
  /** 最後一次用插言（打斷）的時間 */
  lastInterject?: number;
  /** 錯誤即停：讓這局停下來的那個失誤 */
  stopCheck?: Check;
  /** 各王自己的狀態（機制檔自己定義形狀，用 encData 取） */
  x: Record<string, unknown>;
}

/** 渲染只需要的部分狀態（回放時用錄下來的影格組出同樣的形狀） */
export type RenderState = Pick<GameState, 't' | 'ents' | 'player' | 'tele' | 'fx' | 'objs' | 'zones' | 'bosses' | 'enc' | 'arena' | 'hints' | 'cast' | 'x'>;

export interface Drill {
  /** 時間軸（多個機制）；false＝單一機制 */
  tl?: boolean;
  name: string;
  sub: string;
  brief: string;
  /** 說明卡「機制說明」要列的機制（Encounter.info 的名稱） */
  info?: string[];
  /** 失誤統計裡對應的機制名稱（弱點練習用） */
  mechs?: string[];
  /** 教學頁「看哪個機制」：[按鈕文字, 時間軸項目要包含的文字] */
  steps?: [string, string][];
  /** 從 t0 開始排一次，回傳可以接下一段的時間 */
  seg(G: GameState, t0: number): number;
  setup(G: GameState): void;
}

export function mkEnt(enc: Encounter, al: Alliance, role: Role, isPlayer: boolean): Entity {
  const h = enc.home(al, role);
  return { al, role, isPlayer, x: h.x, y: h.y, face: enc.startFace ?? 0, mt: { ...h }, ov: null, faceLock: null, forced: null, buffs: {}, statuses: [], stun: 0, dead: false, px: h.x, py: h.y, pface: enc.startFace ?? 0 };
}

export const freshBosses = (enc: Encounter): BossEnt[] => enc.bosses.map((b) => ({ ...b, px: b.x, py: b.y, pface: b.face, mv: undefined }));

export function createState(cfg: Config, auto: boolean, rng: Rng, enc: Encounter, tl: boolean): GameState {
  const ents: Entity[] = [];
  ALS.forEach((al) => ROLES.forEach((role) => ents.push(mkEnt(enc, al, role, al === cfg.al && role === cfg.role))));
  const G: GameState = {
    t: 0, state: auto ? 'count' : 'ready', countT: 3, ents, player: ents.find((e) => e.isPlayer)!, ev: new Scheduler(), tele: [], fx: [], objs: [], zones: [],
    bosses: freshBosses(enc), enc, arena: enc.arena, cast: null, line: null, alert: null, toasts: [],
    auto: !!auto, checks: [], fails: [], endT: 9999, hints: [], paused: false, cds: {}, tl, seq: [], ff: false,
    cfg, rng, sfx: [], botFails: [], startAt: 0, mech: {}, x: {},
  };
  enc.onEnter?.(G);
  return G;
}

/** 在這個場地上、還活著的人 */
export const present = (G: GameState): Entity[] => G.ents.filter((e) => !e.dead && !e.away);
/** 同隊（同一個小隊）的人 */
export const partyOf = (G: GameState, e: Entity): Entity[] => G.ents.filter((x) => x.al === e.al && !x.dead && !x.away);

// ---- 狀態小工具（機制檔共用） ----
export const at = (G: GameState, t: number, fn: () => void): void => G.ev.at(t, fn);

/**
 * 機制樣式：rolled 是照亂數抽出的樣式；教學頁指定了 G.pick[key] 就改用指定的。
 * 一定先抽亂數再覆蓋，亂數的使用順序不變（同種子仍是同一局）。
 */
export const variant = <T extends string>(G: GameState, key: string, rolled: T): T => (G.pick?.[key] as T | undefined) ?? rolled;
export const bossName = (G: GameState, id?: string): string => (id ? G.bosses.find((b) => b.id === id)?.name : G.bosses[0]?.name) ?? '';
export const setCast = (G: GameState, name: string, dur: number, tip?: string, who?: string): void => { G.cast = { name, start: G.t, dur, tip, who: who ?? bossName(G) }; G.sfx.push('cast'); };
export const say = (G: GameState, text: string, dur = 4, who?: string): void => { G.line = { text, until: G.t + dur, who: who ?? bossName(G) }; };
export const alertMsg = (G: GameState, text: string, dur = 2, danger?: boolean): void => {
  G.alert = { text, until: G.t + dur, danger };
  if (danger) G.sfx.push('alert');
};
export const hasBuff = (G: GameState, e: Entity, k: keyof Buffs): boolean => (e.buffs[k] || 0) > G.t;
export const seqAdd = (G: GameState, t: number, label: string): void => { G.seq.push({ t, label }); };
/** 強制位移：time 秒內往 (vx,vy) 方向移動 d 公尺 */
export function force(e: Entity, vx: number, vy: number, d: number, time: number): void {
  e.forced = { vx: (vx * d) / time, vy: (vy * d) / time, left: time };
}
export function addStatus(e: Entity, s: Status): void {
  e.statuses = e.statuses.filter((x) => x.id !== s.id).concat(s);
}
export const hasStatus = (G: GameState, e: Entity, id: string): boolean => e.statuses.some((s) => s.id === id && s.until > G.t);
export const bossById = (G: GameState, id?: string): BossEnt => (id ? G.bosses.find((b) => b.id === id) : undefined) ?? G.bosses[0];
/** 王在 dur 秒內移到 to */
export function moveBoss(G: GameState, id: string, to: Vec, dur: number): void {
  const b = bossById(G, id);
  b.mv = { fx: b.x, fy: b.y, tx: to.x, ty: to.y, t0: G.t, t1: G.t + Math.max(0.01, dur) };
}
/** 各王自己的狀態：第一次取時用 init 建立 */
export function encData<T extends object>(G: GameState, key: string, init: () => T): T {
  return (G.x[key] ??= init()) as T;
}
