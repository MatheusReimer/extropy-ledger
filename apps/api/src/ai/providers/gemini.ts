import { ApiError, GoogleGenAI, ThinkingLevel } from '@google/genai';
import { getConfig } from '../../config.js';
import { logger, describeError } from '../../lib/logger.js';
import { buildSystemPrompt, buildUserPrompt } from '../prompt.js';
import { geminiResponseSchema } from '../schema.js';
import { parseModelResponse } from '../parse.js';
import { buildReceiptSystemPrompt, geminiReceiptSchema } from '../receipt-schema.js';
import { parseExtractedExpense } from '../receipt-parse.js';
import type { AskModel, ReadOutcome, ReadReceipt, ReceiptFile } from './types.js';

/**
 * Thinking tokens count against `maxOutputTokens`.
 *
 * This is not theoretical: at 128 the model spent the whole budget reasoning and
 * returned the truncated fragment `"Here"` instead of JSON. The answer itself is
 * ~30 tokens; the rest is headroom for reasoning we asked to be minimal but
 * cannot switch off.
 */
const MAX_OUTPUT_TOKENS = 512;

let client: GoogleGenAI | undefined;

export const askGemini: AskModel = async (input, allowedCategories, options) => {
  const config = getConfig();
  if (!config.GEMINI_API_KEY) return undefined;

  // Deliberately no `httpOptions.timeout`: the SDK forwards it as a server-side
  // deadline, and the current Flash models reject anything under ten seconds
  // ("Manually set deadline 5s is too short"). The chain's AbortSignal enforces
  // our own, shorter budget client-side instead.
  client ??= new GoogleGenAI({ apiKey: config.GEMINI_API_KEY });

  try {
    const response = await client.models.generateContent({
      model: config.GEMINI_MODEL,
      contents: buildUserPrompt(input),
      config: {
        systemInstruction: buildSystemPrompt(allowedCategories),
        responseMimeType: 'application/json',
        responseSchema: geminiResponseSchema(allowedCategories),
        maxOutputTokens: MAX_OUTPUT_TOKENS,
        // Gemini 3.x replaced the numeric `thinkingBudget` with a level and
        // rejects `thinkingBudget: 0` outright. MINIMAL is as close to "just
        // answer" as the current models allow.
        thinkingConfig: { thinkingLevel: ThinkingLevel.MINIMAL },
        // Classification wants the most likely label, not a creative one.
        temperature: 0,
        ...(options?.signal ? { abortSignal: options.signal } : {}),
      },
    });

    const parsed = parseModelResponse(response.text, allowedCategories);
    logger.info('ai provider answered', {
      provider: 'gemini',
      model: config.GEMINI_MODEL,
      matched: Boolean(parsed),
      inputTokens: response.usageMetadata?.promptTokenCount,
      outputTokens: response.usageMetadata?.candidatesTokenCount,
    });
    return parsed;
  } catch (error) {
    // 429 (quota) and 5xx (congestion) are the routine free-tier failures and
    // exactly what the next provider exists to cover, so they are warnings. A 400
    // is our own bug in the request and deserves an error-level line.
    if (error instanceof ApiError) {
      const routine = error.status === 429 || error.status >= 500;
      logger[routine ? 'warn' : 'error']('ai provider failed', {
        provider: 'gemini',
        status: error.status,
        message: error.message.slice(0, 200),
      });
    } else {
      logger.warn('ai provider failed', { provider: 'gemini', ...describeError(error) });
    }
    return undefined;
  }
};

/**
 * Reading a document needs more room than classifying a string.
 *
 * Seven fields instead of two, and the model reasons over a whole page before
 * answering. Measured healthy runs land between one and five seconds; the
 * ceiling exists so a congested free tier fails inside the Lambda's timeout
 * rather than at it.
 */
const RECEIPT_MAX_OUTPUT_TOKENS = 1_024;

