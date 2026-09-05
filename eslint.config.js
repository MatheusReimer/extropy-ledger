// @ts-check
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import prettier from 'eslint-config-prettier';

export default tseslint.config(
  { ignores: ['**/dist/**', '**/cdk.out/**', '**/node_modules/**', '**/coverage/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      '@typescript-eslint/consistent-type-imports': 'error',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      'no-console': ['warn', { allow: ['warn', 'error'] }],
      // An empty catch is the intended idiom for best-effort localStorage writes:
      // storage can throw in private mode, and there is nothing useful to do about it.
      'no-empty': ['error', { allowEmptyCatch: true }],
    },
  },
  // The hook rules only make sense where the components live, and this is the
  // guard that was missing: `exhaustive-deps` is what catches a stale closure in
  // an effect, which no amount of type checking will.
  {
    files: ['apps/web/src/**/*.{ts,tsx}'],
    plugins: { 'react-hooks': reactHooks },
    rules: {
      ...reactHooks.configs.recommended.rules,
    },
  },
  // Last, so formatting opinions never fight the formatter.
  prettier,
);
