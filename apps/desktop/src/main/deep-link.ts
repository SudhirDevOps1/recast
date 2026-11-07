import { app } from 'electron';

/**
 * `recast://` deep links. Handled on the second-instance event (all platforms)
 * so a single instance always owns them:
 *   recast://record                    → open the recorder
 *   recast://open?project=<id>         → open a project in the editor
 *   recast://export?project=<id>       → open the export dialog for a project
 */

export function parseDeepLink(url: string): { action: string; params: URLSearchParams } | null {
  if (!url.startsWith('recast://')) return null;
  try {
    const u = new URL(url);
    return { action: u.host || u.pathname.replace(/^\/+/, ''), params: u.searchParams };
  } catch {
    return null;
  }
}

export function handleDeepLink(url: string): void {
  const link = parseDeepLink(url);
  if (!link) return;
  const { action, params } = link;
  switch (action) {
    case 'record':
      app.emit('recast:new-recording');
      break;
    case 'open': {
      const projectId = params.get('project');
      if (projectId) app.emit('recast:open-project', projectId);
      break;
    }
    case 'export': {
      const projectId = params.get('project');
      if (projectId) app.emit('recast:export-project', projectId);
      break;
    }
    default:
      // Unknown deep links are ignored — never forwarded to the shell.
      break;
  }
}

export function registerProtocol(): void {
  if (process.defaultApp) {
    if (process.argv.length >= 2) {
      app.setAsDefaultProtocolClient('recast', process.execPath, [process.argv[1]!]);
    }
  } else {
    app.setAsDefaultProtocolClient('recast');
  }
}
