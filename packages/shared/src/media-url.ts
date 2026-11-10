import path from 'node:path';

/**
 * Resolve the on-disk path carried inside a `recast-media://local/...` URL.
 *
 * Media URLs percent-encode every path segment (both separators), so the URL
 * pathname decodes back to the absolute filesystem path of the asset:
 *
 *   POSIX    `/home/u/…/seg-0000.mp4`  → pathname `/home/u/…/seg-0000.mp4`
 *   Windows  `C:\Users\…\seg-0000.mp4` → pathname `/C:/Users/…/seg-0000.mp4`
 *
 * The leading slash is URL syntax, not part of the path. Re-adding it before
 * resolve() breaks Windows: `path.resolve('/C:/Users/…')` yields `\C:\Users\…`
 * — a nonexistent path that made the handler 404 every media request, blacking
 * out the editor preview and breaking export decode on Windows (v0.1.1 bug).
 * Drive-prefixed paths must be resolved as-is; POSIX paths need the root
 * restored after the leading slashes are stripped.
 */
export function mediaPathFromUrl(pathname: string, pathMod: typeof path = path): string {
  const decoded = decodeURIComponent(pathname).replace(/^\/+/, '');
  const rooted = /^[a-zA-Z]:[\\/]/.test(decoded) ? decoded : pathMod.sep + decoded;
  return pathMod.resolve(rooted);
}
