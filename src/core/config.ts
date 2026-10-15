// 使用者設定（存 localStorage）
import { store } from './storage';
import { ALS, roleType, type Alliance, type Role, type RoleType } from './constants';

/** 練習方式：單一王（時間軸或單一機制）／整個副本連續打／隨機練習 */
export type PickMode = 'one' | 'cont' | 'rand';
/**
 * 技能類型：通用（疾跑、防擊退、位移）＋職能技能
 *   坦：provoke 挑釁、mit 減傷、interject 打斷　補：shield 單盾（給自己隊的坦克）、aoeHeal 群補、aoeShield 群盾　D：raidMit 團隊減傷
 */
export type ActType = 'sprint' | 'akb' | 'dash' | 'interject' | 'provoke' | 'mit' | 'shield' | 'aoeHeal' | 'aoeShield' | 'raidMit';
export type DashDir = 'fwd' | 'back' | 'left' | 'right';

export interface ActionConfig {
  name: string;
  type: ActType;
  dir?: DashDir;
  /** KeyboardEvent.code */
  code: string;
  /** 顯示在按鈕上的按鍵名 */
  label: string;
  /** 位移距離 m */
  dist: number;
  /** 持續秒數 */
  dur: number;
  /** 冷卻秒數 */
  cd: number;
}

export interface Config {
  /** 移動時自動面向移動方向 */
  auto: boolean;
  speed: number;
  hint: boolean;
  text: boolean;
  /** 錯誤即停（犯錯立刻停下分析）／錯誤不停（打完整段，陣亡也繼續） */
  failMode: 'stop' | 'continue';
  cdReset: boolean;
  /** 鏡頭：固定北在上／跟隨角色並放大 */
  cam: 'fixed' | 'follow';
  zoom: 'near' | 'mid' | 'far';
  /** 大遊戲畫面：舞台佔滿整個寬度，說明欄移到下面 */
  big: boolean;
  /** 收起兩側的說明欄 */
  hideSides: boolean;
  sound: boolean;
  /** 目前職能的技能列（＝roleActs[目前職能]，換職能時由 syncActs 換掉） */
  acts: ActionConfig[];
  /** 三種職能各自的技能列（改鍵、改類型都存在這裡） */
  roleActs: Record<RoleType, ActionConfig[]>;
  /** 玩家操控的角色：隊伍 A／B／C，職能只選坦／補／D（MT、H1、D1）；測試與除錯網址可以改成其他座位 */
  al: Alliance;
  role: Role;
  /** 目前的練習項目 key（見 drills/index.ts） */
  drill: string;
  /** 上方選的副本、王（切換練習方式時沿用） */
  raid: string;
  enc: string;
  pick: PickMode;
  /** 隨機練習：可否重複、分鐘數、選的機制（空＝全部） */
  rand: { repeat: boolean; mins: number; ids: string[] };
}

export const MAX_ACTS = 10;

const key = (n: number): Pick<ActionConfig, 'code' | 'label'> => ({ code: `Digit${n}`, label: String(n) });

