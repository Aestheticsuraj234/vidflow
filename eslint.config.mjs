import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {ignores: ['**/dist/**', '**/.next/**', '**/node_modules/**', '**/next-env.d.ts']},
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: {globals: {...globals.node, ...globals.browser}},
    rules: {
      // Google TypeScript Style Guide: no `any`, no unused vars, prefer const.
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-unused-vars': ['error', {argsIgnorePattern: '^_'}],
      '@typescript-eslint/consistent-type-imports': 'error',
      'prefer-const': 'error',
      'no-var': 'error',
      eqeqeq: ['error', 'always'],
    },
  },
);