/**
 * The file goes inline as base64 rather than through the Files API.
 *
 * Files API would mean an upload, a handle, and a lifecycle to clean up, for a
 * document that is read exactly once and then deliberately forgotten. Inline
 * costs one request and leaves nothing behind - which is the point.
 */
/**
 * How long to wait before trying again after a transient failure.
 *
 * Short, because this runs while someone watches a progress indicator. Long
 * enough that an instantaneous retry does not simply hit the same overloaded
 * shard.
 */
const RETRY_DELAY_MS = 700;

/**
 * Tries per model before moving to the next one.
 *
 * Two, and only for congestion: the first call plus one retry to ride out a busy
 * shard. A model that answered "no expense here" does not get a second ask -
 * that is what the NEXT model is for.
 */
const ATTEMPTS_PER_MODEL = 2;

/**
 * How long the primary gets on its own before the fallback joins it.
 *
 * This is a tail-latency problem, not an availability one. Measured against the
 * live API, ten reads of the same receipt returned in 2.3s, 2.6s, 3.2s, 3.5s,
 * 4.0s, 4.6s, 5.4s, 5.6s, 14.6s and 27.4s - a median around four seconds with a
 * tail past twenty. Run sequentially inside a 25s budget, that 27.4s call takes
 * the whole allowance and the fallback never gets asked, so a working model and
 * a perfectly legible receipt still produce "the reader is busy".
 *
 * So after this long the fallback is started ALONGSIDE the primary rather than
 * after it, and the first usable answer wins. Six seconds sits above the median
 * on purpose: the common case still costs one request, and only the slow tail
 * pays for two.
 */
const HEDGE_AFTER_MS = 6_000;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** 429 and 5xx are congestion; anything else is a real answer or our own bug. */
const isTransient = (error: unknown): boolean =>
  error instanceof ApiError && (error.status === 429 || error.status >= 500);

/**
 * An outcome plus whether asking this same model again could plausibly differ.
 *
 * Two separate questions that the first version conflated: whose fault the
 * failure was (`ReadOutcome`) and whether repeating the request is worth the
 * latency (`retrySameModel`). A 404 is nobody's photo's fault AND pointless to
 * repeat; congestion is nobody's fault and very much worth repeating.
 */
type Attempt = { outcome: ReadOutcome; retrySameModel: boolean };

