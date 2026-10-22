/**
 * SANDBOX's chrome: a laptop on your desk, in your shop.
 *
 *   desktop   the laptop open on its desktop: four apps (Tune, Learn, Build, Physics) and a
 *             taskbar (home, search, settings, the clock, notifications)
 *   app       one of those apps open in a window that fills the screen; its close button
 *             (and the taskbar's home button) goes back to the desktop
 *   bay       click the shop behind the laptop and it folds shut: you are stood in the shop,
 *             and the dyno, the engine on its stand and the laptop are there to click
 *   page      the dyno or the engine stand: their page, with the way back to the shop
 *
 * Chrome, and only chrome, as AppShell was: the app (EcuLab.jsx) says where you are and
 * hands over the screen for it; this decides how it is framed.
 */

import { Bell, BookOpen, ChevronLeft, Home, Search, Settings, X } from 'lucide-react';
import React, { useEffect, useState } from 'react';

import { isApplePlatform } from '../commands.js';

import { ShopBackdrop } from './ShopBackdrop.jsx';

import styles from './Desk.module.css';

/** The desktop's apps, as the sketch lays them out: Tune and Learn, Build and Physics. */
export const DESK_APPS = [
  { id: 'tune', label: 'Tune', name: 'TUNE' },
  { id: 'learn', label: 'Learn', name: 'LEARN' },
  { id: 'build', label: 'Build', name: 'BUILD' },
  { id: 'physics', label: 'Physics', name: 'PHYSICS' },
];

/** The shop's pages, opened from the shop floor rather than the laptop. */
export const SHOP_PAGES = { dyno: 'Dyno', live: 'Live motor' };

/** Pixel pictures for the four apps, on a 16-unit grid. */
const APP_ICONS = {
  // A power curve on axes: horsepower against rpm.
  tune: (
    <>
      <rect x="1" y="2" width="1" height="13" />
      <rect x="1" y="14" width="14" height="1" />
      <path d="M3 12l2-3 2-2 2-1h2l2 1 1 2v1h-1v-1l-1-1-1-1h-2l-2 1-2 2-1 2-1 1z" />
    </>
  ),
  // An open book.
  learn: (
    <>
      <path d="M1 3h6l1 1 1-1h6v10H9l-1 1-1-1H1z" />
      <rect x="7.5" y="4" width="1" height="9" fill="var(--panel)" />
      <rect x="2.5" y="5" width="3.5" height="1" fill="var(--panel)" />
      <rect x="2.5" y="8" width="3.5" height="1" fill="var(--panel)" />
      <rect x="10" y="5" width="3.5" height="1" fill="var(--panel)" />
      <rect x="10" y="8" width="3.5" height="1" fill="var(--panel)" />
    </>
  ),
  // A piston and rod, and a spanner.
  build: (
    <>
      <rect x="7" y="1" width="6" height="6" />
      <rect x="7" y="2" width="6" height="1" fill="var(--panel)" />
      <rect x="9" y="7" width="2" height="5" />
      <rect x="8" y="11" width="4" height="3" />
      <path d="M1 14l5-5 1 1-5 5z" />
      <path d="M0 13h3v3H0z" />
    </>
  ),
  // An atom: a nucleus and two orbits.
  physics: (
    <>
      {/* An atom: a nucleus and three crossed orbits. */}
      <circle cx="8" cy="8" r="1.6" />
      <g fill="none" stroke="currentColor" strokeWidth="1.1">
        <ellipse cx="8" cy="8" rx="7" ry="2.6" />
        <ellipse cx="8" cy="8" rx="7" ry="2.6" transform="rotate(60 8 8)" />
        <ellipse cx="8" cy="8" rx="7" ry="2.6" transform="rotate(-60 8 8)" />
      </g>
    </>
  ),
};

