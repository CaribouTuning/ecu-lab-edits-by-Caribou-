/**
 * The chrome both modes work in: a laptop on your desk, in your shop. Played on a phone it
 * is your phone instead (usePhone): the same apps on a home screen, each full screen.
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

import { Atom, Bell, BookOpen, ChevronLeft, ChevronRight, Gauge, Home, MessageCircle, Search, Settings, Store, Wrench, X } from 'lucide-react';
import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';

import { isApplePlatform } from '../commands.js';
import { CARIBOU_FILL, CARIBOU_INK } from '../screens/caribouLogo.js';

import { ShopBackdrop } from './ShopBackdrop.jsx';

import styles from './Desk.module.css';

/**
 * The desktop's apps: Tune and Learn, Physics, and in CAREER Pops's messages. An engine is
 * not built on a laptop: Build is the engine stand's, in the shop (SHOP_PAGES).
 */
export const DESK_APPS = [
  { id: 'tune', label: 'Tune', name: 'TUNE' },
  { id: 'learn', label: 'Learn', name: 'LEARN' },
  { id: 'physics', label: 'Physics', name: 'PHYSICS' },
  // CAREER: Pops's emails and texts.
  { id: 'messages', label: 'Messages', name: 'MESSAGES' },
];

/**
 * The wallpaper: the Caribou Tuning badge in chrome on a plain graphite ground. Drawn from
 * the traced badge (screens/caribouLogo.js), so it is sharp at any size. (It used to stand
 * on a glossy floor with a reflection; that was decoration, and it went.)
 * @returns {React.ReactElement}
 */
function Wallpaper() {
  const badge = (
    <>
      <path d={CARIBOU_FILL} fill="url(#wall-chrome)" fillRule="evenodd" stroke="var(--badge-ink)" strokeWidth="10" />
      <path d={CARIBOU_INK} fill="var(--badge-ink)" fillRule="evenodd" />
    </>
  );
  return (
    <svg className={styles.wallpaper} viewBox="0 0 1600 900" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
      <defs>
        <linearGradient id="wall-sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" style={{ stopColor: 'var(--wall-sky)' }} />
          <stop offset="1" style={{ stopColor: 'var(--wall-sky2)' }} />
        </linearGradient>
        <linearGradient id="wall-chrome" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" style={{ stopColor: 'var(--chrome-hi)' }} />
          <stop offset="0.45" style={{ stopColor: 'var(--chrome-mid)' }} />
          <stop offset="0.5" style={{ stopColor: 'var(--chrome-lo)' }} />
          <stop offset="0.7" style={{ stopColor: 'var(--chrome-mid)' }} />
          <stop offset="1" style={{ stopColor: 'var(--chrome-hi)' }} />
        </linearGradient>
      </defs>
      <rect width="1600" height="900" fill="url(#wall-sky)" />
      <g transform="translate(590 230) scale(0.45)">{badge}</g>
    </svg>
  );
}

/**
 * The faces in the shop a page's controls are laid on (ShopBackdrop.jsx): the elements to
 * render into. With no WebGL there are none, and the page lays its controls out flat.
 * @typedef {{surfaces: Record<string, HTMLElement>|null}} Surfaces
 */
/** @type {React.Context<Surfaces>} */
const SurfacesContext = createContext(/** @type {Surfaces} */ ({ surfaces: null }));

/** @returns {Surfaces} */
export const useSurfaces = () => useContext(SurfacesContext);

/** The shop's pages, opened from the shop floor rather than the laptop. */
export const SHOP_PAGES = { dyno: 'Dyno', build: 'Build bench', live: 'Engine stand', office: 'Job board' };

/** Where the camera goes for each page: the dyno, the build bench, the run stand, the board on the wall. */
/** @type {Record<string, 'dyno'|'stand'|'build'|'board'>} */
const PAGE_SCENES = { dyno: 'dyno', build: 'build', live: 'stand', office: 'board' };

/**
 * The apps' icons, as a phone draws them: a rounded tile in its own colour, a white glyph on
 * it (Desk.module.css colours each tile by `data-app`). The same on the laptop and the phone.
 */
const GLYPHS = { tune: Gauge, build: Wrench, learn: BookOpen, physics: Atom, messages: MessageCircle, search: Search, shop: Store };

/**
 * @param {{id: string, badge?: number, small?: boolean}} props
 * @returns {React.ReactElement}
 */
function AppTile({ id, badge = 0, small = false }) {
  const Glyph = GLYPHS[/** @type {keyof typeof GLYPHS} */ (id)] ?? Gauge;
  return (
    <span className={styles.appTile} data-app={id} data-small={small ? 'true' : undefined} aria-hidden="true">
      <Glyph strokeWidth={2.1} fill={id === 'messages' ? 'currentColor' : 'none'} />
      {badge > 0 && <span className={styles.appBadge}>{badge}</span>}
    </span>
  );
}