async function readOnce(
  model: string,
  file: ReceiptFile,
  allowedCategories: readonly string[],
  apiKey: string,
  signal: AbortSignal | undefined,
): Promise<Attempt> {
  client ??= new GoogleGenAI({ apiKey });

  try {
    const response = await client.models.generateContent({
      model,
      contents: [
        {
          role: 'user',
          parts: [
            { inlineData: { mimeType: file.mimeType, data: file.bytes.toString('base64') } },
            { text: 'Extract the expense from this receipt or invoice.' },
          ],
        },
      ],
      config: {
        systemInstruction: buildReceiptSystemPrompt(allowedCategories),
        responseMimeType: 'application/json',
        responseSchema: geminiReceiptSchema(allowedCategories),
        maxOutputTokens: RECEIPT_MAX_OUTPUT_TOKENS,
        temperature: 0,
        ...(signal ? { abortSignal: signal } : {}),
      },
    });

    const parsed = (() => {
      try {
        return response.text
          ? parseExtractedExpense(JSON.parse(response.text), allowedCategories)
          : undefined;
      } catch {
        return undefined;
      }
    })();

    logger.info('ai receipt read', {
      provider: 'gemini',
      model,
      mimeType: file.mimeType,
      bytes: file.bytes.length,
      matched: Boolean(parsed),
      confidence: parsed?.confidence,
      inputTokens: response.usageMetadata?.promptTokenCount,
      outputTokens: response.usageMetadata?.candidatesTokenCount,
    });

    // The one and only route to `unreadable`: the model answered, and what came
    // back held no expense. Every other exit is `unavailable`, because a request
    // that threw never got as far as judging the document - a dead model name
    // and a congested shard both look identical from where the user is sitting,
    // and neither is their photo's fault. Blaming the photo for our own 404 is
    // the exact failure this type was introduced to stop.
    return {
      outcome: parsed ? { status: 'ok', fields: parsed } : { status: 'unreadable' },
      retrySameModel: false,
    };
  } catch (error) {
    if (error instanceof ApiError) {
      // Severity, not outcome. A 429 is weather; a 400 or a 404 is a bug in our
      // own request or a model name that no longer exists, and that should be
      // loud in the log rather than quietly absorbed.
      const transient = isTransient(error);
      logger[transient ? 'warn' : 'error']('ai receipt failed', {
        provider: 'gemini',
        model,
        status: error.status,
        message: error.message.slice(0, 200),
      });
      // Congestion may clear in 700ms; a malformed request or a retired model
      // name will fail identically and there is no point paying for it twice.
      return { outcome: { status: 'unavailable' }, retrySameModel: transient };
    }

    /*
     * A hedge that lost was cancelled on purpose, so it is not a failure and
     * must not read like one. Logging every cancelled hedge as "ai receipt
     * failed" would put a warning in the log on the happy path, which is how
     * logs stop being worth reading.
     */
    if (signal?.aborted) {
      logger.info('ai receipt cancelled', { provider: 'gemini', model });
      return { outcome: { status: 'unavailable' }, retrySameModel: false };
    }

    logger.warn('ai receipt failed', { provider: 'gemini', model, ...describeError(error) });
    // A network-level failure is the one class most likely to be a blip.
    return { outcome: { status: 'unavailable' }, retrySameModel: true };
  }
}

/**
 * Same model, then same model again, then a different one.
 *
 * The categorisation path gets a second provider; this one cannot, because Groq
 * has no multimodal model and there is nowhere else to go. What it has instead
 * is a second MODEL - and that is not a token gesture: benchmarking these models
 * showed one returning 503 in the same minute another answered in a second.
 * Google's capacity is pooled per model, so switching model genuinely switches
 * queue.
 *
 * The ladder stops the moment it has an answer, and stops immediately on
 * `unreadable` - retrying a document the model has already read and rejected
 * would burn the request budget to arrive at the same conclusion.
 */
type Attempted = { index: number; outcome: ReadOutcome };

/**
 * Resolves the moment any attempt produces a read, rather than when all finish.
 *
 * `Promise.all` was the wrong tool and hid the very bug this exists to fix: it
 * waits for the slowest, so a primary that hangs holds up an answer the fallback
 * already has. Waiting for the rest is only needed to tell "nobody could read
 * it" apart from "nobody could be reached".
 */
function firstRead(attempts: readonly Promise<Attempted>[]): Promise<{
  won?: Attempted;
  all: Attempted[];
}> {
  return new Promise((resolve) => {
    const all: Attempted[] = [];
    let pending = attempts.length;
    for (const attempt of attempts) {
      void attempt.then((entry) => {
        all.push(entry);
        pending -= 1;
        if (entry.outcome.status === 'ok') resolve({ won: entry, all });
        else if (pending === 0) resolve({ all });
      });
    }
  });
}

/** Every attempt at one model: the call, plus one retry if congestion could clear. */
async function readWithModel(
  model: string,
  file: ReceiptFile,
  allowedCategories: readonly string[],
  apiKey: string,
  signal: AbortSignal | undefined,
): Promise<ReadOutcome> {
  let verdict: ReadOutcome = { status: 'unavailable' };

  for (let attempt = 0; attempt < ATTEMPTS_PER_MODEL; attempt += 1) {
    if (signal?.aborted) break;
    if (attempt > 0) await sleep(RETRY_DELAY_MS);

    const tried = await readOnce(model, file, allowedCategories, apiKey, signal);
    verdict = tried.outcome;

    // Only a failure that could genuinely go the other way earns a second try at
    // the SAME model. A model that read the document and found nothing will say
    // exactly that again, and so will a 404.
    if (!tried.retrySameModel) break;
  }

  return verdict;
}

