/** Call directly from a touch player's Launch/Resume gesture, before navigation. */
export async function enterMobileScreen(
  target: {
    requestFullscreen?: (options?: FullscreenOptions) => Promise<void>;
  },
  page: {
    readonly fullscreenElement: Element | null;
    readonly fullscreenEnabled: boolean;
  },
  orientation: { lock?: (orientation: 'landscape') => Promise<void> },
): Promise<string> {
  if (!page.fullscreenElement) {
    if (
      !page.fullscreenEnabled ||
      typeof target.requestFullscreen !== 'function'
    )
      return 'Fullscreen is unavailable in this browser. Rotate your phone to landscape.';
    try {
      await target.requestFullscreen({ navigationUI: 'hide' });
    } catch {
      return 'The browser refused fullscreen. Rotate your phone to landscape; Resume retries fullscreen.';
    }
  }
  if (typeof orientation.lock !== 'function')
    return 'Automatic rotation is unavailable. Rotate your phone to landscape.';
  try {
    await orientation.lock('landscape');
  } catch {
    return 'The browser could not lock landscape. Rotate your phone manually.';
  }
  return '';
}
