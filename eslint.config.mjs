import nextPlugin from '@next/eslint-plugin-next';
import reactPlugin from 'eslint-plugin-react';
import hooksPlugin from 'eslint-plugin-react-hooks';
import tsParser from '@typescript-eslint/parser';

export default [
    {
        ignores: ['.next/', 'node_modules/', 'coverage/'],
    },
    {
        name: 'invoice2e/base',
        files: ['**/*.{ts,tsx}'],
        languageOptions: {
            parser: tsParser,
            parserOptions: {
                ecmaFeatures: { jsx: true },
            },
        },
        plugins: {
            '@next/next': nextPlugin,
            react: reactPlugin,
            'react-hooks': hooksPlugin,
        },
        rules: {
            ...nextPlugin.configs.recommended.rules,
            ...nextPlugin.configs['core-web-vitals'].rules,
            ...hooksPlugin.configs.recommended.rules,
            '@next/next/no-html-link-for-pages': 'off',
            'no-console': 'warn',
            'no-debugger': 'error',
        },
        settings: {
            react: { version: 'detect' },
        },
    },
];
