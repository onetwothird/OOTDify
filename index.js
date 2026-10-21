// C:\OOTDify\index.js
// App entry. Metro resolves `main` from package.json here; the Blob global
// setup must evaluate before anything else (it installs expo-blob as
// globalThis.Blob so fetch responses skip React Native's base64 round-trip —
// see the module for details), then the router takes over as usual.
import "./src/shared/lib/setupBlobGlobal";
import "expo-router/entry";
