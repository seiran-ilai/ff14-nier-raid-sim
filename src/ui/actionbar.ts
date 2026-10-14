// 技能按鈕與冷卻顯示
import type { Config } from '../core/config';
import { hasBuff, type GameState } from '../game/state';
import { $ } from './dom';

export function renderBar(cfg: Config): void {
  $('bar').innerHTML = cfg.acts.map((a, i) => `<button class="slot" data-i="${i}" title="${a.name}"><kbd>${a.label || ''}</kbd><b>${a.name}</b><span class="cd" hidden></span></button>`).join('');
  $('kbList').textContent = cfg.acts.map((a) => a.label).filter(Boolean).join(' ') || '—';
}

export function bindBar(onUse: (i: number) => void): void {
  $('bar').addEventListener('click', (e) => {
    const b = (e.target as HTMLElement).closest<HTMLElement>('.slot');
    if (b) { onUse(+b.dataset.i!); b.blur(); }
  });
}

export function updActionBar(G: GameState): void {
  const P = G.player;
  G.cfg.acts.forEach((a, i) => {
    const el = document.querySelector<HTMLElement>(`.slot[data-i="${i}"] .cd`);
    if (!el) return;
    const left = (G.cds[i] || 0) - G.t;
    if (left > 0 && G.state === 'run') {
      el.hidden = false;
      el.style.setProperty('--p', (left / (+a.cd || 1)) * 100 + '%');
      el.textContent = String(Math.ceil(left));
    } else el.hidden = true;
    el.parentElement!.classList.toggle('active', (a.type === 'sprint' && hasBuff(G, P, 'sprint')) || (a.type === 'akb' && hasBuff(G, P, 'akb')));
  });
}
