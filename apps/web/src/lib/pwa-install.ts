const INSTALL_ATTEMPTED_KEY = 'ds:pwa-install-attempted';
const INSTALL_HELP_DISMISSED_KEY = 'ds:pwa-install-help-dismissed';
const INSTALLED_KEY = 'ds:pwa-installed';

type NavigatorWithPlatform = Navigator & {
  userAgentData?: { platform?: string };
};

export function isAndroidDevice(
  userAgent: string = typeof navigator === 'undefined' ? '' : navigator.userAgent,
  platform: string | undefined =
    typeof navigator === 'undefined'
      ? undefined
      : (navigator as NavigatorWithPlatform).userAgentData?.platform,
): boolean {
  return /android/i.test(userAgent) || platform === 'Android';
}

function readFlag(key: string): boolean {
  try {
    if (typeof localStorage !== 'undefined' && localStorage.getItem(key) === '1') return true;
  } catch {
    // Fall back to tab-scoped storage if persistent storage is unavailable.
  }
  try {
    return typeof sessionStorage !== 'undefined' && sessionStorage.getItem(key) === '1';
  } catch {
    return false;
  }
}

function writeFlag(key: string): void {
  try {
    localStorage.setItem(key, '1');
  } catch {
    try {
      sessionStorage.setItem(key, '1');
    } catch {
      // The current page still avoids duplicate prompts even if storage is unavailable.
    }
  }
}

export function wasInstallPromptAttempted(): boolean {
  return readFlag(INSTALL_ATTEMPTED_KEY);
}

export function markInstallPromptAttempted(): void {
  writeFlag(INSTALL_ATTEMPTED_KEY);
}

export function wasInstallHelpDismissed(): boolean {
  return readFlag(INSTALL_HELP_DISMISSED_KEY);
}

export function dismissInstallHelp(): void {
  writeFlag(INSTALL_HELP_DISMISSED_KEY);
}

export function wasAppInstalled(): boolean {
  return readFlag(INSTALLED_KEY);
}

export function markAppInstalled(): void {
  writeFlag(INSTALLED_KEY);
}
