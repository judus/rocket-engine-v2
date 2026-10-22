import type { SurfaceVariant } from './SurfaceVariants.js';

export type SurfaceDetail = Exclude<SurfaceVariant, 'diffuse'>;
export const surfaceDetails: readonly SurfaceDetail[] = [
  'full',
  'no-normal',
  'scalar-pbr',
];

/** Player presentation preferences; no changes to simulation or CSS/input coordinates. */
export interface VideoSettings {
  surfaceDetail: SurfaceDetail;
  showFps: boolean;
  renderScale: number;
  pixelDensityLimit: number | null;
}
export const videoSettingsKey = 'rocket.first-flight.video';
export function defaultVideo(): VideoSettings {
  return {
    surfaceDetail: 'full',
    showFps: false,
    renderScale: 1,
    pixelDensityLimit: 2,
  };
}
export function validateVideo(value: unknown): VideoSettings {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('Video settings must be an object');
  const v = value as Record<string, unknown>;
  if (
    Object.keys(v).sort().join() !==
      'pixelDensityLimit,renderScale,showFps,surfaceDetail' ||
    typeof v.showFps !== 'boolean' ||
    !surfaceDetails.includes(v.surfaceDetail as SurfaceDetail) ||
    typeof v.renderScale !== 'number' ||
    !Number.isFinite(v.renderScale) ||
    v.renderScale < 0.5 ||
    v.renderScale > 1 ||
    !(
      v.pixelDensityLimit === null ||
      (typeof v.pixelDensityLimit === 'number' &&
        [1, 1.5, 2].includes(v.pixelDensityLimit))
    )
  )
    throw new Error('Invalid video settings');
  return {
    surfaceDetail: v.surfaceDetail as SurfaceDetail,
    showFps: v.showFps,
    renderScale: v.renderScale,
    pixelDensityLimit: v.pixelDensityLimit as number | null,
  };
}
/** Explicit one-time data migration. The active reader accepts only the current schema. */
export function migrateVideoStorage(
  storage: Pick<Storage, 'getItem' | 'setItem'>,
): boolean {
  const saved = storage.getItem(videoSettingsKey);
  if (saved === null) return false;
  const value: unknown = JSON.parse(saved);
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    const keys = Object.keys(value).sort().join();
    if (
      keys === 'pixelDensityLimit,renderScale' ||
      keys === 'pixelDensityLimit,renderScale,surfaceDetail'
    ) {
      const migrated = validateVideo({
        ...(keys === 'pixelDensityLimit,renderScale'
          ? { surfaceDetail: 'full' }
          : {}),
        ...value,
        showFps: false,
      });
      storage.setItem(videoSettingsKey, JSON.stringify(migrated));
      return true;
    }
  }
  validateVideo(value);
  return false;
}
export function readVideo(storage: Pick<Storage, 'getItem'>): VideoSettings {
  const saved = storage.getItem(videoSettingsKey);
  return saved === null
    ? defaultVideo()
    : validateVideo(JSON.parse(saved) as unknown);
}
export function saveVideo(
  storage: Pick<Storage, 'setItem'>,
  value: unknown,
): VideoSettings {
  const settings = validateVideo(value);
  storage.setItem(videoSettingsKey, JSON.stringify(settings));
  return settings;
}
/** Surface.resize already multiplies by device DPR, so pass the relative multiplier. */
export function videoSurfaceScale(
  settings: Pick<VideoSettings, 'renderScale' | 'pixelDensityLimit'>,
  devicePixelRatio: number,
): number {
  if (!Number.isFinite(devicePixelRatio) || devicePixelRatio <= 0)
    throw new Error('Pixel density must be positive and finite');
  return (
    (Math.min(
      devicePixelRatio,
      settings.pixelDensityLimit ?? devicePixelRatio,
    ) /
      devicePixelRatio) *
    settings.renderScale
  );
}
export function videoResolution(
  settings: Pick<VideoSettings, 'renderScale' | 'pixelDensityLimit'>,
  width: number,
  height: number,
  devicePixelRatio: number,
) {
  const density =
    devicePixelRatio * videoSurfaceScale(settings, devicePixelRatio);
  return {
    width: Math.max(1, Math.round(width * density)),
    height: Math.max(1, Math.round(height * density)),
  };
}
