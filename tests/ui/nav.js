/**
 * Getting round the app in a test the way a player does.
 *
 * CAREER keeps its section nav. SANDBOX is a laptop in your shop (src/ui/desk/Desk.jsx):
 * Build, Tune, Learn and Physics are apps on its desktop, and the dyno and the engine stand
 * (LIVE) are in the shop, reached by shutting the laptop. `goTo` takes either route to the
 * same screen, so a test says where it wants to be and not how the chrome gets there.
 */

import { fireEvent, screen, within } from '@testing-library/react';

const DESK_APPS = ['BUILD', 'TUNE', 'LEARN', 'PHYSICS'];
const SHOP_PAGES = ['DYNO', 'LIVE'];

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
    fireEvent.click(screen.getByRole('button', { name: tab }));
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
  fireEvent.click(screen.getByRole('button', { name: 'Settings' }));
  fireEvent.click(screen.getByRole('menuitem', { name }));
}