/** 各職能預設技能列（冷卻、持續秒數是估計：一個死刑／全場 AOE 都來得及用一次） */
export const DEFAULT_ROLE_ACTS: Readonly<Record<RoleType, readonly ActionConfig[]>> = {
  tank: [
    { name: '挑釁', type: 'provoke', ...key(1), dist: 0, dur: 0, cd: 30 },
    { name: '減傷', type: 'mit', ...key(2), dist: 0, dur: 10, cd: 25 },
    { name: '打斷', type: 'interject', ...key(3), dist: 0, dur: 0, cd: 30 },
    { name: '疾跑', type: 'sprint', ...key(4), dist: 0, dur: 10, cd: 60 },
    { name: '防擊退', type: 'akb', ...key(5), dist: 0, dur: 6, cd: 120 },
    { name: '前衝', type: 'dash', dir: 'fwd', ...key(6), dist: 15, dur: 0, cd: 30 },
  ],
  heal: [
    { name: '單盾', type: 'shield', ...key(1), dist: 0, dur: 15, cd: 2.5 },
    { name: '群補', type: 'aoeHeal', ...key(2), dist: 0, dur: 0, cd: 2.5 },
    { name: '群盾', type: 'aoeShield', ...key(3), dist: 0, dur: 15, cd: 30 },
    { name: '疾跑', type: 'sprint', ...key(4), dist: 0, dur: 10, cd: 60 },
    { name: '防擊退', type: 'akb', ...key(5), dist: 0, dur: 6, cd: 120 },
    { name: '後跳', type: 'dash', dir: 'back', ...key(6), dist: 10, dur: 0, cd: 30 },
  ],
  dps: [
    { name: '團隊減傷', type: 'raidMit', ...key(1), dist: 0, dur: 15, cd: 60 },
    { name: '疾跑', type: 'sprint', ...key(2), dist: 0, dur: 10, cd: 60 },
    { name: '防擊退', type: 'akb', ...key(3), dist: 0, dur: 6, cd: 120 },
    { name: '前衝', type: 'dash', dir: 'fwd', ...key(4), dist: 15, dur: 0, cd: 30 },
    { name: '後跳', type: 'dash', dir: 'back', ...key(5), dist: 10, dur: 0, cd: 30 },
  ],
};
/** 舊版只有一組技能列（DPS 那組沒有職能技能的版本）；設定裡的「還原預設」用目前職能的預設 */
export const DEFAULT_ACTS = DEFAULT_ROLE_ACTS.dps;

const defaultRoleActs = (): Record<RoleType, ActionConfig[]> =>
  ({ tank: cloneActs(DEFAULT_ROLE_ACTS.tank), heal: cloneActs(DEFAULT_ROLE_ACTS.heal), dps: cloneActs(DEFAULT_ROLE_ACTS.dps) });

/** cfg.acts 換成目前職能的技能列 */
export function syncActs(cfg: Config): void {
  cfg.acts = cfg.roleActs[roleType(cfg.role)];
}

export const cloneActs = (a: readonly ActionConfig[]): ActionConfig[] => JSON.parse(JSON.stringify(a));

export function defaultConfig(): Config {
  const cfg: Config = {
    auto: true, speed: 1, hint: true, text: true, failMode: 'stop', cdReset: true, cam: 'fixed', zoom: 'mid', big: false, hideSides: false, sound: true,
    acts: [], roleActs: defaultRoleActs(), al: 'A', role: 'D1', drill: '', raid: '', enc: '', pick: 'one', rand: { repeat: true, mins: 3, ids: [] },
  };
  syncActs(cfg);
  return cfg;
}

export function loadConfig(): Config {
  const d = defaultConfig();
  const c = {} as Record<string, unknown>;
  (Object.keys(d) as (keyof Config)[]).forEach((k) => { c[k] = store.get(k, d[k]); });
  const cfg = c as unknown as Config;
  // 舊版截圖網址可能把速度存成 0：讀到不合理的值就用預設
  if (!(typeof cfg.speed === 'number' && cfg.speed > 0)) cfg.speed = d.speed;
  const ra = cfg.roleActs as Partial<Record<RoleType, unknown>> | undefined;
  cfg.roleActs = d.roleActs;
  (['tank', 'heal', 'dps'] as const).forEach((k) => { if (Array.isArray(ra?.[k])) cfg.roleActs[k] = ra[k] as ActionConfig[]; });
  if (!ALS.includes(cfg.al)) cfg.al = d.al;
  // 舊版可以選 8 個座位：換成同職能的 MT／H1／D1
  cfg.role = cfg.role === 'MT' ? 'MT' : typeof cfg.role === 'string' && cfg.role[0] === 'H' ? 'H1' : 'D1';
  syncActs(cfg);
  return cfg;
}

export function saveConfig(cfg: Config): void {
  // acts 只是 roleActs 其中一組的別名，不另外存
  (Object.keys(cfg) as (keyof Config)[]).forEach((k) => { if (k !== 'acts') store.set(k, cfg[k]); });
}
