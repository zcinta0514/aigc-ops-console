import js from '@eslint/js'
import ts from 'typescript-eslint'
import vue from 'eslint-plugin-vue'
export default ts.config(
  { ignores: ['node_modules/**', 'dist/**', 'dist-single/**', 'deliverables/**', 'docs/**', 'data/**', 'playwright-report/**', 'test-results/**'] },
  js.configs.recommended,
  ...ts.configs.recommended,
  ...vue.configs['flat/essential'],
  { files: ['**/*.vue'], languageOptions: { parserOptions: { parser: ts.parser } }, rules: { 'no-undef': 'off' } },
  { rules: { 'vue/multi-word-component-names': 'off', '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }] }, languageOptions: { globals: { process: 'readonly', console: 'readonly', document: 'readonly', window: 'readonly', setTimeout: 'readonly', ResizeObserver: 'readonly' } } },
)
