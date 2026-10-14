// @vitest-environment jsdom
// UI 冒煙測試：載入真正的 index.html 與 main.ts，手動推進 requestAnimationFrame，確認 DOM 接線無誤
import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { RAIDS } from '../src/raids';

let rafCb: FrameRequestCallback | null = null;
let now = 0;
const frames = (n: number): void => { for (let i = 0; i < n; i++) { now += 1000 / 60; const cb = rafCb; rafCb = null; cb?.(now); } };
const key = (type: 'keydown' | 'keyup', code: string, k = ''): void => { window.dispatchEvent(new KeyboardEvent(type, { code, key: k, bubbles: true })); };
const click = (sel: string): void => (document.querySelector(sel) as HTMLElement).click();

function stubCtx(): unknown {
  const fn: unknown = new Proxy(function () { /* noop */ }, { get: (_t, k) => (k === Symbol.toPrimitive ? () => 0 : fn), apply: () => fn, set: () => true });
  return fn;
}

beforeAll(async () => {
  const html = readFileSync(resolve(__dirname, '../index.html'), 'utf8');
  document.body.innerHTML = html.slice(html.indexOf('<body>') + 6, html.indexOf('<script type="module"'));
  HTMLCanvasElement.prototype.getContext = (() => stubCtx()) as never;
  window.requestAnimationFrame = (cb) => { rafCb = cb; return 1; };
  performance.now = () => now;
  await import('../src/main');
});

describe('UI 冒煙測試', () => {
  it('初始畫面：副本、練習方式、王、技能列、準備畫面', () => {
    expect(document.querySelectorAll('#raidRow [data-raid]').length).toBe(RAIDS.length);
    expect(document.querySelectorAll('#drillsMode [data-mode]').length).toBe(3);
    expect(document.querySelectorAll('#bar .slot').length).toBe(4);
    expect(document.querySelectorAll('#ov [data-mode]').length).toBe(2);
    frames(120);
    expect(document.querySelector('#ov [data-mode]')).not.toBeNull(); // 沒按開始就不會倒數
  });

  it('還沒有資料的副本顯示「準備中」，不會換掉目前的練習', () => {
    const empty = RAIDS.find((r) => !r.encounters.length);
    if (!empty) return;
    const before = document.getElementById('brief')!.textContent;
    click(`#raidRow [data-raid="${empty.id}"]`);
    expect(document.getElementById('drillsEnc')!.textContent).toContain(empty.name);
    expect(document.getElementById('brief')!.textContent).toBe(before);
  });

  it('選有資料的副本 → 王 → 單一機制', () => {
    click('#raidRow [data-raid="basic"]');
    expect(document.querySelectorAll('#drillsEnc [data-enc]').length).toBeGreaterThan(0);
    click('#drillsOne [data-k="basic/dummy/gaze"]');
    expect(document.getElementById('brief')!.textContent).toContain('背對');
  });

  it('按開始後倒數、開打，移動與技能有效、HUD 更新', () => {
    click('#ov [data-mode="continue"]');
    expect(document.querySelector('#ov .count')).not.toBeNull();
    frames(200);
    expect(document.getElementById('ov')!.hidden).toBe(true);
    expect(document.getElementById('tr')!.textContent).toContain('時間');
    key('keydown', 'Digit1', '1');
    key('keydown', 'KeyD', 'd');
    frames(30);
    key('keyup', 'KeyD', 'd');
    expect(document.getElementById('status')!.textContent).toContain('疾跑');
    frames(60);
    expect(document.getElementById('castW')!.hidden).toBe(false);
    expect(document.getElementById('castN')!.textContent).toBe('背對');
  });

  it('Esc 暫停／繼續、設定視窗開關', () => {
    key('keydown', 'Escape');
    expect(document.querySelector('#ov h2')!.textContent).toBe('暫停');
    key('keydown', 'Escape');
    expect(document.getElementById('ov')!.hidden).toBe(true);
    click('#openSet');
    expect(document.getElementById('modal')!.hidden).toBe(false);
    expect(document.querySelectorAll('#acts .act').length).toBe(4);
    click('#closeSet');
    expect(document.getElementById('modal')!.hidden).toBe(true);
  });

  it('教學示範跑完到結算，點判定可回放', () => {
    click('#drillsOne [data-k="basic/dummy/stack"]');
    click('#ov [data-demo]');
    frames(60 * 12);
    expect(document.querySelector('#ov .ocard h2')!.textContent).toContain('示範結束');
    expect(document.querySelectorAll('#ov .checks li').length).toBeGreaterThan(0);
    click('#ov [data-ck="0"]');
    expect(document.getElementById('rp')!.hidden).toBe(false);
    frames(60);
    key('keydown', 'Escape');
    expect(document.getElementById('rp')!.hidden).toBe(true);
  });

  it('時間軸：從中途開始、整個副本連續、隨機練習勾選樹', () => {
    click('#drillsOne [data-k="basic/dummy/all"]');
    const from = [...document.querySelectorAll<HTMLButtonElement>('#seq [data-from]')].find((b) => b.textContent!.includes('踩塔'))!;
    from.click();
    expect(document.querySelector('#ov .ocard')!.textContent).toContain('開始（前面由 Bot 代打）');
    key('keydown', 'Enter');
    frames(60 * 6);
    expect(document.getElementById('castW')!.hidden).toBe(false);
    expect(document.getElementById('castN')!.textContent).toBe('踩塔');
    click('#drillsMode [data-mode="cont"]');
    expect(document.getElementById('brief')!.textContent).toContain('連續');
    click('#drillsMode [data-mode="rand"]');
    expect(document.getElementById('rTree')).not.toBeNull();
    click('#drillsMode [data-mode="one"]');
  });

  it('收起／顯示側欄', () => {
    const b = document.getElementById('toggleSides') as HTMLButtonElement;
    b.click();
    expect(document.body.classList.contains('nosides')).toBe(true);
    b.click();
    expect(document.body.classList.contains('nosides')).toBe(false);
  });
});
