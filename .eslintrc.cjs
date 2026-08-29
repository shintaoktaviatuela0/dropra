module.exports = {
	root: true,
	parser: '@typescript-eslint/parser',
	parserOptions: {
		ecmaVersion: 2022,
		sourceType: 'module'
	},
	plugins: ['@typescript-eslint'],
	env: {
		node: true,
		es2022: true
	},
	extends: ['eslint:recommended', 'plugin:@typescript-eslint/recommended'],
	rules: {
		'@typescript-eslint/no-explicit-any': 'off',
		'@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
		'@typescript-eslint/no-non-null-assertion': 'off',
		'no-empty': ['error', { allowEmptyCatch: true }]
	},
	ignorePatterns: ['dist/', 'node_modules/', 'public/', 'data/']
};
