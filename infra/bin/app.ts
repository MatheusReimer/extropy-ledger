import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { App } from 'aws-cdk-lib';
import { config as loadDotenv } from 'dotenv';
import { ExpenseTrackerStack } from '../lib/expense-tracker-stack.js';

const here = path.dirname(fileURLToPath(import.meta.url));
loadDotenv({ path: path.resolve(here, '../../.env'), quiet: true });

const REQUIRED = ['MONGODB_URI', 'JWT_SECRET'] as const;
const OPTIONAL = [
  'MONGODB_DB',
  'JWT_TTL',
  'GEMINI_API_KEY',
  'GEMINI_MODEL',
  'GEMINI_FALLBACK_MODEL',
  'OPENROUTER_API_KEY',
  'OPENROUTER_CATEGORIZE_MODEL',
  'OPENROUTER_RECEIPT_MODEL',
  'CORS_ORIGINS',
] as const;

const missing = REQUIRED.filter((key) => !process.env[key]);
if (missing.length > 0) {
  console.error(
    `\nDeploy aborted - required variables missing: ${missing.join(', ')}.\n` +
      'Fill in the .env at the repository root (see .env.example), or export them before deploying.\n',
  );
  process.exit(1);
}

const apiEnvironment: Record<string, string> = {};
for (const key of [...REQUIRED, ...OPTIONAL]) {
  const value = process.env[key];
  if (value) apiEnvironment[key] = value;
}

const app = new App();
new ExpenseTrackerStack(app, 'ExpenseTrackerStack', {
  apiEnvironment,
  env: {
    account: process.env['CDK_DEFAULT_ACCOUNT'],
    region: process.env['CDK_DEFAULT_REGION'] ?? 'us-east-1',
  },
});
