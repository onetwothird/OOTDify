// C:\OOTDify\scripts\dev.js
// Dev launcher: starts the Flask AI backend (backend/app.py) and the Expo dev
// server (expo start) together from a single command. No extra npm packages —
// just child processes with prefixed, interleaved output.
//
// Usage:
//   node scripts/dev.js          # backend + Expo
//   node scripts/dev.js backend  # backend only
//   node scripts/dev.js expo     # Expo only
//
// The npm scripts (`npm run dev`, `npm run backend`, `npm run expo`) map to it.
//
// Design notes:
//   * Prefers the backend virtualenv (`backend/.venv`) so `python` on PATH is
//     never assumed; falls back to `python` (Windows) / `python3` (macOS/Linux).
//   * Ctrl+C (SIGINT) stops every child; if one process dies the other is shut
//     down too, so a stale Flask server never keeps holding port 5000.

const { spawn } = require("child_process");
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const backendDir = path.join(root, "backend");
const isWin = process.platform === "win32";

const requested = process.argv[2];
const runBackend = requested === undefined || requested === "backend";
const runExpo = requested === undefined || requested === "expo";

const children = [];
let shuttingDown = false;

function prefix(label, color) {
  const dim = color ? `\x1b[2m` : "";
  const reset = `\x1b[0m`;
  return `${dim}[${color}${label}${reset}${dim}]${reset} `;
}

function spawnLabelled(command, args, cwd, label, color) {
  const child = spawn(command, args, {
    cwd,
    stdio: ["inherit", "pipe", "pipe"],
    shell: isWin && command === "python", // resolve venv .exe under cmd on Windows
    windowsHide: true,
  });
  const tag = prefix(label, color);
  child.stdout.on("data", (chunk) =>
    chunk
      .toString()
      .split(/\r?\n/)
      .filter(Boolean)
      .forEach((line) => process.stdout.write(tag + line + "\n")),
  );
  child.stderr.on("data", (chunk) =>
    chunk
      .toString()
      .split(/\r?\n/)
      .filter(Boolean)
      .forEach((line) => process.stderr.write(tag + line + "\n")),
  );
  child.on("error", (err) => {
    console.error(tag + `failed to start: ${err.message}`);
    shutdown(1);
  });
  child.on("exit", (code, signal) => {
    console.log(tag + `exited (${signal || code})`);
    // If one process dies and we are not already tearing down, stop everything.
    if (!shuttingDown) shutdown(code === 0 ? 0 : 1);
  });
  children.push(child);
  return child;
}

function resolvePython() {
  const venvPythons = [
    path.join(backendDir, ".venv", "Scripts", "python.exe"), // Windows
    path.join(backendDir, ".venv", "bin", "python"), // macOS/Linux
  ];
  const venv = venvPythons.find((p) => fs.existsSync(p));
  if (venv) return [venv, []];
  const fallback = isWin ? "python" : "python3";
  if (process.env.PYTHON) return [process.env.PYTHON, []];
  return [fallback, []];
}

function shutdown(code) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log("\nStopping dev servers…");
  for (const child of children) {
    if (child && !child.killed) child.kill("SIGTERM");
  }
  // Give children a moment to die gracefully before we exit.
  setTimeout(() => process.exit(code), 800);
}

process.on("SIGINT", () => shutdown(0));
process.on("SIGTERM", () => shutdown(0));

if (runBackend) {
  const [command, extraArgs] = resolvePython();
  spawnLabelled(
    command,
    [...extraArgs, "app.py"],
    backendDir,
    "backend",
    "36m", // cyan
  );
}

if (runExpo) {
  spawnLabelled(
    isWin ? "npx.cmd" : "npx",
    ["expo", "start"],
    root,
    "expo",
    "35m", // magenta
  );
}

if (!runBackend && !runExpo) {
  console.error(
    'Unknown target. Usage: node scripts/dev.js [backend|expo] (default: both).',
  );
  process.exit(1);
}