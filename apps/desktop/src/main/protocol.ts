import { protocol, net } from 'electron';
import { createReadStream, existsSync, statSync } from 'node:fs';
import path from 'node:path';
import { recordingsDir, projectsDir } from './paths';
import { mediaPathFromUrl } from '@recast/shared/node';

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
    // The renderer percent-encodes each path segment; mediaPathFromUrl decodes
    // the pathname back to a rooted absolute path. Doing this inline used to
    // break Windows: path.resolve('/C:/…') yields '\C:\…', which 404'd every
    // media URL — black editor preview and dead export decode (fixed in
    // v0.1.2; see mediaPathFromUrl in @recast/shared/node and its tests).
    const filePath = mediaPathFromUrl(url.pathname);

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

    // Range requests are REQUIRED for MP4s whose moov atom sits at the end
    // of the file (ffmpeg's default without +faststart, and what many
    // screen recorders emit). Without ranges Chromium must buffer the whole
    // file to find the metadata; large files then fail to open at all —
    // black editor preview and "Segment media failed to load" on export.
    const rangeHeader = request.headers.get('range');
    const rangeMatch = rangeHeader ? /bytes=(\d*)-(\d*)/.exec(rangeHeader) : null;
    if (rangeMatch) {
      let start = rangeMatch[1] ? Number.parseInt(rangeMatch[1], 10) : 0;
      let end = rangeMatch[2] ? Number.parseInt(rangeMatch[2], 10) : stat.size - 1;
      if (Number.isNaN(start)) start = 0;
      if (Number.isNaN(end) || end >= stat.size) end = stat.size - 1;
      if (start > end || start >= stat.size) {
        return new Response(null, {
          status: 416,
          headers: { 'Content-Range': `bytes */${stat.size}`, 'Access-Control-Allow-Origin': '*' },
        });
      }
      const slice = createReadStream(filePath, { start, end });
      return new Response(slice as unknown as ReadableStream, {
        status: 206,
        headers: {
          'Content-Type': mime,
          'Content-Length': String(end - start + 1),
          'Content-Range': `bytes ${start}-${end}/${stat.size}`,
          'Accept-Ranges': 'bytes',
          'Access-Control-Allow-Origin': '*',
        },
      });
    }

    const stream = createReadStream(filePath);
    return new Response(stream as unknown as ReadableStream, {
      status: 200,
      headers: {
        'Content-Type': mime,
        'Content-Length': String(stat.size),
        'Accept-Ranges': 'bytes',
        // The renderer draws these videos onto a canvas for export. Without
        // CORS the canvas becomes tainted and WebCodecs rejects every frame
        // with "VideoFrames can't be created from tainted sources".
        'Access-Control-Allow-Origin': '*',
      },
    });
  });
  void net;
}
