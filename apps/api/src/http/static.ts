import { readFile } from 'node:fs/promises';
import path from 'node:path';
import type { HttpResponse } from './types.js';

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

const IMMUTABLE = 'public, max-age=31536000, immutable';
const REVALIDATE = 'no-cache';

const cache = new Map<string, { body: string; type: string; base64: boolean }>();

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

export async function serveStatic(
  root: string,
  urlPath: string,
): Promise<HttpResponse | undefined> {
  const target = resolveWithin(root, urlPath === '/' ? '/index.html' : urlPath);
  if (!target) return undefined;

  const direct = await read(target);
  if (direct) return direct;

  if (path.extname(urlPath)) return undefined;
  return read(path.join(path.resolve(root), 'index.html'));
}