/** A phone's screen, either way up: where the device in your hand is a phone, not a laptop. */
const PHONE_QUERY = '(max-width: 560px), (max-height: 500px)';

/** @returns {boolean} whether the screen is a phone's */
export function usePhone() {
  const query = () => typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia(PHONE_QUERY).matches;
  const [phone, setPhone] = useState(query);
  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return undefined;
    const mq = window.matchMedia(PHONE_QUERY);
    const on = () => setPhone(mq.matches);
    mq.addEventListener?.('change', on);
    return () => mq.removeEventListener?.('change', on);
  }, []);
  return phone;
}

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
 * Where to go next (flow.js): what to do, and the button that takes you there. Where you
 * already are, the step is only said, with nothing to press.
 * @typedef {{text: string, label: string, here: boolean, spot: string, onGo: () => void}} Next
 */

/**
 * The next step, in one line.
 * @param {{next: Next, place: 'page'|'bay'|'laptop'|'phone'}} props
 * @returns {React.ReactElement}
 */
function NextStrip({ next, place }) {
  return (
    <div className={styles.next} data-place={place} role="status" aria-label="Next step">
      <span className={styles.nextTag}>Next</span>
      <span className={styles.nextText}>{next.text}</span>
      {!next.here && (
        <button type="button" className={styles.nextGo} onClick={next.onGo}>
          {next.label}<ChevronRight size={14} aria-hidden="true" />
        </button>
      )}
    </div>
  );
}

/**
 * @param {object} props
 * @param {'desktop'|'app'|'bay'|'page'} props.mode
 * @param {string|null} props.app which app or page is open
 * @param {(id: string) => void} props.onOpen open an app (tune, learn, build, physics) or a page (dyno, live)
 * @param {() => void} props.onDesktop back to the desktop
 * @param {() => void} props.onBay shut the laptop and look at the shop (in CAREER, back out to the town's shop)
 * @param {string[]} [props.apps] which apps the desktop offers, by id (default: SANDBOX's four)
 * @param {boolean} [props.outside] CAREER: the shop's garage door leads outside
 * @param {Record<string, number>} [props.badges] a count to show on an app's icon
 * @param {() => void} [props.onSearch] @param {() => void} [props.onMenu] @param {() => void} [props.onTutorial] @param {() => void} [props.onRepair]
 * @param {Notice[]} [props.notices] what the notifications list holds
 * @param {import('../world/models/engine.js').EngineSpec} props.engineSpec the engine on the stand in the shop
 * @param {number} [props.rpm] that engine's speed while it runs
 * @param {number} [props.dynoRpm] the car on the dyno's engine speed during a pull, 0 between
 * @param {import('./shopScene.js').ShopCars} [props.cars] who is on the dyno and the lift
 * @param {React.ReactNode} [props.status] the engine's status readouts, for the notifications panel
 * @param {React.ReactNode} [props.footer] the open app's status bar: along the bottom of a
 *   laptop window, at the top of a phone's app
 * @param {Next|null} [props.next] where to go next, from wherever you are (the game's flow,
 *   flow.js): under a shop page's bar, over the shop floor, on the laptop and the phone
 * @param {React.ReactNode} [props.children] the open app's or page's screen
 * @returns {React.ReactElement}
 */
