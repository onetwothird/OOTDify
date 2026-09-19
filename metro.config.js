// Learn more: https://docs.expo.dev/guides/customizing-metro/
const { getDefaultConfig } = require("expo/metro-config");

const config = getDefaultConfig(__dirname);

// expo-sqlite on web loads a WASM build of SQLite (wa-sqlite). Metro must
// treat `.wasm` files as assets or bundling fails with
// "Unable to resolve module ./wa-sqlite/wa-sqlite.wasm".
config.resolver.assetExts.push("wasm");

module.exports = config;