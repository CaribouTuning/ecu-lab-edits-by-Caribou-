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

/** The petals of the wallpaper's bloom: angle (deg) and length, outermost first. */
const PETALS = [
  [-70, 1], [-35, 1.08], [0, 1.15], [35, 1.08], [70, 1],
  [-52, 0.78], [-17, 0.86], [17, 0.86], [52, 0.78],
];

/**
 * The desktop wallpaper: a blue bloom of folded petals on a pale sky, the look a new
 * computer ships with. Drawn here, not an image: an original, in the theme's blues.
 * @returns {React.ReactElement}
 */
function Wallpaper() {
  return (
    <svg className={styles.wallpaper} viewBox="0 0 1600 900" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
      <defs>
        <linearGradient id="wall-sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" style={{ stopColor: 'var(--wall-sky)' }} />
          <stop offset="1" style={{ stopColor: 'var(--wall-sky2)' }} />
        </linearGradient>
        <linearGradient id="wall-petal" x1="0" y1="1" x2="0" y2="0">
          <stop offset="0" style={{ stopColor: 'var(--wall-deep)' }} />
          <stop offset="0.55" style={{ stopColor: 'var(--wall-mid)' }} />
          <stop offset="1" style={{ stopColor: 'var(--wall-light)' }} />
        </linearGradient>
      </defs>
      <rect width="1600" height="900" fill="url(#wall-sky)" />
      <g transform="translate(800 640)">
        {PETALS.map(([deg, len]) => (
          <path
            key={deg}
            transform={`rotate(${deg}) scale(${len})`}
            d="M0 0 C-120 -90 -150 -300 0 -470 C150 -300 120 -90 0 0 Z"
            fill="url(#wall-petal)" opacity="0.88"
          />
        ))}
      </g>
    </svg>
  );
}

/** The shop's pages, opened from the shop floor rather than the laptop. */
export const SHOP_PAGES = { dyno: 'Dyno', live: 'Live motor' };

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
 * @param {string[]} [props.apps] which apps the desktop offers, by id (default: all four)
 * @param {() => void} [props.onSearch] @param {() => void} [props.onMenu] @param {() => void} [props.onTutorial] @param {() => void} [props.onRepair]
 * @param {Notice[]} [props.notices] what the notifications list holds
 * @param {import('../world/models/engine.js').EngineSpec} props.engineSpec the engine on the stand in the shop
 * @param {number} [props.rpm] that engine's speed while it runs
 * @param {React.ReactNode} [props.status] the engine's status readouts, for the notifications panel
 * @param {React.ReactNode} [props.children] the open app's or page's screen
 * @returns {React.ReactElement}
 */
export function Desk({
  mode, app, onOpen, onDesktop, onBay, apps = null, onSearch, onMenu, onTutorial, onRepair, notices = [], engineSpec, rpm = 0, status = null, children,
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
                    <div className={styles.wallpaperMark} aria-hidden="true">CARIBOU TUNING</div>
                    <div className={styles.icons}>
                      {DESK_APPS.filter((a) => !apps || apps.includes(a.id)).map((a) => (
                        <button key={a.id} type="button" className={styles.icon} onClick={() => onOpen(a.id)} aria-label={a.name} data-tour={`nav-${a.id}`} tabIndex={open ? 0 : -1}>
                          <svg viewBox="0 0 48 48" className={styles.doodle} aria-hidden="true">{APP_ICONS[/** @type {keyof typeof APP_ICONS} */ (a.id)]}</svg>
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
                  <div className={`${styles.flyout} ink-frame-lg`} data-side="right" role="menu" aria-label="Settings">
                    <button type="button" role="menuitem" onClick={() => { setMenu(null); onMenu?.(); }} aria-label="Main menu">Main menu</button>
                    <button type="button" role="menuitem" onClick={() => { setMenu(null); onTutorial?.(); }}>Tutorial</button>
                    <button type="button" role="menuitem" onClick={() => { setMenu(null); onRepair?.(); }}>Repair engine</button>
                    <button type="button" role="menuitem" onClick={() => { setMenu(null); onBay(); }}>Shut the laptop</button>
                  </div>
                )}
                {menu === 'notices' && (
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
                )}
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
