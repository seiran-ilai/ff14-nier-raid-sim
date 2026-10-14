// DOM 小工具
export const $ = <T extends HTMLElement = HTMLElement>(id: string): T => document.getElementById(id) as T;

/** 一排切換按鈕（chip） */
export function seg<V extends string | number>(el: HTMLElement, items: readonly V[], cur: V, onPick: (v: string) => void, labelFn?: (v: V) => string): void {
  el.innerHTML = items.map((v) => `<button class="chip" aria-pressed="${String(v) === String(cur)}" data-v="${v}">${labelFn ? labelFn(v) : v}</button>`).join('');
  el.onclick = (e) => {
    const b = (e.target as HTMLElement).closest('button');
    if (b) { onPick(b.dataset.v!); b.blur(); }
  };
}
