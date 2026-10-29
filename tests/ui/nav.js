/**
 * Getting round the app in a test the way a player does.
 *
 * Both modes work on a laptop in your shop (src/ui/desk/Desk.jsx): Tune (and in SANDBOX,
 * Learn and Physics) are apps on its desktop, and the dyno and the engine stand are in the
 * shop, reached by shutting the laptop. The engine is built on the build bench (BUILD) and
 * run on the engine stand (LIVE). The game opens stood in the shop, the laptop shut. `goTo`
 * takes either route to the same screen, so a test says where it wants to be and not how
 * the chrome gets there.
 */

import { fireEvent, screen, within } from '@testing-library/react';

const DESK_APPS = ['TUNE', 'LEARN', 'PHYSICS'];
const SHOP_PAGES = ['DYNO', 'BUILD', 'LIVE'];

/** @param {string} name */
const button = (name) => screen.queryByRole('button', { name });

/**
 * Open a tab: BUILD, TUNE, LEARN, PHYSICS, DYNO or LIVE (or SHOP in CAREER).
 * @param {string} name
 */
export function goTo(name) {
  const tab = String(name).toUpperCase();
  const nav = screen.queryByRole('navigation', { name: 'Sections' });
  if (nav) {
    fireEvent.click(within(nav).getByRole('button', { name: tab }));
    return;
  }
  if (DESK_APPS.includes(tab)) {
    // To the desktop first: from an app its home button, from the shop or a page the laptop.
    const desk = button('Desktop');
    if (desk) fireEvent.click(desk);
    else fireEvent.click(screen.getAllByRole('button', { name: 'Open the laptop' })[0]);
    fireEvent.click(screen.getByRole('button', { name: tab }));
    return;
  }
  if (SHOP_PAGES.includes(tab)) {
    // Into the shop: from a page its back button; from the laptop, shut it.
    const back = button('Back to the shop');
    if (back) fireEvent.click(back);
    else if (!document.querySelector('[data-spot]')) {
      // On the laptop: to its desktop, then look up past it at the shop.
      const desk = button('Desktop');
      if (desk) fireEvent.click(desk);
      fireEvent.click(screen.getByRole('button', { name: 'Look up at the shop' }));
    }
    // The shop's markers name the thing: the dyno, the build bench (BUILD), and the run stand
    // (LIVE). The marker itself, not the next step's button, which can be named the same.
    const label = { DYNO: 'Dyno', BUILD: 'Build bench', LIVE: 'Engine stand' }[tab];
    const spot = screen.getAllByRole('button', { name: label }).find((b) => b.dataset.spot);
    fireEvent.click(/** @type {HTMLElement} */ (spot));
    return;
  }
  throw new Error(`goTo: no way to ${name}`);
}

/** Past the start screen into SANDBOX, onto BUILD, as the old landing was. */
export function enterSandbox() {
  fireEvent.click(screen.getByRole('button', { name: 'Sandbox' }));
  goTo('BUILD');
}

/**
 * One of the chrome's own actions: Main menu, Tutorial, Repair engine. CAREER's strip has
 * them as buttons; SANDBOX's taskbar has them in its Settings menu.
 * @param {string} name
 */
export function chrome(name) {
  const direct = button(name);
  if (direct) { fireEvent.click(direct); return; }
  // Out in the shop (a page over it, or stood looking at it): the laptop has the menu.
  if (!button('Settings')) fireEvent.click(screen.getAllByRole('button', { name: 'Open the laptop' })[0]);
  fireEvent.click(screen.getByRole('button', { name: 'Settings' }));
  fireEvent.click(screen.getByRole('menuitem', { name }));
}

/**
 * Into CAREER from the start screen: the save loads and you are sat at the desk, the
 * laptop open. Resolves once the laptop is there.
 */
export async function enterCareer() {
  fireEvent.click(screen.getByRole('button', { name: 'Career' }));
  await screen.findByRole('button', { name: 'Open the laptop' });
}

/** CAREER: look up from the laptop at the shop and walk over to the job board on the wall. */
export async function openJobBoard() {
  if (!document.querySelector('[data-spot]')) {
    const desk = button('Desktop');
    if (desk) fireEvent.click(desk);
    fireEvent.click(screen.getByRole('button', { name: 'Look up at the shop' }));
  }
  fireEvent.click(screen.getByRole('button', { name: /Job board/ }));
  await screen.findByTestId('shop-money');
}

/**
 * On the engine stand's build software, open one part of the engine: Engine, Short block,
 * Heads and cam, Induction, Fuel system or Exhaust.
 * @param {string} name
 */
export function buildPart(name) {
  const parts = within(screen.getByRole('navigation', { name: 'Engine parts' }));
  fireEvent.click(parts.getByRole('button', { name: new RegExp(`^${name}`) }));
}

/**
 * With no engine on the bench: take the factory path (if not on it already), pick the
 * named engine, and return its "Use" (put it on the bench) button.
 * @param {string} name
 */
export function factoryEngine(name) {
  const path = screen.queryByRole('button', { name: /^Start with a factory engine/ });
  if (path) fireEvent.click(path);
  fireEvent.click(screen.getByRole('button', { name: new RegExp(`^${name}`) }));
  return screen.getByRole('button', { name: `Use ${name}` });
}

/** With no engine on the bench: take the custom path (from either path) and return its form. */
export function customForm() {
  const custom = () => screen.queryByRole('button', { name: /^Build a custom engine/ });
  const back = button('Back');
  if (back && !custom() && !screen.queryByRole('form', { name: 'Describe your engine' })) fireEvent.click(back);
  const path = custom();
  if (path) fireEvent.click(path);
  return screen.getByRole('form', { name: 'Describe your engine' });
}
