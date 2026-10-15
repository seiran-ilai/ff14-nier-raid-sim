// 說明卡（練習內容、機制說明）與時間軸列表（點機制可「從這裡開始練」）
import { fmtT } from '../core/format';
import { getDrill, parseRand, findInfo } from '../drills';
import { mechInfoHtml } from '../drills/build';
import type { Session } from '../game/session';
import { $ } from './dom';
import { randPanelHtml, bindRandPanel } from './randpanel';
import { isMobile } from './mobile';

export function renderBrief(session: Session): void {
  const { drill: D, enc, raid } = getDrill(session.cfg.drill), G = session.G;
  const rand = parseRand(session.cfg.drill);
  let h = `<h3>${rand ? '隨機練習' : `${raid.short}・${raid.name}`}</h3><h4>${D.name}</h4>`;
  if (!rand && !session.cfg.drill.startsWith('cont:')) h += `<p class="muted">${enc.name}・${D.sub}</p>`;
  if (D.brief) h += `<div class="btext" id="bText">${D.brief}</div><button class="linkbtn" id="bMore" hidden>看完整流程</button>`;
  if (rand) h += randPanelHtml(rand);
  // 機制說明：效果 → 預兆 → 應對。單一機制直接展開；時間軸收起來，點名稱展開
  const info = (D.info ?? []).filter((n) => findInfo(n, enc));
  if (info.length) {
    const open = !D.tl && info.length <= 4;
    h += `<div class="mihead"><span>機制說明</span>${open ? '' : '<span class="muted">點名稱看效果／預兆／應對</span>'}</div>`
      + `<div class="milist${open ? '' : ' scroll'}">${info.map((n) => mechInfoHtml(n, findInfo(n, enc), open)).join('')}</div>`;
  }
  if (G && G.auto) h += `<div class="row"><span class="muted">教學示範中…</span><button class="btn ghost sm" id="bRe">${isMobile() ? '停止示範' : '自己練（R）'}</button></div>`;
  $('brief').innerHTML = h;
  const bt = document.getElementById('bText'), more = document.getElementById('bMore');
  if (bt && more && bt.scrollHeight > bt.clientHeight + 4) {
    more.hidden = false;
    more.onclick = () => { const open = bt.classList.toggle('open'); more.textContent = open ? '收起流程' : '看完整流程'; };
  }
  // 時間軸：獨立一張卡片，固定高度、內部捲動（打到哪會自動捲過去）
  const sc = $('seqCard');
  sc.hidden = !(D.tl && G);
  if (D.tl && G) {
    const canStart = !session.cfg.drill.startsWith('weak:');
    let t = `<h3>時間軸</h3>`;
    if (canStart) t += `<p class="muted">${isMobile() ? '點機制可以從那裡開始看示範。' : '點機制可以從那裡開始練（前面由 Bot 照攻略代打）。'}${session.startAt > 0 ? `目前從 <b>${fmtT(session.startAt)}</b> 開始　<button class="btn ghost sm" id="bFrom0">從頭開始</button>` : ''}</p>`;
    t += `<ul class="seq" id="seq">${G.seq.map((s, i) => {
      const cls = Math.abs(s.t - session.startAt) < 0.01 && session.startAt > 0 ? 'start' : '';
      const inner = `<span>${fmtT(s.t)}</span>${s.label}`;
      return `<li class="${cls}">${canStart && s.t > 1 ? `<button data-from="${i}" title="從這裡開始練">${inner}</button>` : inner}</li>`;
    }).join('')}</ul>`;
    sc.innerHTML = t;
  }
  if (rand) bindRandPanel(session, rand);
  const bRe = document.getElementById('bRe');
  if (bRe) bRe.onclick = (e) => { (e.target as HTMLElement).blur(); session.newGame(); };
  const b0 = document.getElementById('bFrom0');
  if (b0) b0.onclick = () => { session.startAt = 0; session.newGame(); };
  sc.querySelectorAll<HTMLButtonElement>('[data-from]').forEach((b) => {
    b.onclick = () => { session.startAt = G!.seq[+b.dataset.from!].t; session.newGame(); };
  });
}
