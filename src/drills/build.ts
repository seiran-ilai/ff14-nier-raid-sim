// 組練習項目的小工具，以及機制說明的 HTML
import type { Drill } from '../game/state';
import { at } from '../game/state';
import type { MechInfo } from '../raids/types';

/** 用 seg 組出一個練習：start 秒開始，結束後 tail 秒收尾 */
export function drill(d: Omit<Drill, 'setup'>, start = 1, tail = 1): Drill {
  return { ...d, setup(G) { const end = d.seg(G, start); at(G, end + tail, () => { G.endT = G.t; }); } };
}

/** 流程清單：A → B → C 排成編號列表 */
export const flowHtml = (steps: string[]): string => `<ol class="flow">${steps.map((s) => `<li>${s}</li>`).join('')}</ol>`;

const FIELD: [keyof MechInfo, string][] = [['effect', '效果'], ['tell', '預兆'], ['how', '應對'], ['tank', '坦'], ['heal', '補'], ['dps', 'D']];
const ALL_FIELDS = FIELD.map(([k]) => k);

/** 效果／預兆／應對＋坦補 D 注意事項的欄位表（fields 省略＝全部；沒寫的欄位不顯示） */
export const mechDl = (m: MechInfo, fields: (keyof MechInfo)[] = ALL_FIELDS): string =>
  `<dl class="midl">${FIELD.filter(([k]) => fields.includes(k) && m[k]).map(([k, label]) => `<dt class="${k}">${label}</dt><dd>${m[k]}</dd>`).join('')}</dl>`;

/** 一個機制的三欄說明（可展開） */
export const mechInfoHtml = (name: string, m: MechInfo | undefined, open = false): string =>
  (m ? `<details class="mi"${open ? ' open' : ''}><summary>${name}</summary>${mechDl(m)}</details>` : '');
