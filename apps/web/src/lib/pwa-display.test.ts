import { describe, expect, it } from 'vitest';
import { isInstalledDisplay } from './pwa-display';

describe('isInstalledDisplay', () => {
  it.each([
    ['ordinary browser tab', 'browser', undefined, false],
    ['iOS browser tab', 'browser', false, false],
    ['standalone PWA', 'standalone', undefined, true],
    ['fullscreen PWA', 'fullscreen', undefined, true],
    ['iOS home-screen app', 'browser', true, true],
  ] as const)('detects %s correctly', (_label, mode, standalone, expected) => {
    const browser = {
      matchMedia: (query: string) => ({
        matches: query === `(display-mode: ${mode})`,
      } as MediaQueryList),
    };
    const device = { userAgent: 'test', standalone };

    expect(isInstalledDisplay(browser, device)).toBe(expected);
  });
});
