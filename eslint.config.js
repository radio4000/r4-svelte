import prettier from 'eslint-config-prettier'
import js from '@eslint/js'
import svelte from 'eslint-plugin-svelte'
import globals from 'globals'
import ts from 'typescript-eslint'
import e18e from '@e18e/eslint-plugin'
import pluginQuery from '@tanstack/eslint-plugin-query'

export default ts.config(
	js.configs.recommended,
	...ts.configs.recommended,
	...svelte.configs['flat/recommended'],
	e18e.configs.recommended,
	prettier,
	...svelte.configs['flat/prettier'],
	...pluginQuery.configs['flat/recommended'],

	{
		languageOptions: {
			globals: {
				...globals.browser,
				...globals.node,
				__GIT_INFO__: 'readonly',
				__REPO_URL__: 'readonly'
			}
		}
	},
	{
		files: ['**/*.svelte'],

		languageOptions: {
			parserOptions: {
				parser: ts.parser
			}
		}
	},
	{
		files: ['**/*.svelte.ts'],

		languageOptions: {
			parserOptions: {
				parser: ts.parser
			}
		}
	},
	{
		rules: {
			'@typescript-eslint/no-unused-vars': 'warn',
			'svelte/no-navigation-without-resolve': 'off'
		}
	},
	{
		ignores: ['build/', '.svelte-kit/', 'dist/', 'bin/', 'src/paraglide/', 'src/lib/paraglide/']
	}
)
