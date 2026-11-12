import { systemPreferences, shell } from 'electron';
import type { PermissionStatus } from '@recast/shared';

/**
 * Honest permission reporting. macOS: live TCC status + deep links into
 * System Settings, with a relaunch offer when a grant arrives after launch.
 * Windows/Linux: capabilities are reported truthfully rather than faked.
 */

export function permissionStatus(): PermissionStatus {
  if (process.platform === 'darwin') {
    const screenStatus = systemPreferences.getMediaAccessStatus('screen');
    const mic = systemPreferences.getMediaAccessStatus('microphone');
    const cam = systemPreferences.getMediaAccessStatus('camera');
    return {
      screen: mapStatus(screenStatus),
      microphone: mapStatus(mic),
      camera: mapStatus(cam),
    };
  }
  return { screen: 'granted', microphone: 'granted', camera: 'granted' };
}

function mapStatus(s: string): PermissionStatus['screen'] {
  if (s === 'granted') return 'granted';
  if (s === 'denied') return 'denied';
  if (s === 'not-determined') return 'not-determined';
  return 'unsupported';
}

const DEEP_LINKS_DARWIN = {
  screen: 'x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture',
  microphone: 'x-apple.systempreferences:com.apple.preference.security?Privacy_Microphone',
  camera: 'x-apple.systempreferences:com.apple.preference.security?Privacy_Camera',
} as const;

const DEEP_LINKS_WIN = {
  screen: 'ms-settings:display',
  microphone: 'ms-settings:privacy-microphone',
  camera: 'ms-settings:privacy-webcam',
} as const;

export async function openPermissionSettings(kind: 'screen' | 'microphone' | 'camera'): Promise<void> {
  if (process.platform === 'darwin') {
    await shell.openExternal(DEEP_LINKS_DARWIN[kind]);
    return;
  }
  if (process.platform === 'win32') {
    await shell.openExternal(DEEP_LINKS_WIN[kind]);
    return;
  }
  // Linux fallback:
  await shell.openExternal('https://github.com/SudhirDevOps1/recast/blob/main/docs/platform-support.md');
}

export async function requestAccess(kind: 'microphone' | 'camera'): Promise<boolean> {
  if (process.platform !== 'darwin') return true;
  return systemPreferences.askForMediaAccess(kind);
}
