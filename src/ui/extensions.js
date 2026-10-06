/**
 * Extension points: how a build that ships extra screens (ECU Lab Pro) adds them
 * without forking the app.
 *
 * The free app registers nothing and behaves exactly as it always has. An extension
 * registers a tab BEFORE the app first renders (in its own entry point), and the tab
 * then gets everything a built-in tab gets: a nav button after the built-in ones, a
 * route (`#/<id>/<section>`) validated like any other, and its screen rendered in the
 * app column, inside the store provider, so it can read the build with the same hooks
 * the built-in screens use.
 *
 * Extension tabs are Sandbox-only: Career keeps its own fixed set of destinations.
 */

import { ROUTES } from './routing.js';

/**
 * @typedef {object} ExtensionTab
 * @property {string} id route and nav id; must not clash with a built-in tab
 * @property {string} label nav label (upper case, like the built-in ones)
 * @property {React.ElementType} icon a lucide-react icon
 * @property {string[]} sections the tab's sections, first is the default
 * @property {(ctx: {section: string|null, navigate: Function}) => React.ReactNode} render
 */

/** @type {ExtensionTab[]} */
export const EXTENSION_TABS = [];

/**
 * Register a tab. Call before the app renders.
 * @param {ExtensionTab} tab
 */
export function registerTab(tab) {
  if (ROUTES[tab.id] && !EXTENSION_TABS.some((t) => t.id === tab.id)) {
    throw new Error(`"${tab.id}" is a built-in tab.`);
  }
  if (!tab.sections?.length) throw new Error(`Tab "${tab.id}" needs at least one section.`);
  ROUTES[tab.id] = [...tab.sections];
  const i = EXTENSION_TABS.findIndex((t) => t.id === tab.id);
  if (i >= 0) EXTENSION_TABS[i] = tab; else EXTENSION_TABS.push(tab);
}
