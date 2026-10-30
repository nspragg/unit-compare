import js from '@eslint/js';
import stylistic from '@stylistic/eslint-plugin';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['dist', 'coverage'] },
  js.configs.recommended,
  tseslint.configs.recommended,
  {
    plugins: { '@stylistic': stylistic },
    rules: {
      eqeqeq: 'error',
      'no-var': 'error',
      'one-var': ['error', 'never'],
      'prefer-const': 'error',
      'prefer-arrow-callback': 'error',
      '@stylistic/quotes': ['error', 'single', { avoidEscape: true }],
      '@stylistic/semi': 'error',
      '@stylistic/arrow-parens': 'error',
      '@stylistic/indent': ['error', 2]
    }
  }
);
