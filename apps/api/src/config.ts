import { z } from 'zod';

/**
 * Environment validation at cold start.
 *
 * The alternative - reading `process.env.X` scattered through the code - fails
 * late, inside a handler, as "cannot read property of undefined". Here the
 * Lambda dies on its first invocation with the COMPLETE list of what is missing,
 * which is what someone who just cloned the repo actually needs to read.
 */
const envSchema = z.object({
  // The message goes on the schema, not just on `.min`: a MISSING variable and
  // an EMPTY one are different Zod issues, and only the schema-level message
  // covers both. Otherwise "missing" prints Zod's generic type error.
  MONGODB_URI: z.string({ error: 'required - MongoDB Atlas connection string' }).min(1),
  MONGODB_DB: z.string().min(1).default('expense_tracker'),
  JWT_SECRET: z
    .string({ error: 'required - at least 32 characters (see .env.example)' })
    .min(32, 'must be at least 32 characters (see .env.example)'),
  JWT_TTL: z.string().min(1).default('7d'),

  /**
   * Both providers are optional, and independently so.
   *
   * With neither key, /ai/categorize still works through the deterministic
   * pre-pass and the fallback, so the project runs end to end with no LLM
   * account at all. With one, you get that provider. With both, you get the
   * cascade - which is what makes the feature reliable on free tiers that
   * return 503 under load.
   */
  GEMINI_API_KEY: z.string().min(1).optional(),
  GEMINI_MODEL: z.string().min(1).default('gemini-3.5-flash-lite'),
  /**
   * A different model to fall back to, not a different provider.
   *
   * Groq has no multimodal model, so receipts have nowhere else to go. Google
   * pools capacity per model though, so a second model is a second queue -
   * measured, not assumed: one returned 503 in the same minute the other
   * answered in a second.
   */
  GEMINI_FALLBACK_MODEL: z.string().min(1).default('gemini-3.1-flash-lite'),

  /**
   * The second VENDOR for reading receipts. Optional, like every other key here.
   *
   * Without it the reader is Google-only: hedging two Gemini models survives a
   * congested model but not a revoked key, an exhausted daily quota, or a Google
   * outage. https://openrouter.ai/keys
   */
  OPENROUTER_API_KEY: z.string().optional(),
  /**
   * Free, image-capable, and picked by testing rather than by reading a table.
   *
   * The first choice - `google/gemma-4-31b-it:free` - was rate-limited upstream
   * on the first live call. Of the free vision models that answered, this one
   * returned well-formed JSON on every request shape tried; another returned
   * `"amount": ": 123.76"`. It is also the only candidate with no Google in it,
   * which is the entire point of this rung.
   */
  OPENROUTER_MODEL: z.string().min(1).default('minimax/minimax-m3:free'),
  GROQ_API_KEY: z.string().min(1).optional(),
  GROQ_MODEL: z.string().min(1).default('openai/gpt-oss-120b'),

  CORS_ORIGINS: z.string().default('http://localhost:5173'),
  PORT: z.coerce.number().int().positive().default(3000),
});

export type Config = Omit<z.infer<typeof envSchema>, 'CORS_ORIGINS'> & {
  corsOrigins: readonly string[];
  aiEnabled: boolean;
};

export class ConfigError extends Error {
  override readonly name = 'ConfigError';
}

/**
 * Pure: takes an environment, returns a config or throws. Testable without
 * touching process.env.
 */
export function buildConfig(env: NodeJS.ProcessEnv): Config {
  // An empty value in a .env file means "not set" - which is exactly how
  // .env.example ships ANTHROPIC_API_KEY. Without this, copying the example and
  // filling in only the required lines would fail validation on a variable that
  // is documented as optional. Stripping blanks first is what makes `.optional()`
  // and `.default()` behave the way anyone editing a dotenv file expects.
  const present = Object.fromEntries(
    Object.entries(env).filter(([, value]) => value !== undefined && value.trim() !== ''),
  );
  const parsed = envSchema.safeParse(present);

  if (!parsed.success) {
    const details = parsed.error.issues
      .map((issue) => `  - ${issue.path.join('.') || '(root)'}: ${issue.message}`)
      .join('\n');
    throw new ConfigError(
      `Invalid environment configuration:\n${details}\n\nCopy .env.example to .env and fill in the values.`,
    );
  }

  const { CORS_ORIGINS, ...rest } = parsed.data;
  return {
    ...rest,
    corsOrigins: CORS_ORIGINS.split(',')
      .map((origin) => origin.trim())
      .filter(Boolean),
    aiEnabled: Boolean(rest.GEMINI_API_KEY || rest.GROQ_API_KEY),
  };
}

let cached: Config | undefined;

/** Memoised: survives across invocations of the same Lambda container. */
export function getConfig(): Config {
  cached ??= buildConfig(process.env);
  return cached;
}
