// 遊戲畫面上的 HUD：詠唱條、王台詞對話框、提示、增減益圖示列、隊伍血量、右上資訊、失誤 toast、時間軸目前位置
import { DIRNAME, fmtT } from '../core/format';
import { roleType } from '../core/constants';
import { hasBuff, type GameState } from '../game/state';
import type { InputState } from '../game/simulation';
import { $ } from './dom';
import { updActionBar } from './actionbar';

interface Icon { glyph: string; name: string; left: number; kind: 'debuff' | 'buff'; mine?: boolean }

function icons(G: GameState): Icon[] {
  const P = G.player, out: Icon[] = [];
  P.statuses.filter((s) => s.until > G.t).sort((a, b) => a.until - b.until)
    .forEach((s) => out.push({ glyph: s.glyph, name: s.name, left: s.until - G.t, kind: s.kind, mine: s.kind === 'debuff' }));
  if (hasBuff(G, P, 'heavy')) out.push({ glyph: '重', name: '加重', left: P.buffs.heavy! - G.t, kind: 'debuff', mine: true });
  if (P.stun > G.t) {
    const k = { stone: ['石', '石化'], fear: ['懼', '恐怖'], bind: ['縛', '束縛'], stun: ['暈', '眩暈'] }[P.stunKind ?? 'stun'];
    out.push({ glyph: k[0], name: k[1], left: P.stun - G.t, kind: 'debuff', mine: true });
  }
  if (hasBuff(G, P, 'sprint')) out.push({ glyph: '疾', name: '疾跑', left: P.buffs.sprint! - G.t, kind: 'buff' });
  if (hasBuff(G, P, 'akb')) out.push({ glyph: '防', name: '防擊退', left: P.buffs.akb! - G.t, kind: 'buff' });
  if (hasBuff(G, P, 'mit')) out.push({ glyph: '減', name: '減傷', left: P.buffs.mit! - G.t, kind: 'buff' });
  if (hasBuff(G, P, 'rmit')) out.push({ glyph: '團', name: '團隊減傷', left: P.buffs.rmit! - G.t, kind: 'buff' });
  if (P.shield && P.shield.until > G.t) out.push({ glyph: '盾', name: '護盾', left: P.shield.until - G.t, kind: 'buff' });
  return out;
}

const fmtLeft = (s: number): string => (s >= 10 ? String(Math.ceil(s)) : s.toFixed(1));

let lastCur = -2, lastParty = '';

/** 自己隊伍 8 人的血量（護盾＝下方細條） */
function updParty(G: GameState): void {
  const P = G.player;
  const h = G.ents.filter((e) => e.al === P.al && !e.away).map((e) => {
    const sh = e.shield && e.shield.until > G.t ? e.shield.amt : 0, hp = Math.round(e.hp);
    return `<div class="pm ${roleType(e.role)}${e === P ? ' me' : ''}${e.dead ? ' dead' : ''}${hp < 50 ? ' low' : ''}"><b>${e.role}</b><span class="hpb"><i style="width:${hp}%"></i>${sh ? `<s style="width:${Math.round((sh / 45) * 100)}%"></s>` : ''}</span><em>${hp}</em></div>`;
  }).join('');
  if (h !== lastParty) { lastParty = h; $('party').innerHTML = `<p>${P.al} 隊</p>${h}`; }
}

export function updHUD(G: GameState | null, input: InputState): void {
  if (!G) return;
  const cw = $('castW');
  if (G.cast && G.t < G.cast.start + G.cast.dur && G.state === 'run') {
    cw.hidden = false;
    const k = (G.t - G.cast.start) / G.cast.dur;
    $('castN').textContent = G.cast.name;
    $('castWho').textContent = G.bosses.length > 1 && G.cast.who ? G.cast.who : '';
    $('castF').style.width = k * 100 + '%';
    $('castT').textContent = Math.max(0, G.cast.start + G.cast.dur - G.t).toFixed(1);
    const tip = $('castTip');
    tip.hidden = !G.cast.tip || !G.cfg.text;
    tip.textContent = G.cast.tip ?? '';
  } else cw.hidden = true;

  const ln = $('line');
  if (G.line && G.t < G.line.until) { ln.hidden = false; $('lineWho').textContent = G.line.who ?? ''; $('lineT').textContent = G.line.text; } else ln.hidden = true;
  const al = $('alert');
  if (G.alert && G.t < G.alert.until) { al.hidden = false; al.textContent = G.alert.text; al.className = 'hud alert' + (G.alert.danger ? ' danger' : ''); } else al.hidden = true;

  $('status').innerHTML = icons(G).map((i) =>
    `<div class="ico ${i.kind}${i.mine ? ' mine' : ''}${i.kind === 'debuff' && i.left <= 5 ? ' urgent' : ''}" title="${i.name}"><b>${i.glyph}</b><span>${fmtLeft(i.left)}</span><em>${i.name}</em></div>`).join('');

  const P = G.player;
  $('tr').innerHTML = `<span>${G.enc.name}</span><span>時間 <b>${fmtT(G.t)}</b>${G.ff ? ' ・快轉 ×2' : ''}</span><span>面向 <b>${DIRNAME(P.face)}</b>${input.rmb ? '（右鍵）' : ''}</span>${G.tl ? `<span>失誤 <b>${G.fails.length}</b></span>` : ''}`;
  $('toast').innerHTML = G.toasts.slice(-3).map((t) => `<div>${t.text}</div>`).join('');
  updParty(G);
  updActionBar(G);

  if (G.tl && G.seq.length) {
    const items = document.querySelectorAll('#seq li');
    let cur = -1;
    G.seq.forEach((s, i) => { if (s.t <= G.t + 0.01) cur = i; });
    items.forEach((li, i) => { li.classList.toggle('now', i === cur); li.classList.toggle('done', i < cur); });
    // 目前的機制換了：把時間軸捲到它（只捲時間軸自己，不動整頁）
    if (cur !== lastCur) {
      lastCur = cur;
      const list = document.getElementById('seq'), li = items[Math.max(0, cur)] as HTMLElement | undefined;
      if (list && li) list.scrollTop = Math.max(0, li.offsetTop - list.offsetTop - list.clientHeight / 3);
    }
  }
}
