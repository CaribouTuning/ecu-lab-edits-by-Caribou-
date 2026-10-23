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

import { Bell, BookOpen, ChevronLeft, Home, Search, Settings, Store, X } from 'lucide-react';
import React, { useEffect, useState } from 'react';

import { isApplePlatform } from '../commands.js';
import { CARIBOU_FILL, CARIBOU_INK } from '../screens/caribouLogo.js';

import { ShopBackdrop } from './ShopBackdrop.jsx';

import styles from './Desk.module.css';

/** The desktop's apps, as the sketch lays them out: Tune and Learn, Build and Physics. */
export const DESK_APPS = [
  { id: 'tune', label: 'Tune', name: 'TUNE' },
  { id: 'learn', label: 'Learn', name: 'LEARN' },
  { id: 'build', label: 'Build', name: 'BUILD' },
  { id: 'physics', label: 'Physics', name: 'PHYSICS' },
];

/** The light swooshes across the wallpaper: each a soft band of light, as on the glossy desktops of the early 2000s. */
const SWOOSHES = [
  'M-100 700 C 300 520 700 470 1700 560 L 1700 600 C 700 520 300 570 -100 760 Z',
  'M-100 120 C 400 260 900 700 1700 820 L 1700 870 C 860 740 380 320 -100 190 Z',
  'M300 -50 C 700 200 1100 260 1700 120 L 1700 170 C 1100 320 700 270 260 -50 Z',
  'M-100 520 C 500 420 1100 300 1700 330 L 1700 350 C 1100 330 500 450 -100 560 Z',
];

/**
 * The wallpaper: the Caribou Tuning badge in polished chrome, standing on a glossy blue
 * floor with its reflection under it, and swooshes of light behind. Drawn from the traced
 * badge (screens/caribouLogo.js), so it is sharp at any size.
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
        <linearGradient id="wall-sky" x1="1" y1="0" x2="0" y2="1">
          <stop offset="0" style={{ stopColor: 'var(--wall-sky)' }} />
          <stop offset="1" style={{ stopColor: 'var(--wall-sky2)' }} />
        </linearGradient>
        <linearGradient id="wall-light" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" style={{ stopColor: 'var(--chrome-hi)', stopOpacity: 0 }} />
          <stop offset="0.55" style={{ stopColor: 'var(--chrome-hi)', stopOpacity: 0.5 }} />
          <stop offset="1" style={{ stopColor: 'var(--chrome-hi)', stopOpacity: 0.1 }} />
        </linearGradient>
        <linearGradient id="wall-chrome" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" style={{ stopColor: 'var(--chrome-hi)' }} />
          <stop offset="0.45" style={{ stopColor: 'var(--chrome-mid)' }} />
          <stop offset="0.5" style={{ stopColor: 'var(--chrome-lo)' }} />
          <stop offset="0.7" style={{ stopColor: 'var(--chrome-mid)' }} />
          <stop offset="1" style={{ stopColor: 'var(--chrome-hi)' }} />
        </linearGradient>
        <linearGradient id="wall-fade" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="white" stopOpacity="0.45" />
          <stop offset="0.6" stopColor="white" stopOpacity="0" />
        </linearGradient>
        <mask id="wall-reflect"><rect x="0" y="640" width="1600" height="300" fill="url(#wall-fade)" /></mask>
      </defs>
      <rect width="1600" height="900" fill="url(#wall-sky)" />
      {SWOOSHES.map((d) => <path key={d} d={d} fill="url(#wall-light)" />)}
      <rect y="640" width="1600" height="260" style={{ fill: 'var(--wall-sky2)' }} opacity="0.35" />
      <line x1="0" y1="640" x2="1600" y2="640" style={{ stroke: 'var(--chrome-hi)' }} strokeOpacity="0.35" strokeWidth="2" />
      <g transform="translate(590 170) scale(0.45)">{badge}</g>
      <g mask="url(#wall-reflect)">
        <g transform="translate(590 1110) scale(0.45 -0.45)" opacity="0.8">{badge}</g>
      </g>
    </svg>
  );
}

/** The shop's pages, opened from the shop floor rather than the laptop. */
export const SHOP_PAGES = { dyno: 'Dyno', live: 'Live motor', office: 'Job board' };

/**
 * The four apps' pictures, doodled in pen the way they were drawn on the pad, each over a
 * pale watercolour wash. Drawn on a 48-unit square with `DOODLE` stroke settings.
 */
