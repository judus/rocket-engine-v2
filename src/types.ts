export interface Point {
  x: number;
  y: number;
}
export type Matrix2D = [number, number, number, number, number, number];
export interface Frame {
  readonly dt: number;
  readonly time: number;
}
export interface FixedFrame extends Frame {
  readonly tick: number;
}
export interface FixedStats {
  readonly step: number;
  readonly steps: number;
  readonly totalSteps: number;
  readonly time: number;
  readonly alpha: number;
  readonly droppedTime: number;
}
// undefined rather than void keeps async callbacks out of synchronous slots.
export interface Scene {
  /** Active delegated children for service scopes; parent owns their updates/lifetime. */
  activeChildren?(): readonly Scene[];
  fixedUpdate?(dt: number, frame: FixedFrame): undefined;
  update?(dt: number, frame: Frame): undefined;
  draw?(ctx: CanvasRenderingContext2D, frame: Frame): undefined;
  prepare?(context: { signal: AbortSignal }): void | Promise<void>;
  dispose?(): void | Promise<void>;
}
export interface PerformanceStats {
  readonly fps: number | null;
  readonly frameMs: number | null;
  readonly maxFrameMs: number | null;
  readonly minFrameMs: number | null;
  /** Standard deviation of callback intervals in the current measurement window. */
  readonly frameJitterMs: number | null;
  readonly updateMs: number | null;
  readonly renderMs: number | null;
}
