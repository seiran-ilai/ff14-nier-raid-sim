// 隨機練習的設定（顯示在說明卡）：重複／不重複、分鐘數、機制勾選樹（全選 → 王 → 單一機制）
import type { Config } from '../core/config';
import { RAIDS } from '../raids';
import { SINGLES, randKey, type RandOpts } from '../drills';
import type { Session } from '../game/session';
import { seg } from './dom';
import { pickDrill } from './topbar';

export function randPanelHtml(o: RandOpts, cfg: Config): string {
  const on = new Set(o.ids);
  const groups = RAIDS.flatMap((raid) => raid.encounters.map((enc) => {
    const g = `${raid.id}/${enc.id}`, items = SINGLES.filter((d) => d.raid === raid && d.enc === enc);
    if (!items.length) return '';
    return `<div class="mgroup" data-g="${g}"><label class="mph"><input type="checkbox" data-ph="${g}"> ${raid.short}・${enc.name}</label>
      <div class="mitems">${items.map((d) => {
        const why = enc.unrelated?.(d.id, cfg.al, cfg.role);
        return `<label${why ? ` class="dim" title="${why}"` : ''}><input type="checkbox" data-id="${d.key}" ${on.has(d.key) ? 'checked' : ''}> ${d.drill.name}</label>`;
      }).join('')}</div></div>`;
  })).join('');
  return `<div class="set"><span class="lbl">重複</span><span class="grp" id="rRep"></span></div>
    <div class="set"><span class="lbl">時間</span><span class="grp" id="rMins"></span></div>
    <div class="mtree" id="rTree"><label class="mall"><input type="checkbox" data-all> 全選</label>${groups}</div>`;
}

export function bindRandPanel(session: Session, o: RandOpts): void {
  const cfg = session.cfg;
  const pick = (patch: Partial<Config['rand']>): void => {
    Object.assign(cfg.rand, { repeat: o.repeat, mins: o.mins, ids: o.ids }, patch);
    pickDrill(session, randKey({ repeat: cfg.rand.repeat, mins: cfg.rand.mins, ids: cfg.rand.ids }));
  };
  seg(document.getElementById('rRep')!, ['r', 'n'], o.repeat ? 'r' : 'n', (v) => pick({ repeat: v === 'r' }), (v) => (v === 'r' ? '重複' : '不重複'));
  seg(document.getElementById('rMins')!, [1, 2, 3, 4, 5], o.mins, (v) => pick({ mins: Number(v) }), (v) => `${v} 分鐘`);
  const tree = document.getElementById('rTree')!;
  const boxes = (sel: string): HTMLInputElement[] => [...tree.querySelectorAll<HTMLInputElement>(sel)];
  const set = (box: HTMLInputElement, items: HTMLInputElement[]): void => {
    const n = items.filter((b) => b.checked).length;
    box.checked = n === items.length;
    box.indeterminate = n > 0 && n < items.length;
  };
  boxes('[data-ph]').forEach((b) => set(b, boxes(`.mgroup[data-g="${b.dataset.ph}"] [data-id]`)));
  set(boxes('[data-all]')[0], boxes('[data-id]'));
  tree.onchange = (e) => {
    const t = e.target as HTMLInputElement;
    if (t.dataset.all !== undefined) boxes('[data-id]').forEach((b) => { b.checked = t.checked; });
    else if (t.dataset.ph) boxes(`.mgroup[data-g="${t.dataset.ph}"] [data-id]`).forEach((b) => { b.checked = t.checked; });
    let ids = boxes('[data-id]').filter((b) => b.checked).map((b) => b.dataset.id!);
    // 至少留一個機制
    if (!ids.length) ids = [SINGLES[0].key];
    pick({ ids });
  };
}
