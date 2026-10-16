/** Presentation-owned sizing. Preserve aspect ratio when the GPU's reported limits apply. */
export function viewportResolution(
  width: number,
  height: number,
  pixelRatio: number,
  scale: number,
  maxWidth: number,
  maxHeight: number,
): { width: number; height: number; limited: boolean } {
  const desiredWidth = Math.max(1, Math.round(width * pixelRatio * scale));
  const desiredHeight = Math.max(1, Math.round(height * pixelRatio * scale));
  const fit = Math.min(1, maxWidth / desiredWidth, maxHeight / desiredHeight);
  return {
    width: Math.max(1, Math.floor(desiredWidth * fit)),
    height: Math.max(1, Math.floor(desiredHeight * fit)),
    limited: fit < 1,
  };
}
