// 通用估計值（所有副本共用）。各副本自己的詠唱秒數、AOE 大小放在 src/raids/<副本>/tuning.ts。
// 標「估計」的都是推估，依實戰校正時只改這裡。

/** 跑速 m/s（估計） */
export const RUN = 6;
/** 疾跑倍率（估計 +30%） */
export const SPRINT_MUL = 1.3;
/** 加重倍率（估計 −50%） */
export const HEAVY_MUL = 0.5;
/** 角色判定圈半徑 m（估計）。AOE 判定一律「判定圈碰到預兆邊緣即中」，安全區則要求判定圈整個在內 */
export const HIT = 0.5;

/** Bot 看到預兆後多久開始動（反應時間，估計） */
export const REACT = 0.6;
/** 地面預兆一般提前幾秒出現（估計；機制可以自己指定） */
export const TELE_SHOW = 3;
/** 模擬固定時間步長（秒） */
export const SIM_DT = 1 / 120;
/** 跟隨鏡頭：畫面中心到邊的距離（m）——近／中／遠 */
export const VIEW_ZOOM = { near: 18, mid: 25, far: 33 } as const;
/** 預兆判定前閃爍的秒數 */
export const TELE_FLASH = 0.3;
/** 回放：判定前後各錄幾秒、錄影頻率、播放倍速 */
export const REPLAY = { before: 4, after: 1, hz: 30, speed: 0.35 } as const;
/** 背對（凝視）：面向來源幾度內會中（估計 ±60°） */
export const GAZE_ANGLE = Math.PI / 3;
