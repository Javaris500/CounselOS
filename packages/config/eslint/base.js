import js from '@eslint/js';
import tseslint from 'typescript-eslint';

/**
 * Shared flat config. Apps extend this and add their own overrides.
 *
 * The rules here are the ones that encode architecture decisions, not style.
 * Style is Prettier's job and is not argued about in review.
 */
export const base = tseslint.config(
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      // Unused args are normal in guards/interceptors implementing an interface.
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrors: 'all', caughtErrorsIgnorePattern: '^_' },
      ],

      // An empty catch swallows the error and the correlation ID with it.
      // 05 §1D: every throw goes through AppException; nothing is silently eaten.
      'no-empty': ['error', { allowEmptyCatch: false }],

      // console.log is on the PR review checklist in 01 Part 4. The logger
      // carries the correlation ID and masks PII; console.log does neither.
      'no-console': ['error', { allow: ['warn', 'error'] }],

      'no-restricted-syntax': [
        'error',
        {
          selector: "NewExpression[callee.name='Date'][arguments.length=0]",
          message:
            'Inject a clock instead of calling new Date() directly. Deadline urgency and TREC date math must be testable at a pinned time (10-tdd-guide.md).',
        },
      ],
    },
  },
  {
    // Test files relax the rules that only make sense in application code.
    files: ['**/*.spec.ts', '**/*.e2e-spec.ts', '**/__tests__/**', '**/test/**'],
    rules: {
      'no-console': 'off',
      'no-restricted-syntax': 'off',
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-non-null-assertion': 'off',
    },
  },
  {
    ignores: ['dist/**', '.next/**', 'coverage/**', 'node_modules/**', '**/*.config.js', '**/*.config.mjs'],
  },
);

export default base;
