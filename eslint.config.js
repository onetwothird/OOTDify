// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require("eslint-config-expo/flat");

module.exports = defineConfig([
  expoConfig,
  {
    ignores: ["dist/*", ".expo/*", "backend/.venv/*"],
  },
  {
    // Node CLI scripts (CommonJS): `__dirname` is provided by Node at runtime
    // but isn't part of the Expo app's global environment.
    files: ["scripts/**/*.js"],
    languageOptions: {
      globals: {
        __dirname: "readonly",
      },
    },
  },
]);
