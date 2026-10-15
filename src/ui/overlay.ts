// 遊戲畫面覆蓋層：準備（錯誤即停／錯誤不停／教學示範）、倒數、暫停、錯誤即停的失誤分析、結算
import { fmtT } from '../core/format';
import { saveConfig, type Config } from '../core/config';
import { roleType, type RoleType } from '../core/constants';
import { getDrill, findInfo } from '../drills';
import { mechDl } from '../drills/build';
import { mechName } from '../game/results';
import type { Check } from '../game/state';
import type { Session } from '../game/session';
import { $ } from './dom';
import { startReplay } from './replay';
import { isMobile } from './mobile';

const MODE_NOTE: Record<Config['failMode'], string> = {
  stop: '犯錯就停下，看錯在哪、正確怎麼做',
  continue: '打完整段，最後一次看所有判定',
};

/** 開局卡片：選的隊伍與職能，以及這個職能會判定什麼（技能名稱照技能列） */
const DUTY: Record<RoleType, (n: (t: string, d: string) => string) => string> = {
  tank: (n) => `開場／換王／轉場要在 6 秒內${n('provoke', '挑釁')}自己隊的王（別挑別隊的）；死刑判定時要開著${n('mit', '減傷')}`,
  heal: (n) => `全場 AOE 前上${n('aoeShield', '群盾')}、死刑前給自己隊的坦克上${n('shield', '單盾')}；受傷後幾秒內用${n('aoeHeal', '群補')}補回來（自己那隊只有你在補）`,
  dps: (n) => `全場 AOE 時，${n('raidMit', '團隊減傷')}冷卻好了就要開`,
};
function dutyHtml(cfg: Config): string {
  const n = (type: string, def: string): string => { const a = cfg.acts.find((x) => x.type === type); return `<b>${a?.name ?? def}${a?.label ? `（${a.label}）` : ''}</b>`; };
  const rt = roleType(cfg.role);
  return `<p class="duty"><span>${cfg.al} 隊・${{ tank: '坦克', heal: '補師', dps: 'DPS' }[rt]}</span>${DUTY[rt](n)}；技能冷卻好了卻沒用＝失誤。</p>`;
}

/** 失誤分析：這個機制的預兆與應對（沒有機制說明就用目前練習的說明） */
function howTo(session: Session, c: Check): string {
  const m = findInfo(mechName(c.tag), session.G?.enc);
  if (m) return mechDl(m, ['tell', 'how']);
  return `<div class="btext open">${getDrill(session.cfg.drill).drill.brief}</div>`;
}

/** 開局卡片：選要怎麼開始；練什麼在上方按鈕列選 */
function renderReady(session: Session): void {
  const ov = $('ov'), G = session.G!, cfg = session.cfg, D = getDrill(cfg.drill).drill;
  ov.hidden = false;
  ov.style.background = '';
  if (isMobile()) {
    ov.innerHTML = `<div class="ocard"><h2>${D.name}</h2>
      <p class="muted">${D.sub}${G.startAt > 0 ? `・從 <b>${fmtT(G.startAt)}</b> 開始` : ''}</p>
      <div class="starts"><button class="startbtn" data-demo><b>教學示範</b><span>角色自動照攻略正解跑一次，下方會顯示機制提示</span></button></div>
      <p class="muted">手機版只能看示範；用電腦開可以自己練。</p></div>`;
    ov.querySelector<HTMLButtonElement>('[data-demo]')!.onclick = () => session.newGame(true, G.rng.seed);
    return;
  }
  ov.innerHTML = `<div class="ocard"><h2>${D.name}</h2>
    <p class="muted">${G.enc.name}・${D.sub}${G.startAt > 0 ? `・從 <b>${fmtT(G.startAt)}</b> 開始（前面由 Bot 代打）` : ''}</p>
    <div class="starts">
      <button class="startbtn" data-mode="stop"><b>錯誤即停</b><span>${MODE_NOTE.stop}</span></button>
      <button class="startbtn" data-mode="continue"><b>錯誤不停</b><span>${MODE_NOTE.continue}</span></button>
      <button class="startbtn" data-demo><b>教學示範</b><span>角色自動照攻略正解跑一次（T）</span></button>
    </div>
    ${dutyHtml(cfg)}
    <p class="muted">Enter／空白鍵＝用上次的方式（${cfg.failMode === 'stop' ? '錯誤即停' : '錯誤不停'}）開始</p></div>`;
  ov.querySelectorAll<HTMLButtonElement>('[data-mode]').forEach((b) => {
    b.onclick = () => { cfg.failMode = b.dataset.mode as Config['failMode']; saveConfig(cfg); session.start(); };
  });
  ov.querySelector<HTMLButtonElement>('[data-demo]')!.onclick = () => session.newGame(true, G.rng.seed);
  ov.querySelector<HTMLButtonElement>(`[data-mode="${cfg.failMode}"]`)!.focus();
}

