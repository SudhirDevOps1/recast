import { desktopCapturer, screen, session } from 'electron';
import { context } from './context';

/**
 * Bridges navigator.mediaDevices.getDisplayMedia() to the source the user
 * picked in Recast's own picker (context.recorderRequest, set by recorder:start).
 *
 * Since Electron 22 the built-in screen picker is gone: without this handler
 * every getDisplayMedia() call is denied and recording can never start.
 * Registered once at bootstrap, before any renderer exists.
 */
export function registerDisplayMediaHandler(): void {
  session.defaultSession.setDisplayMediaRequestHandler((_request, callback) => {
    void (async () => {
      const req = context().recorderRequest;
      const wanted = req?.windowId ?? req?.screenId ?? null;

      // Source ids from sources:list are stable strings ("screen:123" / "window:456").
      // Re-query here: sources cannot be passed over IPC, and the picker may
      // have happened moments ago — a fresh query revalidates availability.
      const sources = await desktopCapturer.getSources({ types: ['screen', 'window'] });
      const primary = screen.getPrimaryDisplay();

      const pick =
        (wanted ? sources.find((s) => s.id === wanted) : undefined) ??
        sources.find((s) => s.display_id === String(primary.id)) ??
        sources.find((s) => s.id.startsWith('screen:')) ??
        sources[0];

      if (!pick) return; // deny — the renderer surfaces a clear error toast

      const response: Parameters<typeof callback>[0] = { video: pick };
      // System loopback audio is only reliably available on Windows; elsewhere
      // the request is video-only (record-flow falls back gracefully).
      if (process.platform === 'win32' && (req?.systemAudio ?? false)) {
        response.audio = 'loopback';
      }
      callback(response);
    })().catch(() => {
      // Never throw inside the handler — a rejected bridge denies the request,
      // which the renderer reports as a friendly toast.
    });
  });
}