/** The time on the taskbar, kept current. */
function Clock() {
  const fmt = () => new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  const [now, setNow] = useState(fmt);
  useEffect(() => {
    const id = setInterval(() => setNow(fmt()), 20000);
    return () => clearInterval(id);
  }, []);
  return <span className={styles.clock}>{now}</span>;
}

/**
 * @typedef {{id: string, text: string, tone?: 'ok'|'warn'|'danger', action?: string, go?: () => void}} Notice
 */

/**
 * @param {object} props
 * @param {'desktop'|'app'|'bay'|'page'} props.mode
 * @param {string|null} props.app which app or page is open
 * @param {(id: string) => void} props.onOpen open an app (tune, learn, build, physics) or a page (dyno, live)
 * @param {() => void} props.onDesktop back to the desktop
 * @param {() => void} props.onBay shut the laptop and look at the shop
 * @param {() => void} [props.onSearch] @param {() => void} [props.onMenu] @param {() => void} [props.onTutorial] @param {() => void} [props.onRepair]
 * @param {Notice[]} [props.notices] what the notifications list holds
 * @param {import('../world/models/engine.js').EngineSpec} props.engineSpec the engine on the stand in the shop
 * @param {number} [props.rpm] that engine's speed while it runs
 * @param {React.ReactNode} [props.status] the engine's status readouts, for the notifications panel
 * @param {React.ReactNode} [props.children] the open app's or page's screen
 * @returns {React.ReactElement}
 */
