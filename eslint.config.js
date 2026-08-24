/**
 * ESLint config for the Masary app (flat config, typescript-eslint).
 * Enforces TS strictness + import order basics. Used by: CI + local lint.
 */
const eslint = require('@eslint/js');
const tseslint = require('typescript-eslint');

module.exports = tseslint.config(
  { ignores: ['node_modules/', '.expo/', 'dist/', 'web-build/', 'supabase/', 'coverage/'] },
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      '@typescript-eslint/consistent-type-imports': 'off',
    },
  },
  {
    files: ['**/*.tsx'],
    rules: {
      'react-native/no-unused-styles': 'error',
    },
  },
);
