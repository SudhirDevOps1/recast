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

      if (!pick) {
        // Deny CLEANLY — an unanswered request leaves getDisplayMedia() pending
        // forever and the recorder stuck on "Starting…". Record why so the
        // renderer can show an accurate message instead of a bare denial.
        const detail = `requested=${wanted ?? 'any'} · sources=${sources.length}`;
        context().displayMediaDeny = { reason: 'no-source', detail, at: Date.now() };
        console.error(`recast: display-media denied — no source available (${detail})`);
        callback(null);
        return;
      }

      // Remember the granted source's display scale factor: cursor samples are
      // taken in Electron DIP coordinates while video frames are physical
      // pixels. The factor is stamped into the session manifest so cursor
      // coords can be converted at project build time (fixes the cursor
      // rendering at the wrong spot on Windows 125–150 % / macOS Retina).
      const grantedDisplay =
        screen.getAllDisplays().find((d) => String(d.id) === (pick.display_id || '')) ??
        screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
      context().activeDisplayScaleFactor = grantedDisplay?.scaleFactor ?? 1;

      const response: Parameters<typeof callback>[0] = { video: pick };
      // System loopback audio is only reliably available on Windows; elsewhere
      // the request is video-only (record-flow falls back gracefully).
      if (process.platform === 'win32' && (req?.systemAudio ?? false)) {
        response.audio = 'loopback';
      }
      callback(response);
    })().catch((e: Error) => {
      // Never throw inside the handler — and never leave the request hanging.
      // A rejected bridge must deny the request so the renderer gets a fast,
      // explainable error instead of waiting forever.
      context().displayMediaDeny = {
        reason: 'handler-error',
        detail: `${e.name}: ${e.message}`,
        at: Date.now(),
      };
      console.error(`recast: display-media handler failed — denying: ${e.name}: ${e.message}`);
      try {
        callback(null);
      } catch {
        /* callback already answered */
      }
    });
  });
}
