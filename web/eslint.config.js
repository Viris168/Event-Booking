import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import react from 'eslint-plugin-react'

/**
 * The point of this file is `no-undef`.
 *
 * `vite build` compiles JSX without resolving identifiers, so a component that
 * references a name nothing defines builds green and throws ReferenceError the
 * moment it renders. That happened twice while wiring the organiser dashboard
 * to the API - an import removed while six variables still used it, and a
 * computation deleted with its call sites left behind. Both were invisible
 * until the page was opened in a browser.
 *
 * Everything else here is secondary to that one rule.
 */
export default [
  { ignores: ['dist/**', 'node_modules/**'] },

  {
    files: ['**/*.{js,jsx}'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: {
        ...globals.browser,
        // Vite injects these; without them every import.meta.env read is an error.
        ...globals.es2021,
      },
      parserOptions: {
        ecmaFeatures: { jsx: true },
      },
    },
    plugins: {
      react,
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      ...js.configs.recommended.rules,
      ...reactHooks.configs.recommended.rules,

      // Without this, no-unused-vars cannot see that `<Tag>` uses `Tag`, and
      // reports every component referenced only from JSX as dead. Acting on one
      // of those reports is how `as: Tag` became `as: _Tag` while the JSX below
      // still said `<Tag>` - a false positive turned into a real ReferenceError.
      'react/jsx-uses-vars': 'error',
      'react/jsx-uses-react': 'error',

      // JSX makes a component "unused" to the base rule, which would bury the
      // real findings under false ones. Capitalised names are components.
      'no-unused-vars': ['error', {
        varsIgnorePattern: '^[A-Z_]',
        argsIgnorePattern: '^_',
      }],

      // The rules below are eslint-plugin-react-hooks v7's opinionated additions.
      // They fire 20+ times across code that has been working for months -
      // calling setLoading(true) at the top of a fetching effect is the pattern
      // every page here uses. They are worth reading, not worth blocking a
      // build over, and burying no-undef under twenty of them would defeat the
      // reason this config exists.
      'react-hooks/set-state-in-effect': 'warn',
      'react-hooks/purity': 'warn',
      'react-hooks/preserve-manual-memoization': 'warn',
      'react-hooks/refs': 'warn',
      'react-hooks/exhaustive-deps': 'warn',

      // This one stays an error: calling a hook conditionally genuinely breaks
      // React's state ordering, unlike the stylistic rules above.
      'react-hooks/rules-of-hooks': 'error',

      'react-refresh/only-export-components': 'off',
    },
  },
]
