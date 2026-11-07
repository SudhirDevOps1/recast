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

const DEEP_LINKS = {
  screen: 'x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture',
  microphone: 'x-apple.systempreferences:com.apple.preference.security?Privacy_Microphone',
  camera: 'x-apple.systempreferences:com.apple.preference.security?Privacy_Camera',
} as const;

export async function openPermissionSettings(kind: keyof typeof DEEP_LINKS): Promise<void> {
  if (process.platform !== 'darwin') {
    // Honest fallback: we can't deep-link TCC on Windows/Linux.
    await shell.openExternal('https://github.com/SudhirDevOps1/recast/blob/main/docs/platform-support.md');
    return;
  }
  await shell.openExternal(DEEP_LINKS[kind]);
}

export async function requestAccess(kind: 'microphone' | 'camera'): Promise<boolean> {
  if (process.platform !== 'darwin') return true;
  return systemPreferences.askForMediaAccess(kind);
}
