/**
 * Getting round the app in a test the way a player does.
 *
 * Both modes work on a laptop in your shop (src/ui/desk/Desk.jsx): Tune (and in SANDBOX,
 * Learn and Physics) are apps on its desktop, and the dyno and the engine stand are in the
 * shop, reached by shutting the laptop. The engine is built on its stand (BUILD), and run
 * there (LIVE, the stand computer's Run screen). `goTo` takes either route to the same
 * screen, so a test says where it wants to be and not how the chrome gets there.
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
    else {
      const desk = button('Desktop');
      if (desk) fireEvent.click(desk);
      fireEvent.click(screen.getByRole('button', { name: 'Look up at the shop' }));
    }
    // The shop's markers name the thing: the dyno, and the engine on its stand (BUILD).
    fireEvent.click(screen.getByRole('button', { name: tab === 'DYNO' ? 'Dyno' : 'Engine stand' }));
    // LIVE is the stand computer's Run screen, beside its Build.
    // With no engine chosen yet the stand's computer offers engines and nothing to run.
    const run = tab === 'LIVE' ? button('Run') : null;
    if (run) fireEvent.click(run);
    return;
  }
  throw new Error(`goTo: no way to ${name}`);
}

/** Past the start screen into SANDBOX, onto BUILD, as the old landing was. */
export function enterSandbox() {
  fireEvent.click(screen.getByRole('button', { name: 'SANDBOX' }));
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
  fireEvent.click(screen.getByRole('button', { name: 'CAREER' }));
  await screen.findByRole('button', { name: 'Desktop' });
}

/** CAREER: look up from the laptop at the shop and walk over to the job board on the wall. */
export async function openJobBoard() {
  const desk = button('Desktop');
  if (desk) fireEvent.click(desk);
  fireEvent.click(screen.getByRole('button', { name: 'Look up at the shop' }));
  fireEvent.click(screen.getByRole('button', { name: /Job board/ }));
  await screen.findByText('Your tuning shop');
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
