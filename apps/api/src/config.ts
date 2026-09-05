import { z } from 'zod';

const envSchema = z.object({
  MONGODB_URI: z.string({ error: 'required - MongoDB Atlas connection string' }).min(1),
  MONGODB_DB: z.string().min(1).default('expense_tracker'),
  JWT_SECRET: z
    .string({ error: 'required - at least 32 characters (see .env.example)' })
    .min(32, 'must be at least 32 characters (see .env.example)'),
  JWT_TTL: z.string().min(1).default('7d'),

  GEMINI_API_KEY: z.string().min(1).optional(),
  GEMINI_MODEL: z.string().min(1).default('gemini-3.5-flash-lite'),
  GEMINI_FALLBACK_MODEL: z.string().min(1).default('gemini-3.1-flash-lite'),

  OPENROUTER_API_KEY: z.string().min(1).optional(),
  OPENROUTER_CATEGORIZE_MODEL: z.string().min(1).default('nvidia/nemotron-3-super-120b-a12b:free'),
  OPENROUTER_RECEIPT_MODEL: z.string().min(1).default('minimax/minimax-m3:free'),

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

export function buildConfig(env: NodeJS.ProcessEnv): Config {
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
    aiEnabled: Boolean(rest.GEMINI_API_KEY || rest.OPENROUTER_API_KEY),
  };
}

let cached: Config | undefined;

export function getConfig(): Config {
  cached ??= buildConfig(process.env);
  return cached;
}
