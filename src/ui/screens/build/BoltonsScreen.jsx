/**
 * BUILD > Bolt-On Parts.
 *
 * The four installable mods: intake, headers, exhaust, intercooler. Installing one
 * changes airflow but never rewrites the logged VE table itself — the AIR screen
 * shows the gap and lets the player accept it once they understand why.
 *
 * A card's `disabled` means *installed*, not an inert control — that is deliberate
 * (see the brief for this tab) and is not a `Button` state, so this stays a plain
 * `<button>`.
 *
 * `onResetToStock` is the shell's: it rebuilds the VE table from `hwForVe`, a
 * derivation several other screens and the sim payload also read, so the shell keeps
 * owning both the derivation and the dispatch built on top of it.
 */

import { Package, RotateCcw } from 'lucide-react';
import React from 'react';

import { MOD_INFO } from '../../../sim/index.js';
import { BuildSection } from '../../components/BuildSection.jsx';
import { Button } from '../../primitives/Button.jsx';
import { ACTIONS } from '../../state/reducer.js';
import { useBuild } from '../../state/StoreProvider.jsx';
import { T } from '../../theme.js';

/**
 * @param {object} props
 * @param {boolean} props.active whether this is BUILD's open section
 * @param {(section: string) => void} props.onToggle opens or closes a BUILD section
 * @param {() => void} props.onResetToStock rebuilds the calibration for stock mods
 *   against the currently-fitted hardware
 * @returns {React.ReactElement}
 */
export function BoltonsScreen({ active, onToggle, onResetToStock }) {
  const [build, dispatch] = useBuild();
  const { mods } = build;

  const installMod = (key) => {
    if (mods[key]) return;
    // Fitting a part changes airflow but does NOT edit your logged VE table — the
    // VE tab will show the gap and let you accept it once you understand why.
    dispatch({ type: ACTIONS.SET_BUILD_FIELD, field: 'mods', value: { ...mods, [key]: true } });
  };

  return (
    <BuildSection
      active={active} onClick={() => onToggle('boltons')}
      icon={Package} label="Bolt-On Parts"
      sub={`${Object.values(mods).filter((v) => v).length}/4 installed`}
    >
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 9 }}>
        <Button variant="quiet" size="sm" onClick={onResetToStock}>
          <RotateCcw size={12} aria-hidden="true" /> RESET ALL TO STOCK
        </Button>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {Object.keys(MOD_INFO).map((key) => (
          <button key={key} onClick={() => installMod(key)} disabled={mods[key]} style={{
            textAlign: 'left', padding: '11px 13px', borderRadius: 10,
            border: `1px solid ${mods[key] ? T.okLine : T.line}`,
            background: mods[key] ? T.okBg : T.panel2,
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontWeight: 700, fontSize: 13, color: mods[key] ? T.ok : T.ink }}>{MOD_INFO[key].label}</span>
              <span style={{ fontSize: 10.5, fontWeight: 800, color: mods[key] ? T.ok : T.accInk }}>{mods[key] ? 'INSTALLED' : 'INSTALL'}</span>
            </div>
            <div style={{ fontSize: 11.5, color: T.ink2, marginTop: 3 }}>{MOD_INFO[key].blurb}</div>
          </button>
        ))}
      </div>

    </BuildSection>
  );
}
