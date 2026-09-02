import { readFile } from 'node:fs/promises';
import path from 'node:path';
import type { HttpResponse } from './types.js';

/**
 * Serving the built site from the Lambda, for when CloudFront is not available.
 *
 * Normally the frontend lives in S3 behind CloudFront and this file is never
 * used. It exists because a brand-new AWS account cannot create CloudFront
 * distributions until AWS verifies it, which can take a day - and an app with no
 * URL is worth less than a slightly inefficient one.
 *
 * The trade is real and worth stating: every asset request wakes a Lambda
 * instead of hitting an edge cache, so first paint is slower and each file costs
 * an invocation. For one reviewer clicking through a demo that is invisible; for
 * actual traffic it would not be the right answer. `Cache-Control` below at
 * least keeps a returning browser from asking twice.
 *
 * Enabled by `SERVE_STATIC_DIR`. Unset - which is the normal deployment - and
 * none of this runs.
 */

/** Extensions we are willing to serve, and what to call them. */
const CONTENT_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
};

const TEXTUAL = new Set(['.html', '.js', '.css', '.json', '.svg', '.txt']);

/**
 * Vite fingerprints every asset it emits, so those may be cached forever. The
 * entry document must not be - it is what points at the new fingerprints.
 */
const IMMUTABLE = 'public, max-age=31536000, immutable';
const REVALIDATE = 'no-cache';

const cache = new Map<string, { body: string; type: string; base64: boolean }>();

/**
 * Resolves a URL path to a file INSIDE the root, or nothing.
 *
 * `path.normalize` collapses `..` before the prefix check, so `/../../etc/passwd`
 * resolves out of the root and is refused rather than served. Path traversal is
 * the one thing a naive static handler always gets wrong.
 */
function resolveWithin(root: string, urlPath: string): string | undefined {
  const decoded = (() => {
    try {
      return decodeURIComponent(urlPath);
    } catch {
      return undefined;
    }
  })();
  if (decoded === undefined || decoded.includes('\0')) return undefined;

  const candidate = path.resolve(root, `.${path.posix.normalize(decoded)}`);
  const rooted = path.resolve(root);
  return candidate === rooted || candidate.startsWith(rooted + path.sep) ? candidate : undefined;
}

async function read(file: string): Promise<HttpResponse | undefined> {
  const extension = path.extname(file).toLowerCase();
  const type = CONTENT_TYPES[extension];
  // An extension we do not recognise is not served at all, rather than served
  // as a guess. Nothing in a Vite build falls outside the list above.
  if (!type) return undefined;

  const hit = cache.get(file);
  const entry =
    hit ??
    (await (async () => {
      try {
        const bytes = await readFile(file);
        const isText = TEXTUAL.has(extension);
        return {
          body: isText ? bytes.toString('utf8') : bytes.toString('base64'),
          type,
          base64: !isText,
        };
      } catch {
        return undefined;
      }
    })());

  if (!entry) return undefined;
  cache.set(file, entry);

  return {
    status: 200,
    body: entry.body,
    headers: {
      'Content-Type': entry.type,
      'Cache-Control': extension === '.html' ? REVALIDATE : IMMUTABLE,
      'X-Content-Type-Options': 'nosniff',
      ...(entry.base64 ? { 'X-Base64': '1' } : {}),
    },
  };
}

/**
 * The site, or `undefined` if this request is not for it.
 *
 * A path that matches no file falls back to `index.html`, because a client-side
 * route is not a file on disk - the same reason the CloudFront setup maps 404 to
 * the index.
 */
export async function serveStatic(
  root: string,
  urlPath: string,
): Promise<HttpResponse | undefined> {
  const target = resolveWithin(root, urlPath === '/' ? '/index.html' : urlPath);
  if (!target) return undefined;

  const direct = await read(target);
  if (direct) return direct;

  // Only paths that could be a route get the index; a missing .js must stay a
  // 404, or a broken asset reference silently returns HTML and the console fills
  // with "Unexpected token '<'".
  if (path.extname(urlPath)) return undefined;
  return read(path.join(path.resolve(root), 'index.html'));
}
