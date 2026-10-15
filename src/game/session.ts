// 一個練習工作階段：持有目前這局、設定與輸入；負責開新局（種子、起點）、固定步長推進、結算紀錄、錄影，並通知 UI。
import type { Config } from '../core/config';
import { createRng } from '../core/rng';
import { SIM_DT } from '../core/tuning';
import { getDrill } from '../drills';
import { createState, pullsOf, type GameState, type Sfx } from './state';
import { needProvoke } from './roles';
import { syncActs } from '../core/config';
import { step, type InputState } from './simulation';
import { useAct } from './actions';
import { recordDrill, recordMechs } from './stats';
import { Recorder } from './replay';

export type SessionEvent = 'new' | 'change' | 'stats';

/** 從某個機制開始時，提前幾秒交還控制（倒數後開始） */
const START_LEAD = 2;
/** 一幀最多推進幾步（避免分頁切回來時卡死） */
const MAX_STEPS = 30;

export class Session {
  G: GameState | null = null;
  /** 固定步長累積的剩餘時間與插值比例 */
  private acc = 0;
  alpha = 1;
  /** 時間軸的起點（秒）；0 表示從頭 */
  startAt = 0;
  /** 指定機制樣式（教學頁用，見 state.ts variant）；null＝全部照亂數 */
  pick: Record<string, string> | null = null;
  /** 截圖網址參數用：畫面停住不推進（開新局就解除） */
  frozen = false;
  readonly rec = new Recorder();
  /** 設定「每回合不重置冷卻」時沿用的冷卻表 */
  private cdsKeep: Record<number, number> | null = null;
  private listeners: Record<SessionEvent, (() => void)[]> = { new: [], change: [], stats: [] };

  /** record：是否錄回放影格（網頁開、無頭測試預設關，省記憶體） */
  constructor(public cfg: Config, public input: InputState, private record = false) {}

  on(ev: SessionEvent, fn: () => void): void {
    this.listeners[ev].push(fn);
  }

  private emit(ev: SessionEvent): void {
    this.listeners[ev].forEach((fn) => fn());
  }

  /** 開新局。seed 省略＝隨機；startAt（秒）> 0 時先以示範模式快轉到該機制前 */
  newGame(auto = false, seed?: number, startAt = this.startAt): GameState {
    const { drill, enc } = getDrill(this.cfg.drill);
    this.frozen = false;
    syncActs(this.cfg);
    const G = createState(this.cfg, auto, createRng(seed), enc, !!drill.tl);
    if (this.pick) G.pick = { ...this.pick };
    if (!this.cfg.cdReset && this.cdsKeep) G.cds = this.cdsKeep;
    this.G = G;
    this.acc = 0;
    this.input.moveTo = null;
    this.rec.clear();
    // 時間軸開場：拉王的坦克要挑釁（單一機制不用）
    if (drill.tl) pullsOf(enc).forEach(([al, id]) => needProvoke(G, 0.5, al, id));
    drill.setup(G);
    G.ev.sort();
    G.seq.sort((a, b) => a.t - b.t);
    if (startAt > 0) this.fastForward(G, startAt);
    this.emit('new');
    return G;
  }

  /** 準備畫面按「開始」：開始倒數 */
  start(): void {
    const G = this.G;
    if (!G || G.state !== 'ready') return;
    G.state = 'count';
    G.countT = 3;
    this.emit('change');
  }

  /** 前面的部分交給 Bot 跑（之前的狀態＝照攻略處理的結果），到起點前清掉紀錄、重新倒數 */
  private fastForward(G: GameState, startAt: number): void {
    const auto = G.auto;
    G.auto = true;
    G.state = 'run';
    const until = Math.max(0, startAt - START_LEAD);
    while (G.t < until && G.state === 'run') step(G, this.input, SIM_DT * 4);
    G.auto = auto;
    const P = G.player;
    P.dead = false;
    P.mt = null; P.ov = null; P.faceLock = null;
    G.checks = []; G.fails = []; G.toasts = []; G.sfx = []; G.botFails = []; G.mech = {};
    G.ents.forEach((e) => { e.px = e.x; e.py = e.y; e.pface = e.face; });
    G.state = auto ? 'count' : 'ready';
    G.countT = 3;
    G.startAt = G.t;
  }

  /** 前進 dt 秒（遊戲時間），內部用固定步長 SIM_DT */
  advance(dt: number): void {
    const G = this.G;
    if (!G) return;
    this.acc += dt;
    let n = 0;
    while (this.acc >= SIM_DT && n < MAX_STEPS) { this.step(SIM_DT); this.acc -= SIM_DT; n++; }
    if (n === MAX_STEPS) this.acc = 0;
    this.alpha = Math.min(1, this.acc / SIM_DT);
  }

  /** 推進一步；狀態有變時通知 UI */
  step(dt: number): void {
    const G = this.G;
    if (!G) return;
    const before = this.signature(G);
    step(G, this.input, dt);
    if (this.record) this.rec.tick(G);
    if (G.state === 'end' && before.startsWith('run') && !G.auto) {
      recordDrill(this.cfg.drill, !!G.result?.ok);
      recordMechs(G.mech);
      this.emit('stats');
    }
    if (this.signature(G) !== before) this.emit('change');
  }

  /** 取走待播放的音效（同一種一幀只播一次） */
  drainSfx(): Sfx[] {
    if (!this.G) return [];
    const s = [...new Set(this.G.sfx)];
    this.G.sfx = [];
    return s;
  }

  useAct(i: number): void {
    if (this.G && useAct(this.G, i)) this.cdsKeep = this.G.cds;
  }

  togglePause(): void {
    const G = this.G;
    if (!G || G.state !== 'run') return;
    G.paused = !G.paused;
    this.emit('change');
  }

  pause(): void {
    if (this.G && this.G.state === 'run' && !this.G.paused) this.togglePause();
  }

  /** 影響覆蓋層的狀態 */
  private signature(G: GameState): string {
    return `${G.state}|${G.paused}|${G.state === 'count' ? Math.ceil(G.countT) : ''}`;
  }
}
