// 使用者設定（存 localStorage）
import { store } from './storage';
import type { Alliance, Role } from './constants';

/** 練習方式：單一王（時間軸或單一機制）／整個副本連續打／隨機練習 */
export type PickMode = 'one' | 'cont' | 'rand';
export type ActType = 'sprint' | 'akb' | 'dash' | 'interject';
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
  acts: ActionConfig[];
  /** 玩家操控的角色：介面不給選（坦補 D 的差別寫在機制說明），固定 A 隊 DPS；測試與除錯網址可以改 */
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

export const MAX_ACTS = 8;

export const DEFAULT_ACTS: readonly ActionConfig[] = [
  { name: '疾跑', type: 'sprint', code: 'Digit1', label: '1', dist: 0, dur: 10, cd: 60 },
  { name: '防擊退', type: 'akb', code: 'Digit2', label: '2', dist: 0, dur: 6, cd: 120 },
  { name: '前衝', type: 'dash', dir: 'fwd', code: 'Digit3', label: '3', dist: 15, dur: 0, cd: 30 },
  { name: '後跳', type: 'dash', dir: 'back', code: 'Digit4', label: '4', dist: 10, dur: 0, cd: 30 },
];

export const cloneActs = (a: readonly ActionConfig[]): ActionConfig[] => JSON.parse(JSON.stringify(a));

export function defaultConfig(): Config {
  return {
    auto: true, speed: 1, hint: true, text: true, failMode: 'stop', cdReset: true, cam: 'fixed', zoom: 'mid', big: false, hideSides: false, sound: true,
    acts: cloneActs(DEFAULT_ACTS), al: 'A', role: 'D1', drill: '', raid: '', enc: '', pick: 'one', rand: { repeat: true, mins: 3, ids: [] },
  };
}

export function loadConfig(): Config {
  const d = defaultConfig();
  const c = {} as Record<string, unknown>;
  (Object.keys(d) as (keyof Config)[]).forEach((k) => { c[k] = store.get(k, d[k]); });
  const cfg = c as unknown as Config;
  // 舊版截圖網址可能把速度存成 0：讀到不合理的值就用預設
  if (!(typeof cfg.speed === 'number' && cfg.speed > 0)) cfg.speed = d.speed;
  if (!Array.isArray(cfg.acts)) cfg.acts = d.acts;
  // 舊版可以選隊伍、職能：存的座位不再沿用
  cfg.al = d.al; cfg.role = d.role;
  return cfg;
}

export function saveConfig(cfg: Config): void {
  (Object.keys(cfg) as (keyof Config)[]).forEach((k) => store.set(k, cfg[k]));
}