export function Desk({
  mode, app, onOpen, onDesktop, onBay, apps = null, outside = false, badges = {}, onSearch, onMenu, onTutorial, onRepair, notices = [], engineSpec, rpm = 0, dynoRpm = 0, cars, status = null, footer = null, next = null, children,
}) {
  const [menu, setMenu] = useState(/** @type {null|'settings'|'notices'} */ (null));
  const [surfaces, setSurfaces] = useState(/** @type {Record<string, HTMLElement>|null} */ (null));
  useEffect(() => { setMenu(null); }, [mode, app]);
  const surfaceCtx = useMemo(() => ({ surfaces }), [surfaces]);
  const appInfo = DESK_APPS.find((a) => a.id === app);
  const pick = (id) => {
    if (id === 'dyno') onOpen('dyno');
    else if (id === 'build') onOpen('build');
    else if (id === 'stand') onOpen('live');
    else if (id === 'door') onOpen('outside');
    else if (id === 'board') onOpen('board');
    else onDesktop();
  };
  const open = mode === 'desktop' || mode === 'app';
  const scene = mode === 'page' ? (PAGE_SCENES[app ?? ''] ?? null) : null;
  const flagged = notices.filter((n) => n.tone && n.tone !== 'ok').length;
  const apple = isApplePlatform();
  const phone = usePhone();

  const settingsMenu = menu === 'settings' && (
    <div className={`${styles.flyout} ink-frame-lg`} data-side="right" role="menu" aria-label="Settings">
      <button type="button" role="menuitem" onClick={() => { setMenu(null); onMenu?.(); }} aria-label="Main menu">Main menu</button>
      <button type="button" role="menuitem" onClick={() => { setMenu(null); onTutorial?.(); }}>Tutorial</button>
      <button type="button" role="menuitem" onClick={() => { setMenu(null); onRepair?.(); }}>Repair engine</button>
      <button type="button" role="menuitem" onClick={() => { setMenu(null); onBay(); }}>{phone ? 'Put the phone down' : 'Shut the laptop'}</button>
    </div>
  );
  const noticesMenu = menu === 'notices' && (
    <div className={`${styles.flyout} ink-frame-lg`} data-side="right" data-wide="true" aria-label="Notifications">
      {status && <div className={styles.status}>{status}</div>}
      {notices.length === 0 && <div className={styles.notice}>Nothing needs you right now.</div>}
      {notices.map((n) => (
        <div key={n.id} className={styles.notice} data-tone={n.tone ?? 'ok'}>
          <span>{n.text}</span>
          {n.go && <button type="button" onClick={() => { setMenu(null); n.go?.(); }}>{n.action ?? 'Open'}</button>}
        </div>
      ))}
    </div>
  );
  const settingsBtn = (
    <button type="button" className={styles.taskBtn} onClick={() => setMenu(menu === 'settings' ? null : 'settings')} aria-label="Settings" aria-expanded={menu === 'settings'} tabIndex={open ? 0 : -1}>
      <Settings size={16} aria-hidden="true" />
    </button>
  );
  const noticesBtn = (
    <button type="button" className={styles.taskBtn} onClick={() => setMenu(menu === 'notices' ? null : 'notices')} aria-label={`${notices.length} notifications`} aria-expanded={menu === 'notices'} tabIndex={open ? 0 : -1}>
      <Bell size={16} aria-hidden="true" />
      {notices.length > 0 && <span className={styles.badge} data-tone={flagged ? 'warn' : 'ok'}>+{notices.length}</span>}
    </button>
  );
  const shownApps = DESK_APPS.filter((a) => (apps ? apps.includes(a.id) : a.id !== 'messages'));

  // On a phone the device in your hand is a phone: a home screen of apps, a status bar,
  // apps full screen, and putting it down shows the shop.
  const device = phone ? (
    <div className={styles.phone} data-state={open ? 'open' : 'shut'} data-home={mode === 'desktop' ? 'true' : undefined} aria-hidden={!open}>
      <div className={styles.statusBar}>
        <Clock />
        <span className={styles.statusRight}>
          {noticesBtn}
          {settingsBtn}
          <span className={styles.battery} aria-hidden="true"><span /></span>
        </span>
        {settingsMenu}
        {noticesMenu}
      </div>
      {mode === 'app' && appInfo ? (
        <section className={styles.phoneApp} aria-label={appInfo.label}>
          <header className={styles.phoneAppBar}>
            <button type="button" className={styles.phoneBack} onClick={onDesktop} aria-label={`Close ${appInfo.label}`}>
              <ChevronLeft size={18} aria-hidden="true" /><span>Home</span>
            </button>
            <span className={styles.phoneAppTitle}>{appInfo.label}</span>
            <button type="button" className={styles.phoneBack} onClick={onSearch} aria-label="Search pages and actions">
              <Search size={17} aria-hidden="true" />
            </button>
          </header>
          {next && <NextStrip next={next} place="phone" />}
          <div className={styles.windowBody}>{footer}{children}</div>
        </section>
      ) : (
        <div className={styles.homeScreen}>
          <Wallpaper />
          {next && <NextStrip next={next} place="phone" />}
          <div className={styles.appGrid}>
            {shownApps.map((a) => (
              <button key={a.id} type="button" className={styles.phoneIcon} onClick={() => onOpen(a.id)} aria-label={a.name} data-tour={`nav-${a.id}`} tabIndex={open ? 0 : -1}>
                <AppTile id={a.id} badge={badges[a.id]} />
                <span className={styles.phoneIconLabel}>{a.label}</span>
              </button>
            ))}
          </div>
          <div className={styles.dock}>
            <button type="button" className={styles.dockBtn} onClick={onSearch} aria-label="Search pages and actions" tabIndex={open ? 0 : -1}>
              <AppTile id="search" /><span>Search</span>
            </button>
            <button type="button" className={styles.dockBtn} onClick={onBay} aria-label="Put the phone down" tabIndex={open ? 0 : -1}>
              <AppTile id="shop" /><span>Shop</span>
            </button>
          </div>
        </div>
      )}
      <button type="button" className={styles.homeBar} onClick={onDesktop} aria-label="Desktop" tabIndex={open ? 0 : -1}><span /></button>
    </div>
  ) : null;

  return (
    <div className={styles.desk} data-mode={mode}>
      <ShopBackdrop mode={scene ?? (mode === 'bay' ? 'bay' : mode === 'page' ? 'page' : 'desk')} phone={phone} outside={outside} engineSpec={engineSpec} rpm={rpm} dynoRpm={dynoRpm} cars={cars} nextSpot={next && !next.here ? next.spot : null} onSurfaces={setSurfaces} onPick={pick} onLook={onBay} />
      {mode === 'bay' && next && <div className={styles.bayNext}><NextStrip next={next} place="bay" /></div>}

      {mode !== 'page' && phone && device}
      {mode !== 'page' && !phone && (
        <div className={styles.laptop} data-state={open ? 'open' : 'shut'} aria-hidden={!open}>
          <div className={`${styles.lid} ink-frame-lg`}>
            <div className={styles.screen}>
              {next && <NextStrip next={next} place="laptop" />}
              <div className={styles.workspace}>
                {mode === 'app' && appInfo ? (
                  <section className={styles.window} aria-label={appInfo.label}>
                    {/* A Mac window's title bar: the traffic lights on the left (only the
                        red one does anything here: it closes the app), the name centred. */}
                    <header className={styles.titleBar}>
                      <span className={styles.lights}>
                        <button type="button" className={styles.light} data-light="close" onClick={onDesktop} aria-label={`Close ${appInfo.label}`}>
                          <X size={8} strokeWidth={3} aria-hidden="true" />
                        </button>
                        <span className={styles.light} data-light="min" aria-hidden="true" />
                        <span className={styles.light} data-light="zoom" aria-hidden="true" />
                      </span>
                      <span className={styles.title}>{appInfo.label}</span>
                    </header>
                    <div className={styles.windowBody}>{children}</div>
                    {footer && <footer className={styles.windowFooter}>{footer}</footer>}
                  </section>
                ) : (
                  <div className={styles.desktop}>
                    <Wallpaper />
                    <div className={styles.icons}>
                      {shownApps.map((a) => (
                        <button key={a.id} type="button" className={styles.icon} onClick={() => onOpen(a.id)} aria-label={a.name} data-tour={`nav-${a.id}`} tabIndex={open ? 0 : -1}>
                          <AppTile id={a.id} badge={badges[a.id]} />
                          <span className={styles.iconLabel}>{a.label}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              <nav className={styles.taskbar} aria-label="Taskbar">
                <span className={styles.menuLeft}>
                  <button type="button" className={styles.taskBtn} onClick={onDesktop} aria-label="Desktop" title="Desktop" tabIndex={open ? 0 : -1}>
                    <Home size={14} aria-hidden="true" />
                  </button>
                  {/* The app in front, named in bold, as a Mac's menu bar does. */}
                  <span className={styles.menuApp}>ECU Lab</span>
                  <span className={styles.menuMaker}>Caribou Tuning</span>
                </span>
                <button
                  type="button" className={`${styles.search} ink-frame`} onClick={onSearch} tabIndex={open ? 0 : -1}
                  aria-label="Search pages and actions" title={`Search (${apple ? '⌘K' : 'Ctrl+K'})`} aria-keyshortcuts={apple ? 'Meta+K' : 'Control+K'}
                >
                  <Search size={14} aria-hidden="true" /><span>Search</span>
                </button>
                <div className={styles.tray}>
                  {settingsBtn}
                  <Clock />
                  {noticesBtn}
                </div>
                {settingsMenu}
                {noticesMenu}
              </nav>
            </div>
          </div>
          <div className={`${styles.base} ink-frame-lg`} aria-hidden="true" />
        </div>
      )}

      {mode === 'page' && (
        <div className={styles.page} data-scene={scene ?? undefined}>
          <header className={styles.pageBar}>
            <button type="button" className={styles.back} onClick={onBay} aria-label="Back to the shop">
              <ChevronLeft size={16} aria-hidden="true" /><span>Shop</span>
            </button>
            <span className={styles.pageTitle}>{SHOP_PAGES[/** @type {keyof typeof SHOP_PAGES} */ (app ?? '')] ?? ''}</span>
            <button type="button" className={styles.back} onClick={onDesktop} aria-label={phone ? 'Pick up the phone' : 'Open the laptop'}>
              <span>{phone ? 'Phone' : 'Laptop'}</span>
            </button>
          </header>
          {next && <NextStrip next={next} place="page" />}
          <div className={styles.pageBody}><SurfacesContext.Provider value={surfaceCtx}>{children}</SurfacesContext.Provider></div>
        </div>
      )}
    </div>
  );
}
