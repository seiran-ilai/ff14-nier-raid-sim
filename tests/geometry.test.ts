import { describe, it, expect } from 'vitest';
import { angDiff, dirV, angOf, polar } from '../src/core/geometry';
import { hitShape, hitCircle, insideCircle } from '../src/core/shapes';
import { squareArena, circleArena, onFloor, clampIn, edgeDist } from '../src/core/arena';
import { HIT } from '../src/core/tuning';

describe('geometry', () => {
  it('角度慣例：0 = 北、π/2 = 東', () => {
    expect(dirV(0).y).toBeCloseTo(-1);
    expect(dirV(Math.PI / 2).x).toBeCloseTo(1);
    expect(angOf(1, 0)).toBeCloseTo(Math.PI / 2);
    expect(polar({ x: 0, y: 0 }, Math.PI, 5).y).toBeCloseTo(5);
  });

  it('angDiff 落在 0～π 且對稱', () => {
    expect(angDiff(0, Math.PI)).toBeCloseTo(Math.PI);
    expect(angDiff(0.1, 2 * Math.PI - 0.1)).toBeCloseTo(0.2);
    expect(angDiff(-3, 3)).toBeCloseTo(angDiff(3, -3));
  });

  it('方形場地（尼爾預設）：邊界、夾回、到邊距離', () => {
    const a = squareArena(20);
    expect(onFloor(a, { x: 20, y: 20 })).toBe(true);
    expect(onFloor(a, { x: 20.01, y: 0 })).toBe(false);
    expect(onFloor(a, { x: 19.5, y: 0 }, 1)).toBe(false);
    expect(clampIn(a, { x: 30, y: -25 }, 1)).toEqual({ x: 19, y: -19 });
    expect(edgeDist(a, { x: 15, y: 2 })).toBeCloseTo(5);
    const c = circleArena(10);
    expect(onFloor(c, { x: 8, y: 6 })).toBe(true);
    expect(onFloor(c, { x: 8, y: 6.1 })).toBe(false);
  });
});

describe('判定圈與 AOE 形狀', () => {
  const p = (x: number, y: number) => ({ x, y });
  it('圓形：碰到邊緣就中、整個在內才算安全區', () => {
    expect(hitCircle(p(5 + HIT, 0), p(0, 0), 5)).toBe(true);
    expect(hitCircle(p(5 + HIT + 0.01, 0), p(0, 0), 5)).toBe(false);
    expect(insideCircle(p(5 - HIT, 0), p(0, 0), 5)).toBe(true);
    expect(insideCircle(p(5 - HIT + 0.01, 0), p(0, 0), 5)).toBe(false);
  });
  it('環形（月環）：中間安全', () => {
    const s = { k: 'ring' as const, x: 0, y: 0, r0: 5, r1: 30 };
    expect(hitShape(p(0, 3), s)).toBe(false);
    expect(hitShape(p(0, 6), s)).toBe(true);
  });
  it('扇形：正面中、背後不中', () => {
    const s = { k: 'fan' as const, x: 0, y: 0, r: 20, a: Math.PI, w: Math.PI / 3 };
    expect(hitShape(p(0, 10), s)).toBe(true);
    expect(hitShape(p(0, -10), s)).toBe(false);
  });
  it('十字、矩形、半場', () => {
    expect(hitShape(p(10, 1), { k: 'cross', x: 0, y: 0, a: 0, hw: 2 })).toBe(true);
    expect(hitShape(p(10, 10), { k: 'cross', x: 0, y: 0, a: 0, hw: 2 })).toBe(false);
    expect(hitShape(p(0, -5), { k: 'rect', O: p(0, 0), H: 0, len: 10, w: 4 })).toBe(true);
    expect(hitShape(p(0, 5), { k: 'rect', O: p(0, 0), H: 0, len: 10, w: 4 })).toBe(false);
    expect(hitShape(p(5, 0), { k: 'half', x: 0, y: 0, r: 20, a: Math.PI / 2 })).toBe(true);
    expect(hitShape(p(-5, 0), { k: 'half', x: 0, y: 0, r: 20, a: Math.PI / 2 })).toBe(false);
  });
});
