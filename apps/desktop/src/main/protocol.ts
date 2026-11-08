import { protocol, net } from 'electron';
import { createReadStream, existsSync, statSync } from 'node:fs';
import path from 'node:path';
import { recordingsDir, projectsDir } from './paths';

/**
 * `recast-media://` — read-only file streaming for recordings, thumbnails and
 * exports. The renderer sandbox never gets direct fs access; it asks for a
 * media URL and the main process streams it with correct MIME types.
 */

export function registerMediaProtocol(): void {
  protocol.registerSchemesAsPrivileged([
    {
      scheme: 'recast-media',
      privileges: {
        standard: true,
        secure: true,
        supportFetchAPI: true,
        stream: true,
        // Required for crossOrigin='anonymous' media loads (canvas-drawn
        // export frames): without it Chromium blocks the CORS-mode request
        // before it ever reaches the handler.
        corsEnabled: true,
      },
    },
  ]);
}

const ALLOWED_ROOTS = [recordingsDir(), projectsDir()];

export function mediaUrlFor(absolutePath: string): string {
  return `recast-media://local/${absolutePath.split(path.sep).map(encodeURIComponent).join('/')}`;
}

export function handleMediaProtocol(): void {
  protocol.handle('recast-media', (request) => {
    const url = new URL(request.url);
    // Media URLs carry an absolute POSIX path in the pathname —
    // `recast-media://local//home/u/recordings/x.mp4` yields pathname
    // `//home/u/...` (leading double slash from the absolute path's empty
    // first segment). Canonicalize to a rooted absolute path instead of
    // resolving against the process cwd, which made the handler 403/404
    // depending on how the app was launched.
    const decoded = decodeURIComponent(url.pathname);
    const filePath = path.resolve(`/${decoded.replace(/^\/+/, '')}`);

    const allowed = ALLOWED_ROOTS.some((root) => filePath.startsWith(root));
    if (!allowed) {
      return new Response('Forbidden', { status: 403 });
    }
    if (!existsSync(filePath) || !statSync(filePath).isFile()) {
      return new Response('Not found', { status: 404 });
    }
    const ext = path.extname(filePath).toLowerCase();
    const mime =
      ext === '.mp4' ? 'video/mp4'
      : ext === '.webm' ? 'video/webm'
      : ext === '.png' ? 'image/png'
      : ext === '.jpg' || ext === '.jpeg' ? 'image/jpeg'
      : ext === '.json' ? 'application/json'
      : 'application/octet-stream';
    const stat = statSync(filePath);
    const stream = createReadStream(filePath);
    return new Response(stream as unknown as ReadableStream, {
      status: 200,
      headers: {
        'Content-Type': mime,
        'Content-Length': String(stat.size),
        'Accept-Ranges': 'none',
        // The renderer draws these videos onto a canvas for export. Without
        // CORS the canvas becomes tainted and WebCodecs rejects every frame
        // with "VideoFrames can't be created from tainted sources".
        'Access-Control-Allow-Origin': '*',
      },
    });
  });
  void net;
}
