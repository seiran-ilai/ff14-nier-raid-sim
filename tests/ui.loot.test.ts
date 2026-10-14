// @vitest-environment jsdom
// 掉落物頁：依部位／依王切換、職能版本篩選
import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

beforeAll(async () => {
  const html = readFileSync(resolve(__dirname, '../loot.html'), 'utf8');
  document.body.innerHTML = html.slice(html.indexOf('<body>') + 6, html.indexOf('<script type="module"'));
  await import('../src/loot');
});

const click = (sel: string): void => (document.querySelector(sel) as HTMLElement).click();
const body = (): string => document.getElementById('lBody')!.textContent!;

describe('掉落物頁', () => {
  it('依部位：頭部 → 司令機、9S（兩個王會掉）', () => {
    click('#lView [data-v="slot"]');
    const head = [...document.querySelectorAll('.lsec')].find((s) => s.querySelector('h2')!.textContent!.startsWith('頭部'))!;
    expect(head.textContent).toContain('多關節型：司令機');
    expect(head.textContent).toContain('9S：接入多腳戰車');
    expect(head.textContent).not.toContain('霍布斯');
    expect(body()).toContain('九宮幻卡：9S');
  });

  it('依王：每個王一段，列出部位與貨幣', () => {
    click('#lView [data-v="boss"]');
    const secs = document.querySelectorAll('.lsec');
    expect(secs.length).toBe(4);
    expect(secs[1].textContent).toContain('霍布斯');
    expect(secs[1].textContent).toContain('手部');
    expect(secs[1].textContent).toContain('亞拉戈詩學神典石 ×20');
  });

  it('職能版本篩選：只顯示那個版本', () => {
    click('#lKind [data-v="治癒"]');
    expect(body()).toContain('寄葉五一式治癒軍帽');
    expect(body()).not.toContain('寄葉五一式禦敵軍帽');
    click('#lKind [data-v="all"]');
    expect(body()).toContain('寄葉五一式禦敵軍帽');
  });
});
