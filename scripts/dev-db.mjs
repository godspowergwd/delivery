#!/usr/bin/env node
/**
 * Project-local PostgreSQL manager.
 *
 * The platform targets PostgreSQL. This helper boots a private PostgreSQL
 * cluster that lives inside the project folder (`.pgdata`) using the
 * PostgreSQL binaries already installed on the machine, so development works
 * without administrator rights and without touching the system cluster.
 *
 * In production simply point DATABASE_URL at a managed PostgreSQL instance and
 * ignore this script entirely.
 *
 *   node scripts/dev-db.mjs start | stop | status | reset | url
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const DATA_DIR = path.join(ROOT, '.pgdata');
const LOG_FILE = path.join(ROOT, 'pg-dev.log');

const PORT = Number(process.env.PG_PORT || 5433);
const HOST = process.env.PG_HOST || '127.0.0.1';
const USER = process.env.PG_USER || 'postgres';
const PASSWORD = process.env.PG_PASSWORD || 'postgres';
const DATABASE = process.env.PG_DATABASE || 'delivery_system';

const IS_WIN = process.platform === 'win32';
const EXE = (name) => (IS_WIN ? `${name}.exe` : name);

function candidateBinDirs() {
  const dirs = [];
  if (process.env.PG_BIN) dirs.push(process.env.PG_BIN);
  const roots = IS_WIN
    ? [
        'C:\\Program Files\\PostgreSQL',
        'C:\\Program Files (x86)\\PostgreSQL',
        path.join(os.homedir(), 'PostgreSQL'),
      ]
    : ['/usr/lib/postgresql', '/usr/local/pgsql', '/opt/homebrew/opt'];
  for (const root of roots) {
    if (!fs.existsSync(root)) continue;
    let entries = [];
    try {
      entries = fs.readdirSync(root);
    } catch {
      continue;
    }
    const nested = entries
      .map((entry) => path.join(root, entry, 'bin'))
      .filter((dir) => fs.existsSync(path.join(dir, EXE('initdb'))));
    nested.sort().reverse();
    dirs.push(...nested);
  }
  return dirs;
}

function resolveBinDir() {
  const dirs = candidateBinDirs();
  if (dirs.length) return dirs[0];
  const probe = spawnSync(EXE('initdb'), ['--version'], { encoding: 'utf8' });
  if (probe.status === 0) return '';
  throw new Error(
    'PostgreSQL binaries were not found. Install PostgreSQL, or set PG_BIN to the folder ' +
      'that contains initdb/pg_ctl/psql.',
  );
}
const BIN_DIR = resolveBinDir();
const tool = (name) => (BIN_DIR ? path.join(BIN_DIR, EXE(name)) : EXE(name));

function run(command, args, options = {}) {
  return spawnSync(command, args, {
    encoding: 'utf8',
    env: { ...process.env, PGPASSWORD: PASSWORD, ...(options.env || {}) },
    ...options,
  });
}

function sleep(ms) {
  const until = Date.now() + ms;
  while (Date.now() < until) {
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 50);
  }
}

function isClusterInitialised() {
  return fs.existsSync(path.join(DATA_DIR, 'PG_VERSION'));
}

function status() {
  if (!isClusterInitialised()) return { running: false, initialised: false };
  const result = run(tool('pg_ctl'), ['-D', DATA_DIR, 'status']);
  return { running: result.status === 0, initialised: true };
}

function canConnect() {
  const { running } = status();
  if (!running) return false;
  const result = run(tool('psql'), [
    '-h',
    HOST,
    '-p',
    String(PORT),
    '-U',
    USER,
    '-d',
    'postgres',
    '-tAc',
    'SELECT 1',
  ]);
  return result.status === 0;
}

function initialise() {
  if (isClusterInitialised()) return;
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const passwordFile = path.join(os.tmpdir(), `pg-pw-${Date.now()}.txt`);
  fs.writeFileSync(passwordFile, PASSWORD, 'utf8');
  try {
    const result = run(tool('initdb'), [
      '-D',
      DATA_DIR,
      '-U',
      USER,
      '-A',
      'scram-sha-256',
      `--pwfile=${passwordFile}`,
      '-E',
      'UTF8',
      '--locale=C',
    ]);
    if (result.status !== 0) {
      throw new Error(`initdb failed:\n${result.stdout || ''}\n${result.stderr || ''}`);
    }
    console.log(`[db] initialised local PostgreSQL cluster at ${DATA_DIR}`);
  } finally {
    fs.rmSync(passwordFile, { force: true });
  }
}

function ensureDatabase() {
  const exists = run(tool('psql'), [
    '-h',
    HOST,
    '-p',
    String(PORT),
    '-U',
    USER,
    '-d',
    'postgres',
    '-tAc',
    `SELECT 1 FROM pg_database WHERE datname = '${DATABASE}'`,
  ]);
  if ((exists.stdout || '').trim() !== '1') {
    const created = run(tool('createdb'), ['-h', HOST, '-p', String(PORT), '-U', USER, DATABASE]);
    if (created.status !== 0) {
      throw new Error(`Could not create database ${DATABASE}: ${created.stderr || ''}`);
    }
    console.log(`[db] created database ${DATABASE}`);
  }
}

function start() {
  if (canConnect()) {
    console.log(`[db] PostgreSQL already running on ${HOST}:${PORT}`);
    ensureDatabase();
    return;
  }
  initialise();
  if (!status().running) {
    const result = run(tool('pg_ctl'), [
      '-D',
      DATA_DIR,
      '-l',
      LOG_FILE,
      '-o',
      `-p ${PORT} -h ${HOST}`,
      '-w',
      'start',
    ]);
    if (result.status !== 0) {
      throw new Error(`pg_ctl start failed:\n${result.stdout || ''}\n${result.stderr || ''}`);
    }
  }
  let ready = false;
  for (let attempt = 0; attempt < 40; attempt += 1) {
    if (canConnect()) {
      ready = true;
      break;
    }
    sleep(500);
  }
  if (!ready) {
    throw new Error(`PostgreSQL did not become ready. Check the log at ${LOG_FILE}`);
  }
  ensureDatabase();
  console.log(`[db] PostgreSQL ready on ${HOST}:${PORT} (database: ${DATABASE})`);
}

function stop() {
  if (!isClusterInitialised()) {
    console.log('[db] nothing to stop (cluster not initialised)');
    return;
  }
  if (!status().running) {
    console.log('[db] PostgreSQL is not running');
    return;
  }
  const result = run(tool('pg_ctl'), ['-D', DATA_DIR, '-m', 'fast', '-w', 'stop']);
  if (result.status !== 0) {
    throw new Error(`pg_ctl stop failed:\n${result.stdout || ''}\n${result.stderr || ''}`);
  }
  console.log('[db] PostgreSQL stopped');
}

function reset() {
  stop();
  fs.rmSync(DATA_DIR, { recursive: true, force: true });
  console.log('[db] cluster data removed');
  start();
}

function printUrl() {
  console.log(`postgresql://${USER}:${PASSWORD}@${HOST}:${PORT}/${DATABASE}?schema=public`);
}

function main() {
  const command = (process.argv[2] || 'start').toLowerCase();
  switch (command) {
    case 'start':
      start();
      printUrl();
      break;
    case 'stop':
      stop();
      break;
    case 'status': {
      const state = status();
      console.log(
        `[db] initialised=${state.initialised} running=${state.running} port=${PORT} database=${DATABASE}`,
      );
      break;
    }
    case 'reset':
      reset();
      printUrl();
      break;
    case 'url':
      printUrl();
      break;
    default:
      console.error(`Unknown command "${command}". Use start | stop | status | reset | url.`);
      process.exit(1);
  }
}

try {
  main();
} catch (error) {
  console.error(`[db] ${error.message}`);
  process.exit(1);
}
