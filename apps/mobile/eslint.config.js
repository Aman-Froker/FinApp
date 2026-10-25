const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');

module.exports = defineConfig([
  expoConfig,
  {
    // The import plugin's resolver does not read package `exports` maps or follow `export *` of
    // enums; tsc checks both.
    rules: { 'import/no-unresolved': 'off', 'import/namespace': 'off' },
  },
  { ignores: ['dist/*', '.expo/*'] },
]);