/**
 * Two models, started sequentially but overlapped when the first one is slow.
 *
 * The fallback begins early if the primary fails outright, and after
 * `HEDGE_AFTER_MS` if it is merely taking its time - so a slow primary is
 * rescued rather than fatal. Whichever returns a usable read first wins, and the
 * loser is cancelled so a hedge that lost does not keep a Lambda alive.
 */
export const readReceiptWithGemini: ReadReceipt = async (file, allowedCategories, options) => {
  const config = getConfig();
  if (!config.GEMINI_API_KEY) return { status: 'unavailable' };

  // Deduped, so pointing both variables at the same model does not silently
  // collapse the ladder to a single rung.
  const models = [...new Set([config.GEMINI_MODEL, config.GEMINI_FALLBACK_MODEL])];
  const apiKey = config.GEMINI_API_KEY;

  // An `abort` listener never fires for a signal that has ALREADY aborted, so a
  // caller who gave up before we started would otherwise get a full round of
  // requests made on its behalf.
  if (options?.signal?.aborted) return { status: 'unavailable' };

  const controllers = models.map(() => new AbortController());
  // The caller's overall budget still bounds everything below it.
  const onAbort = () => controllers.forEach((controller) => controller.abort());
  options?.signal?.addEventListener('abort', onAbort, { once: true });

  const started = new Map<number, Promise<ReadOutcome>>();
  const start = (index: number): Promise<ReadOutcome> => {
    const existing = started.get(index);
    if (existing) return existing;
    const model = models[index];
    const controller = controllers[index];
    if (model === undefined || controller === undefined) return Promise.resolve({ status: 'unavailable' });
    const run = readWithModel(model, file, allowedCategories, apiKey, controller.signal);
    started.set(index, run);
    return run;
  };

  try {
    const primary = start(0).then((outcome) => ({ index: 0, outcome }));
    if (models.length === 1) return (await primary).outcome;

    // Whichever happens first: the primary settling, or the hedge falling due.
    const hedgeTimer = sleep(HEDGE_AFTER_MS).then(() => 'hedge' as const);
    const firstEvent = await Promise.race([primary, hedgeTimer]);

    if (firstEvent !== 'hedge' && firstEvent.outcome.status === 'ok') {
      return firstEvent.outcome;
    }
    if (firstEvent === 'hedge') logger.info('ai receipt hedged', { after: HEDGE_AFTER_MS });

    const fallback = start(1).then((outcome) => ({ index: 1, outcome }));
    const { won, all: settled } = await firstRead([primary, fallback]);

    if (won) {
      if (won.index > 0) logger.info('ai receipt recovered', { model: models[won.index] });
      return won.outcome;
    }

    /**
     * Telling someone their receipt is illegible is a claim, and it needs every
     * model to have actually looked and agreed.
     *
     * If one gave up but another was never reached, the document may well be
     * readable by the model we could not talk to - so that mixed case stays
     * `unavailable`, which offers a retry, rather than a verdict we cannot
     * support.
     */
    const foundNothing = settled.some((entry) => entry.outcome.status === 'unreadable');
    const neverAnswered = settled.some((entry) => entry.outcome.status === 'unavailable');
    const outcome: ReadOutcome =
      foundNothing && !neverAnswered ? { status: 'unreadable' } : { status: 'unavailable' };

    logger.warn('ai receipt found nothing', {
      models: models.length,
      outcome: outcome.status,
      foundNothing,
      neverAnswered,
    });
    return outcome;
  } finally {
    // A hedge that lost is pure waste from here on.
    controllers.forEach((controller) => controller.abort());
    options?.signal?.removeEventListener('abort', onAbort);
  }
};
