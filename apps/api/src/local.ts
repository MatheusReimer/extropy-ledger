import { createServer, type IncomingMessage } from 'node:http';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { config as loadDotenv } from 'dotenv';

// The .env lives at the ROOT of the monorepo (one file, both apps). Loaded only
// here - on Lambda the variables come from the environment and `dotenv` never
// enters the bundle.
const here = path.dirname(fileURLToPath(import.meta.url));
loadDotenv({ path: path.resolve(here, '../../../.env'), quiet: true });

// Imported after dotenv, because `config.ts` reads process.env on first use.
const { getConfig } = await import('./config.js');
const { closeDb } = await import('./db/client.js');
const { resolveCorsHeaders } = await import('./http/cors.js');
const { toErrorResponse } = await import('./http/errors.js');
const { createDispatcher } = await import('./http/router.js');
const { describeError, logger } = await import('./lib/logger.js');
const { routes } = await import('./routes/index.js');

/**
 * A dev server that mounts the SAME routes as the Lambda.
 *
 * The challenge requires `pnpm install && pnpm dev` to bring the app up. A mock
 * API for development would be a second implementation to keep in sync; here the
 * only difference between dev and production is how a request reaches `dispatch`.
 */
const dispatch = createDispatcher(routes);

const readBody = (message: IncomingMessage): Promise<string> =>
  new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    message.on('data', (chunk: Buffer) => chunks.push(chunk));
    message.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    message.on('error', reject);
  });

function start(): void {
  let config;
  try {
    config = getConfig();
  } catch (error) {
    // A configuration failure has to be READABLE: the ConfigError message lists
    // exactly what is missing from .env.
    console.error(`\n${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
    return;
  }

  const server = createServer((incoming, outgoing) => {
    void (async () => {
      const url = new URL(incoming.url ?? '/', `http://localhost:${config.PORT}`);
      const corsHeaders = resolveCorsHeaders(incoming.headers.origin, config.corsOrigins);

      try {
        if (incoming.method === 'OPTIONS') {
          outgoing.writeHead(204, corsHeaders).end();
          return;
        }

        const response = await dispatch({
          method: incoming.method ?? 'GET',
          path: url.pathname,
          query: Object.fromEntries(url.searchParams),
          headers: incoming.headers as Record<string, string | undefined>,
          rawBody: await readBody(incoming),
        });

        const payload = response.body === undefined ? undefined : JSON.stringify(response.body);
        outgoing.writeHead(response.status, {
          ...corsHeaders,
          ...(payload === undefined ? {} : { 'Content-Type': 'application/json' }),
          ...response.headers,
        });
        outgoing.end(payload);
      } catch (error) {
        // Same as the Lambda adapter: the dispatcher already owns request-level
        // failures, so reaching here means the socket itself misbehaved.
        logger.error('unhandled local error', describeError(error));
        const response = toErrorResponse(error);
        outgoing.writeHead(response.status, { ...corsHeaders, 'Content-Type': 'application/json' });
        outgoing.end(JSON.stringify(response.body));
      }
    })();
  });

  server.listen(config.PORT, () => {
    logger.info('api listening', {
      url: `http://localhost:${config.PORT}`,
      aiEnabled: config.aiEnabled,
    });
    if (!config.aiEnabled) {
      console.warn('No GEMINI_API_KEY or GROQ_API_KEY - /ai/categorize will use rules + fallback only.');
    }
  });

  const shutdown = (): void => {
    server.close(() => {
      void closeDb().finally(() => process.exit(0));
    });
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

start();