export function Desk({
  mode, app, onOpen, onDesktop, onBay, onSearch, onMenu, onTutorial, onRepair, notices = [], engineSpec, rpm = 0, status = null, children,
}) {
  const [menu, setMenu] = useState(/** @type {null|'settings'|'notices'} */ (null));
  useEffect(() => { setMenu(null); }, [mode, app]);
  const appInfo = DESK_APPS.find((a) => a.id === app);
  const pick = (id) => {
    if (id === 'dyno') onOpen('dyno');
    else if (id === 'stand') onOpen('live');
    else onDesktop();
  };
  const open = mode === 'desktop' || mode === 'app';
  const flagged = notices.filter((n) => n.tone && n.tone !== 'ok').length;
  const apple = isApplePlatform();

  return (
    <div className={styles.desk} data-mode={mode}>
      <ShopBackdrop mode={mode === 'bay' ? 'bay' : mode === 'page' ? 'page' : 'desk'} engineSpec={engineSpec} rpm={rpm} onPick={pick} onLook={onBay} />

      {mode !== 'page' && (
        <div className={styles.laptop} data-state={open ? 'open' : 'shut'} aria-hidden={!open}>
          <div className={styles.lid}>
            <div className={styles.screen}>
              <div className={styles.workspace}>
                {mode === 'app' && appInfo ? (
                  <section className={styles.window} aria-label={appInfo.label}>
                    <header className={styles.titleBar}>
                      <span className={styles.titleIcon} aria-hidden="true">
                        <svg viewBox="0 0 16 16" shapeRendering="crispEdges" fill="currentColor">{APP_ICONS[/** @type {keyof typeof APP_ICONS} */ (appInfo.id)]}</svg>
                      </span>
                      <span className={styles.title}>{appInfo.label}</span>
                      <button type="button" className={styles.close} onClick={onDesktop} aria-label={`Close ${appInfo.label}`}>
                        <X size={15} aria-hidden="true" />
                      </button>
                    </header>
                    <div className={styles.windowBody}>{children}</div>
                  </section>
                ) : (
                  <div className={styles.desktop}>
                    <div className={styles.wallpaperMark} aria-hidden="true">CARIBOU TUNING</div>
                    <div className={styles.icons}>
                      {DESK_APPS.map((a) => (
                        <button key={a.id} type="button" className={styles.icon} onClick={() => onOpen(a.id)} aria-label={a.name} tabIndex={open ? 0 : -1}>
                          <svg viewBox="0 0 16 16" shapeRendering="crispEdges" fill="currentColor" aria-hidden="true">{APP_ICONS[/** @type {keyof typeof APP_ICONS} */ (a.id)]}</svg>
                          <span className={styles.iconLabel}>{a.label}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              <nav className={styles.taskbar} aria-label="Taskbar">
                <button type="button" className={styles.taskBtn} onClick={onDesktop} aria-label="Desktop" title="Desktop" tabIndex={open ? 0 : -1}>
                  <Home size={16} aria-hidden="true" />
                </button>
                <button
                  type="button" className={styles.search} onClick={onSearch} tabIndex={open ? 0 : -1}
                  aria-label="Search pages and actions" title={`Search (${apple ? '⌘K' : 'Ctrl+K'})`} aria-keyshortcuts={apple ? 'Meta+K' : 'Control+K'}
                >
                  <Search size={14} aria-hidden="true" /><span>Search</span>
                </button>
                <div className={styles.tray}>
                  <button type="button" className={styles.taskBtn} onClick={() => setMenu(menu === 'settings' ? null : 'settings')} aria-label="Settings" aria-expanded={menu === 'settings'} tabIndex={open ? 0 : -1}>
                    <Settings size={16} aria-hidden="true" />
                  </button>
                  <Clock />
                  <button type="button" className={styles.taskBtn} onClick={() => setMenu(menu === 'notices' ? null : 'notices')} aria-label={`${notices.length} notifications`} aria-expanded={menu === 'notices'} tabIndex={open ? 0 : -1}>
                    <Bell size={16} aria-hidden="true" />
                    {notices.length > 0 && <span className={styles.badge} data-tone={flagged ? 'warn' : 'ok'}>+{notices.length}</span>}
                  </button>
                </div>
                {menu === 'settings' && (
                  <div className={styles.flyout} data-side="right" role="menu" aria-label="Settings">
                    <button type="button" role="menuitem" onClick={() => { setMenu(null); onMenu?.(); }} aria-label="Main menu">Main menu</button>
                    <button type="button" role="menuitem" onClick={() => { setMenu(null); onTutorial?.(); }}>Tutorial</button>
                    <button type="button" role="menuitem" onClick={() => { setMenu(null); onRepair?.(); }}>Repair engine</button>
                    <button type="button" role="menuitem" onClick={() => { setMenu(null); onBay(); }}>Shut the laptop</button>
                  </div>
                )}
                {menu === 'notices' && (
                  <div className={styles.flyout} data-side="right" data-wide="true" aria-label="Notifications">
                    {status && <div className={styles.status}>{status}</div>}
                    {notices.length === 0 && <div className={styles.notice}>Nothing needs you right now.</div>}
                    {notices.map((n) => (
                      <div key={n.id} className={styles.notice} data-tone={n.tone ?? 'ok'}>
                        <span>{n.text}</span>
                        {n.go && <button type="button" onClick={() => { setMenu(null); n.go?.(); }}>{n.action ?? 'Open'}</button>}
                      </div>
                    ))}
                  </div>
                )}
              </nav>
            </div>
          </div>
          <div className={styles.base} aria-hidden="true" />
        </div>
      )}

      {mode === 'page' && (
        <div className={styles.page}>
          <header className={styles.pageBar}>
            <button type="button" className={styles.back} onClick={onBay} aria-label="Back to the shop">
              <ChevronLeft size={16} aria-hidden="true" /><span>Shop</span>
            </button>
            <span className={styles.pageTitle}>{SHOP_PAGES[/** @type {keyof typeof SHOP_PAGES} */ (app ?? '')] ?? ''}</span>
            <button type="button" className={styles.back} onClick={onDesktop} aria-label="Open the laptop">
              <BookOpen size={15} aria-hidden="true" /><span>Laptop</span>
            </button>
          </header>
          <div className={styles.pageBody}>{children}</div>
        </div>
      )}
    </div>
  );
}
