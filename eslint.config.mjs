// ESLint flat config（需先 `pnpm install` 安装 eslint/prettier 后使用：pnpm run lint）。
// client.js 为浏览器端脚本（window/document 等全局），index.js 为 Node ESM。
export default [
  { ignores: ['node_modules/**'] },
  {
    files: ['**/*.js'],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
      globals: {
        window: 'readonly',
        document: 'readonly',
        navigator: 'readonly',
        fetch: 'readonly',
        console: 'readonly',
        setTimeout: 'readonly',
        clearTimeout: 'readonly',
        requestAnimationFrame: 'readonly',
        cancelAnimationFrame: 'readonly',
        URL: 'readonly',
        Blob: 'readonly',
        FileReader: 'readonly',
        React: 'readonly',
        globalThis: 'readonly',
        process: 'readonly',
        Buffer: 'readonly',
      },
    },
    rules: {
      'no-unused-vars': ['warn', { args: 'none', caughtErrors: 'none', varsIgnorePattern: '^(ignored|_)$' }],
      'no-undef': 'error',
    },
  },
  {
    files: ['client.js'],
    languageOptions: { sourceType: 'script' },
  },
];
