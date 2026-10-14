// @vitest-environment jsdom
// 機制教學頁：索引、說明（效果／預兆／應對）、動態圖會播放、樣式選擇
import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { ALL_DRILLS } from '../src/drills';

let rafCb: FrameRequestCallback | null = null;
let now = 0;
const frames = (n: number): void => { for (let i = 0; i < n; i++) { now += 1000 / 60; const cb = rafCb; rafCb = null; cb?.(now); } };

function stubCtx(): unknown {
  const fn: unknown = new Proxy(function () { /* noop */ }, { get: (_t, k) => (k === Symbol.toPrimitive ? () => 0 : fn), apply: () => fn, set: () => true });
  return fn;
}

beforeAll(async () => {
  const html = readFileSync(resolve(__dirname, '../guide.html'), 'utf8');
  document.body.innerHTML = html.slice(html.indexOf('<body>') + 6, html.indexOf('<script type="module"'));
  HTMLCanvasElement.prototype.getContext = (() => stubCtx()) as never;
  window.requestAnimationFrame = (cb) => { rafCb = cb; return 1; };
  performance.now = () => now;
  Element.prototype.scrollIntoView = () => {};
  await import('../src/guide');
});

describe('機制教學頁', () => {
  it('每個練習項目一段，索引與下拉選單對應；機制說明全部展開', () => {
    const n = document.querySelectorAll('.gsec').length;
    expect(n).toBe(ALL_DRILLS.length);
    expect(document.querySelectorAll('#gnav .gitem').length).toBe(n);
    expect(document.querySelectorAll('#gsel option').length).toBe(n);
    const mi = document.querySelectorAll('details.mi');
    expect(mi.length).toBeGreaterThan(5);
    expect([...mi].every((d) => (d as HTMLDetailsElement).open)).toBe(true);
    expect(document.querySelectorAll('details.mi [data-go]').length).toBe(mi.length);
  });

  it('跳到單一機制：那一段播放，讀條有進度，可暫停', () => {
    (document.querySelector('#gnav [data-k="basic/dummy/gaze"]') as HTMLElement).click();
    const s = document.getElementById('k-basic-dummy-gaze')!;
    expect(s.classList.contains('playing')).toBe(true);
    ['效果', '預兆', '應對'].forEach((w) => expect(s.textContent).toContain(w));
    frames(60 * 2);
    expect(s.querySelector('.gcap')!.textContent).toContain('背對');
    const stage = s.querySelector('.gstage') as HTMLElement;
    stage.click();
    frames(2);
    expect(s.querySelector('.gtime')!.textContent).toContain('已暫停');
    stage.click();
  });

  it('有樣式的機制可以指定樣式播放', () => {
    const s = document.getElementById('k-basic-dummy-dodge')!;
    (s.querySelector('[data-vv="月環"]') as HTMLElement).click();
    expect(s.classList.contains('playing')).toBe(true);
    frames(60 * 2);
    expect(s.querySelector('.gcap')!.textContent).toContain('月環');
  });
});
