/** Detect installed display mode without treating ordinary browser tabs as installed. */
export function isInstalledDisplay(
  browser: Pick<Window, 'matchMedia'> | undefined = typeof window === 'undefined' ? undefined : window,
  device: (Pick<Navigator, 'userAgent'> & { standalone?: boolean }) | undefined =
    typeof navigator === 'undefined' ? undefined : navigator,
): boolean {
  return device?.standalone === true ||
    Boolean(browser?.matchMedia('(display-mode: standalone)').matches) ||
    Boolean(browser?.matchMedia('(display-mode: fullscreen)').matches);
}
