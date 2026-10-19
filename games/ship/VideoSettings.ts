/** Player presentation preferences; no changes to simulation or CSS/input coordinates. */
export interface VideoSettings {
  renderScale: number;
  pixelDensityLimit: number | null;
}
export const videoSettingsKey = 'rocket.first-flight.video';
export function defaultVideo(): VideoSettings {
  return { renderScale: 1, pixelDensityLimit: 2 };
}
export function validateVideo(value: unknown): VideoSettings {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('Video settings must be an object');
  const v = value as Record<string, unknown>;
  if (
    Object.keys(v).sort().join() !== 'pixelDensityLimit,renderScale' ||
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
    renderScale: v.renderScale,
    pixelDensityLimit: v.pixelDensityLimit as number | null,
  };
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
  settings: VideoSettings,
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
  settings: VideoSettings,
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