const APP_ICONS = {
  // A power curve on its axes, labelled HP and RPM.
  tune: (
    <>
      <path className="wash" d="M10 36c2-12 10-22 20-20s12 12 10 20z" />
      <path d="M9 6c0 10 .5 22 0 33 9 .3 22-.4 33 .2" />
      <path d="M11 36c4-9 8-19 15-21 6-2 10 5 12 13" />
      <text x="1" y="24" className="label">HP</text>
      <text x="28" y="47" className="label">RPM</text>
    </>
  ),
  // A sheet of notes, its corner curling.
  learn: (
    <>
      <path className="wash" d="M12 10h22l4 30H14z" />
      <path d="M11 6c7 .4 17-.3 26 .3.4 10-.3 24 .5 34-4-3-7 1-10-1s-6 2-9 0-5 1-7-.4C11 28 11.5 16 11 6z" />
      <path d="M15 14c3-2 5 2 8 0s5 2 8 0M15 21c3-2 5 2 8 0s5 2 8 0M15 28c3-2 5 2 8 0" />
    </>
  ),
  // Two pistons on their rods, meeting at the crank.
  build: (
    <>
      <path className="wash" d="M8 12l12-6 6 12-12 6zM28 8l12 4-4 12-12-4z" />
      <path d="M7 12.5l12.5-6.5 6 12-12.5 6.3z M9.5 16l11-5.5" />
      <path d="M28.5 7.5l12 4.5-4.5 12-12-4.6z M27 11.5l11.5 4" />
      <path d="M19 21l5 15M30 22l-4 14" />
      <circle cx="25" cy="38" r="5" />
      <circle cx="25" cy="38" r="1.5" />
    </>
  ),
  // An atom: a nucleus and three crossed orbits, an electron on each.
  physics: (
    <>
      <circle className="wash" cx="24" cy="24" r="15" />
      <ellipse cx="24" cy="24" rx="20" ry="7.5" />
      <ellipse cx="24" cy="24" rx="20" ry="7.5" transform="rotate(60 24 24)" />
      <ellipse cx="24" cy="24" rx="20" ry="7.5" transform="rotate(-60 24 24)" />
      <circle cx="24" cy="24" r="3" className="dot" />
      <circle cx="44" cy="24" r="1.8" className="dot" />
      <circle cx="14" cy="7" r="1.8" className="dot" />
      <circle cx="14" cy="41" r="1.8" className="dot" />
    </>
  ),
};

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
 * @param {object} props
 * @param {'desktop'|'app'|'bay'|'page'} props.mode
 * @param {string|null} props.app which app or page is open
 * @param {(id: string) => void} props.onOpen open an app (tune, learn, build, physics) or a page (dyno, live)
 * @param {() => void} props.onDesktop back to the desktop
 * @param {() => void} props.onBay shut the laptop and look at the shop (in CAREER, back out to the town's shop)
 * @param {string[]} [props.apps] which apps the desktop offers, by id (default: SANDBOX's four)
 * @param {boolean} [props.outside] CAREER: the shop's garage door leads outside
 * @param {() => void} [props.onSearch] @param {() => void} [props.onMenu] @param {() => void} [props.onTutorial] @param {() => void} [props.onRepair]
 * @param {Notice[]} [props.notices] what the notifications list holds
 * @param {import('../world/models/engine.js').EngineSpec} props.engineSpec the engine on the stand in the shop
 * @param {number} [props.rpm] that engine's speed while it runs
 * @param {React.ReactNode} [props.status] the engine's status readouts, for the notifications panel
 * @param {React.ReactNode} [props.children] the open app's or page's screen
 * @returns {React.ReactElement}
 */
export function Desk({
  mode, app, onOpen, onDesktop, onBay, apps = null, outside = false, onSearch, onMenu, onTutorial, onRepair, notices = [], engineSpec, rpm = 0, status = null, children,
}) {
  const [menu, setMenu] = useState(/** @type {null|'settings'|'notices'} */ (null));
  useEffect(() => { setMenu(null); }, [mode, app]);
  const appInfo = DESK_APPS.find((a) => a.id === app);
  const pick = (id) => {
    if (id === 'dyno') onOpen('dyno');
    else if (id === 'stand') onOpen('live');
    else if (id === 'door') onOpen('outside');
    else if (id === 'board') onOpen('board');
    else onDesktop();
  };
  const open = mode === 'desktop' || mode === 'app';
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
  const appIcon = (id) => <svg viewBox="0 0 48 48" className={styles.doodle} aria-hidden="true">{APP_ICONS[/** @type {keyof typeof APP_ICONS} */ (id)]}</svg>;
  const shownApps = DESK_APPS.filter((a) => !apps || apps.includes(a.id));

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
          <div className={styles.windowBody}>{children}</div>
        </section>
      ) : (
        <div className={styles.homeScreen}>
          <Wallpaper />
          <div className={styles.appGrid}>
            {shownApps.map((a) => (
              <button key={a.id} type="button" className={styles.phoneIcon} onClick={() => onOpen(a.id)} aria-label={a.name} data-tour={`nav-${a.id}`} tabIndex={open ? 0 : -1}>
                <span className={`${styles.phoneIconTile} ink-frame`}>{appIcon(a.id)}</span>
                <span className={styles.phoneIconLabel}>{a.label}</span>
              </button>
            ))}
          </div>
          <div className={styles.dock}>
            <button type="button" className={styles.dockBtn} onClick={onSearch} aria-label="Search pages and actions" tabIndex={open ? 0 : -1}>
              <Search aria-hidden="true" /><span>Search</span>
            </button>
            <button type="button" className={styles.dockBtn} onClick={onBay} aria-label="Put the phone down" tabIndex={open ? 0 : -1}>
              <Store aria-hidden="true" /><span>Shop</span>
            </button>
          </div>
        </div>
      )}
      <button type="button" className={styles.homeBar} onClick={onDesktop} aria-label="Desktop" tabIndex={open ? 0 : -1}><span /></button>
    </div>
  ) : null;

  return (
    <div className={styles.desk} data-mode={mode}>
      <ShopBackdrop mode={mode === 'bay' ? 'bay' : mode === 'page' ? 'page' : 'desk'} phone={phone} outside={outside} engineSpec={engineSpec} rpm={rpm} onPick={pick} onLook={onBay} />

      {mode !== 'page' && phone && device}
      {mode !== 'page' && !phone && (
        <div className={styles.laptop} data-state={open ? 'open' : 'shut'} aria-hidden={!open}>
          <div className={`${styles.lid} ink-frame-lg`}>
            <div className={styles.screen}>
              <div className={styles.workspace}>
                {mode === 'app' && appInfo ? (
                  <section className={styles.window} aria-label={appInfo.label}>
                    <header className={styles.titleBar}>
                      <span className={styles.titleIcon} aria-hidden="true">
                        <svg viewBox="0 0 48 48" className={styles.doodle}>{APP_ICONS[/** @type {keyof typeof APP_ICONS} */ (appInfo.id)]}</svg>
                      </span>
                      <span className={`${styles.title} ink-frame`}>{appInfo.label}</span>
                      <button type="button" className={`${styles.close} ink-frame`} onClick={onDesktop} aria-label={`Close ${appInfo.label}`}>
                        <X size={15} aria-hidden="true" />
                      </button>
                    </header>
                    <div className={styles.windowBody}>{children}</div>
                  </section>
                ) : (
                  <div className={styles.desktop}>
                    <Wallpaper />
                    <div className={styles.icons}>
                      {shownApps.map((a) => (
                        <button key={a.id} type="button" className={styles.icon} onClick={() => onOpen(a.id)} aria-label={a.name} data-tour={`nav-${a.id}`} tabIndex={open ? 0 : -1}>
                          {appIcon(a.id)}
                          <span className={`${styles.iconLabel} ink-frame`}>{a.label}</span>
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
        <div className={styles.page}>
          <header className={styles.pageBar}>
            <button type="button" className={styles.back} onClick={onBay} aria-label="Back to the shop">
              <ChevronLeft size={16} aria-hidden="true" /><span>Shop</span>
            </button>
            <span className={styles.pageTitle}>{SHOP_PAGES[/** @type {keyof typeof SHOP_PAGES} */ (app ?? '')] ?? ''}</span>
            <button type="button" className={styles.back} onClick={onDesktop} aria-label={phone ? 'Pick up the phone' : 'Open the laptop'}>
              <BookOpen size={15} aria-hidden="true" /><span>{phone ? 'Phone' : 'Laptop'}</span>
            </button>
          </header>
          <div className={styles.pageBody}>{children}</div>
        </div>
      )}
    </div>
  );
}
