// 副本與王的資料格式。每個副本一個資料夾（src/raids/<副本>/），每個王匯出一個 Encounter。
import type { Alliance, Role, Vec } from '../core/constants';
import type { Arena } from '../core/arena';
import type { BossEnt, Drill, GameState, RenderState } from '../game/state';

/** 裝備部位（掉落物整理用；順序就是畫面上的順序） */
export const SLOTS = ['頭部', '身體', '手部', '腿部', '腳部', '武器', '飾品'] as const;
export type Slot = (typeof SLOTS)[number];
/** 一件掉落：部位裝備（gear）或其他（寵物、幻卡、樂譜、兌換道具…） */
export interface LootItem { name: string; slot?: Slot; kind?: string; note?: string }
export interface Loot {
  /** 通關獎勵的貨幣（神典石等）：名稱、數量 */
  currency?: [string, number][];
  items: LootItem[];
}

/** 機制說明：效果 → 預兆 → 應對（說明卡、機制提示卡、失誤分析、教學頁都從這裡取） */
export interface MechInfo {
  /** 機制效果：這招會做什麼 */
  effect: string;
  /** 預兆：看什麼來判斷（動作、特效、台詞、點名標記） */
  tell: string;
  /** 應對方式（攻略處理） */
  how: string;
}

/** 有多種樣式的機制：教學頁可以指定樣式播放（state.ts 的 variant） */
export interface VariantOpt { value: string; label: string; tell: string; how: string }
export interface VariantGroup { key: string; label: string; opts: VariantOpt[] }

export type BossDef = Omit<BossEnt, 'px' | 'py' | 'pface' | 'mv'>;

export interface Encounter {
  /** 在副本內唯一（練習項目 key 用） */
  id: string;
  name: string;
  /** 一句話說明（王的別名、在副本第幾關） */
  sub: string;
  arena: Arena;
  bosses: BossDef[];
  /** 開場面向（預設面北） */
  startFace?: number;
  /** 原位（機制之間待命的位置） */
  home(al: Alliance, role: Role): Vec;
  /** 場地標點（A B C D 1 2 3 4） */
  waymarks?: Record<string, Vec>;
  /** 機制說明（key 是機制名稱） */
  info: Record<string, MechInfo>;
  /** 練習項目：時間軸（tl: true）在前、單一機制在後；key 在這個王內唯一 */
  drills: Record<string, Drill>;
  /** 練習項目 key → 可以選的樣式 */
  variants?: Record<string, VariantGroup[]>;
  /** 進場時（開局或隨機練習換到這個王）：例如把不在這個平臺的隊伍設成 away */
  onEnter?(G: GameState): void;
  /** 掉落物（依副本資料） */
  loot?: Loot;
  /** 額外繪製（場地圖案、王的手勢等）；floor 畫在預兆底下、top 畫在角色上面 */
  draw?(c: CanvasRenderingContext2D, G: RenderState, layer: 'floor' | 'top'): void;
  /** 座位說明（顯示在職能旁邊） */
  seatText?(al: Alliance, role: Role): string;
  /** 練習項目跟座位無關的話回傳原因（按鈕變淡） */
  unrelated?(drill: string, al: Alliance, role: Role): string | null;
}

export interface Source { label: string; url: string }

export interface Raid {
  id: string;
  /** 例：複製工廠廢墟 */
  name: string;
  /** 例：尼爾 1 */
  short: string;
  encounters: Encounter[];
  sources: Source[];
  /** 副本說明（顯示在王還沒做好的時候） */
  note?: string;
}
