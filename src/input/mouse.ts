// 滑鼠：左鍵點地面＝往那裡走；右鍵按住＝角色面向游標；追蹤游標的世界座標
import type { InputState } from '../game/simulation';
import { toWorld } from '../render/canvas';

export function bindMouse(cv: HTMLCanvasElement, input: InputState): void {
  cv.addEventListener('contextmenu', (e) => e.preventDefault());
  cv.addEventListener('mousedown', (e) => {
    if (e.button === 0) { input.moveTo = toWorld(e.clientX, e.clientY); e.preventDefault(); }
    if (e.button === 2) { input.rmb = true; input.mouse = toWorld(e.clientX, e.clientY); e.preventDefault(); }
  });
  window.addEventListener('mouseup', (e) => { if (e.button === 2) input.rmb = false; });
  cv.addEventListener('mousemove', (e) => { input.mouse = toWorld(e.clientX, e.clientY); });
}