/** 錯誤即停：分析這個失誤 */
function renderStop(session: Session, c: Check): void {
  const ov = $('ov'), G = session.G!;
  const from = c.from ?? 0;
  ov.hidden = false;
  ov.style.background = '';
  ov.innerHTML = `<div class="ocard ng"><h2>失誤：${c.tag}</h2>
    <ul class="checks"><li class="ng"><span><span class="tg">${fmtT(c.t)}</span>　${c.text}</span></li></ul>
    ${c.fix ? `<p><b style="color:var(--ok)">正確處理：</b>${c.fix.label}（回放裡用綠圈標出）</p>` : ''}
    <div class="howto"><b>攻略</b>${howTo(session, c)}</div>
    <div class="row">
      <button class="btn" id="oFrom">從此機制開始（${fmtT(from)}）</button>
      <button class="btn ghost" id="oRe">重新開始</button>
      <button class="btn ghost" id="oRp">回放這段</button>
      <button class="btn ghost" id="oDemo">看這段示範</button>
    </div></div>`;
  $('oFrom').onclick = () => { session.startAt = from; session.newGame(false, G.rng.seed); };
  $('oRe').onclick = () => { session.startAt = 0; session.newGame(); };
  $('oDemo').onclick = () => session.newGame(true, G.rng.seed, from);
  $('oRp').onclick = () => { if (!startReplay(session.rec.frames, c, () => renderOverlay(session))) $('oRp').textContent = '（沒有錄到）'; };
  $('oFrom').focus();
}

export function renderOverlay(session: Session): void {
  const ov = $('ov'), G = session.G;
  if (!G) { ov.hidden = true; return; }
  if (G.state === 'ready') { renderReady(session); return; }
  if (G.state === 'count') {
    ov.hidden = false;
    ov.style.background = 'rgba(12,11,9,.35)';
    const from = G.startAt > 0 ? `<p class="muted" style="text-align:center">從 ${fmtT(G.startAt)} 開始</p>` : '';
    ov.innerHTML = `<div><div class="count">${Math.max(1, Math.ceil(G.countT))}</div>${from}</div>`;
    return;
  }
  if (G.paused) {
    ov.hidden = false;
    ov.style.background = '';
    ov.innerHTML = `<div class="ocard"><h2>暫停</h2><div class="row"><button class="btn" id="oRes">繼續（Esc）</button><button class="btn ghost" id="oRe">重來（R）</button></div></div>`;
    $('oRes').onclick = () => session.togglePause();
    $('oRe').onclick = () => session.newGame();
    return;
  }
  if (G.state === 'end' && G.stopCheck) { renderStop(session, G.stopCheck); return; }
  if (G.state === 'end') {
    const ok = !!G.result?.ok;
    ov.hidden = false;
    ov.style.background = '';
    const checks = G.checks.slice().sort((a, b) => a.t - b.t);
    const cks = checks.map((c, i) => `<li class="${c.warn ? 'warn' : c.ok ? '' : 'ng'}"><button data-ck="${i}" title="回放這個判定的前後幾秒"><span class="tg">${fmtT(c.t)} ${c.tag}</span>　${c.text}<span class="rp">▶ 回放</span></button></li>`).join('');
    const title = (G.auto ? '示範結束：' : '') + (ok ? (G.tl ? '完美通過' : '處理成功') : G.tl ? `失誤 ${G.fails.length} 次` : '失敗');
    ov.innerHTML = `<div class="ocard ${ok ? 'ok' : 'ng'}"><h2>${title}</h2>
      <p class="endseed">${G.startAt > 0 ? `從 ${fmtT(G.startAt)} 開始・` : ''}點任一判定可慢動作回放並標出正確位置</p>
      <ul class="checks">${cks || '<li>沒有紀錄</li>'}</ul>
      <div class="row">${isMobile() ? '<button class="btn" id="oRe">換一局再看</button>' : '<button class="btn" id="oRe">再來一次（R）</button>'}<button class="btn ghost" id="oDemo">${isMobile() ? '同一局再看一次' : '教學示範'}</button></div></div>`;
    $('oRe').onclick = () => session.newGame(isMobile());
    $('oDemo').onclick = () => session.newGame(true, G.rng.seed);
    ov.querySelectorAll<HTMLButtonElement>('[data-ck]').forEach((b) => {
      b.onclick = () => {
        const c = checks[+b.dataset.ck!];
        if (!startReplay(session.rec.frames, c, () => renderOverlay(session))) b.querySelector('.rp')!.textContent = '（沒有錄到）';
      };
    });
    return;
  }
  ov.hidden = true;
}
