// SPDX-License-Identifier: MIT
export default [
    {
        ignores: [
            'build/**',
            'locale/**',
            'node_modules/**',
        ],
    },
    {
        files: ['**/*.js'],
        languageOptions: {
            ecmaVersion: 2023,
            sourceType: 'module',
            globals: {
                global: 'readonly',
                logError: 'readonly',
                TextDecoder: 'readonly',
                TextEncoder: 'readonly',
            },
        },
        rules: {
            'array-callback-return': 'error',
            'consistent-return': 'error',
            'eqeqeq': ['error', 'smart'],
            'no-else-return': 'error',
            'no-lonely-if': 'error',
            'no-param-reassign': 'error',
            'no-undef': 'error',
            'no-unused-vars': ['error', {argsIgnorePattern: '^_'}],
            'no-var': 'error',
            'object-shorthand': 'error',
            'prefer-arrow-callback': 'error',
            'prefer-const': ['error', {destructuring: 'all'}],
            'prefer-template': 'error',
            quotes: ['error', 'single', {avoidEscape: true}],
            semi: ['error', 'always'],
        },
    },
];
