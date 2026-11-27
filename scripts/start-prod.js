/**
 * Production start: runs the two processes the application needs.
 *
 *   1. server.ts          web app + Socket.io + Meta/Instagram webhooks, on one port
 *   2. worker/index.ts    sends queued email and WhatsApp campaigns, runs automations
 *
 * Plain `next start` runs neither the webhooks nor the worker, so campaigns would never be sent
 * and delivery / read / reply events would never arrive.
 *
 * RUN_WORKER=false   start only the web server (when the worker runs in its own container)
 * RUN_SERVER=false   start only the worker
 */
const { spawn } = require('child_process');
const path = require('path');

const root = path.join(__dirname, '..');
const runServer = process.env.RUN_SERVER !== 'false';
const runWorker = process.env.RUN_WORKER !== 'false';
const WORKER_RESTART_MAX_MS = 60_000;
const SERVER_KILL_AFTER_MS = 3000;
// Time the worker gets to finish the messages it is sending. Keep the container's stop timeout above this.
const WORKER_KILL_AFTER_MS = 25_000;

if (!runServer && !runWorker) {
  console.error('[start] RUN_SERVER and RUN_WORKER are both "false": nothing to start.');
  process.exit(1);
}

process.env.NODE_ENV = process.env.NODE_ENV || 'production';

let stopping = false;
let server = null;
let worker = null;
let workerRestartMs = 2000;
let workerRestartTimer = null;

function start(file) {
  return spawn(process.execPath, ['--import', 'tsx', path.join(root, file)], {
    cwd: root,
    stdio: 'inherit',
    env: process.env,
  });
}

function startServer() {
  server = start('server.ts');
  server.on('exit', (code, signal) => {
    server = null;
    if (stopping) return maybeExit();
    // Without the web server the container is useless: stop so the platform restarts it.
    console.error(`[start] Web server stopped (code=${code}, signal=${signal}). Shutting down.`);
    stop(code || 1);
  });
}

function startWorker() {
  const startedAt = Date.now();
  worker = start('worker/index.ts');
  worker.on('exit', (code, signal) => {
    worker = null;
    if (stopping) return maybeExit();
    if (!runServer) {
      // Worker-only container: let the platform restart it.
      process.exit(code || 1);
    }
    // Keep the website up and retry the worker. A worker that ran for a while starts again quickly;
    // one that dies at once (for example a missing setting) backs off up to a minute.
    if (Date.now() - startedAt > 60_000) workerRestartMs = 2000;
    console.error(
      `[start] Worker stopped (code=${code}, signal=${signal}). Campaigns are NOT being sent. ` +
        `Restarting in ${Math.round(workerRestartMs / 1000)}s.`
    );
    workerRestartTimer = setTimeout(startWorker, workerRestartMs);
    workerRestartMs = Math.min(workerRestartMs * 2, WORKER_RESTART_MAX_MS);
  });
}

let exitCode = 0;
function maybeExit() {
  if (!server && !worker) process.exit(exitCode);
}

function stop(code) {
  if (stopping) return;
  stopping = true;
  exitCode = code;
  if (workerRestartTimer) clearTimeout(workerRestartTimer);
  // The worker finishes the messages it is sending before it exits.
  if (worker) worker.kill('SIGTERM');
  if (server) server.kill('SIGTERM');
  maybeExit();
  // The web server has nothing to finish and does not exit on SIGTERM by itself: force it after a moment.
  setTimeout(() => server && server.kill('SIGKILL'), SERVER_KILL_AFTER_MS).unref();
  // Last resort, so no child process is ever left behind.
  setTimeout(() => {
    if (worker) worker.kill('SIGKILL');
    if (server) server.kill('SIGKILL');
    process.exit(exitCode);
  }, WORKER_KILL_AFTER_MS).unref();
}

process.on('SIGTERM', () => stop(0));
process.on('SIGINT', () => stop(0));

console.log(`[start] Starting${runServer ? ' web server' : ''}${runServer && runWorker ? ' +' : ''}${runWorker ? ' worker' : ''}`);
if (runServer) startServer();
if (runWorker) startWorker();
