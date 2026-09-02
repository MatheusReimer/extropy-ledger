import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { App } from 'aws-cdk-lib';
import { config as loadDotenv } from 'dotenv';
import { ExpenseTrackerStack } from '../lib/expense-tracker-stack.js';

const here = path.dirname(fileURLToPath(import.meta.url));
loadDotenv({ path: path.resolve(here, '../../.env'), quiet: true });

/**
 * Secrets enter as Lambda environment variables, read from the deployer's
 * environment.
 *
 * A conscious trade-off, documented in the README: the values end up in the
 * CloudFormation template (inside cdk.out/, which is gitignored) and visible in
 * the Lambda console to anyone who already has account access. The next step,
 * out of scope for this MVP, is an SSM Parameter Store SecureString read at cold
 * start - Secrets Manager is NOT free tier ($0.40 per secret per month after the
 * 30-day trial).
 */
const REQUIRED = ['MONGODB_URI', 'JWT_SECRET'] as const;
const OPTIONAL = [
  'MONGODB_DB',
  'JWT_TTL',
  'GEMINI_API_KEY',
  'GEMINI_MODEL',
  'GEMINI_FALLBACK_MODEL',
  'GROQ_API_KEY',
  'GROQ_MODEL',
  'CORS_ORIGINS',
] as const;

const missing = REQUIRED.filter((key) => !process.env[key]);
if (missing.length > 0) {
  // Failing at synth with the list of what is missing beats discovering it from
  // a Lambda 500 ten minutes after the deploy finishes.
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
