/**
 * Electron shell for ECU Lab.
 *
 * The app is a static Vite build and stays one. This file only hosts `dist/` in a
 * window; it does not touch the simulation, the UI or the build, so the website and
 * the desktop app are the same code and cannot drift apart.
 *
 * `dist/` is served from a custom `app://ecu-lab/` origin rather than `file://`. A
 * real, secure origin gives module scripts, `fetch`, `localStorage` and Web Audio the
 * same behaviour they have on the hosted site, and keeps the saved career stable
 * wherever the app is installed.
 */
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { app, BrowserWindow, protocol, shell } from 'electron';

const SCHEME = 'app';
const HOST = 'ecu-lab';
const ENTRY = `${SCHEME}://${HOST}/index.html`;

/** The Vite build. Inside a packaged app this resolves into `app.asar`. */
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'dist');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.wasm': 'application/wasm',
  '.txt': 'text/plain; charset=utf-8',
};

// Must run before the app is ready.
protocol.registerSchemesAsPrivileged([
  { scheme: SCHEME, privileges: { standard: true, secure: true, supportsFetchAPI: true } },
]);

function registerAppProtocol() {
  const respond = (body, init) => new globalThis.Response(body, init);

  protocol.handle(SCHEME, async (request) => {
    const url = new URL(request.url);
    if (url.host !== HOST) return respond('Not found', { status: 404 });

    const requested = decodeURIComponent(url.pathname);
    const file = path.normalize(path.join(ROOT, requested === '/' ? 'index.html' : requested));

    // Nothing outside dist/ is ever served, whatever the URL says.
    if (file !== ROOT && !file.startsWith(ROOT + path.sep)) {
      return respond('Forbidden', { status: 403 });
    }

    try {
      const body = await readFile(file);
      const type = MIME[path.extname(file).toLowerCase()] ?? 'application/octet-stream';
      return respond(body, { headers: { 'content-type': type } });
    } catch {
      return respond('Not found', { status: 404 });
    }
  });
}

const isWeb = (url) => /^https?:\/\//i.test(url);

function createWindow() {
  const win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 800,
    minHeight: 600,
    title: 'ECU Lab',
    // Matches the page background in index.html, so there is no white flash on launch.
    backgroundColor: '#0a0d14',
    // Windows and Linux: hide the menu bar until Alt is pressed.
    autoHideMenuBar: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  // Links that would open a new window go to the system browser instead.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (isWeb(url)) shell.openExternal(url);
    return { action: 'deny' };
  });

  // The window only ever shows the app. Hash changes (the app's routing) and reloads
  // keep the same document URL, so they pass; anything else is sent to the browser.
  win.webContents.on('will-navigate', (event, url) => {
    if (url.split('#')[0] === ENTRY) return;
    event.preventDefault();
    if (isWeb(url)) shell.openExternal(url);
  });

  win.loadURL(ENTRY);
}

// A second copy would share the same profile and fight over its storage, so a second
// launch focuses the window that is already open.
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    const [win] = BrowserWindow.getAllWindows();
    if (!win) return;
    if (win.isMinimized()) win.restore();
    win.focus();
  });

  app.whenReady().then(() => {
    registerAppProtocol();
    createWindow();
    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
  });
}
