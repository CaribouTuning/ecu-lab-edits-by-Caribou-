// @vitest-environment jsdom

/**
 * The guidance layer over the engine management pages: each page says what it is for
 * and whether anything on it has changed, and a sensor setting that disagrees with the
 * part on BUILD is shown — with a fix — where the player will see it.
 */

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { afterEach, describe, expect, it } from 'vitest';

import * as S from '../../src/sim/index.js';
import { EcuSection } from '../../src/ui/components/ecu/EcuSection.jsx';
import { FIELD_TIPS, PAGE_GUIDES, tipFor } from '../../src/ui/components/ecu/guides.js';
import { SensorMatchNote } from '../../src/ui/components/ecu/SensorMatchNote.jsx';
import { ACTIONS } from '../../src/ui/state/reducer.js';
import { StoreProvider, useBuild } from '../../src/ui/state/StoreProvider.jsx';

afterEach(cleanup);

const mount = (node) => render(<StoreProvider>{node}</StoreProvider>);

/** Fits a different wideband on BUILD, the way the BUILD picker does. */
function FitWideband({ id }) {
  const [build, dispatch] = useBuild();
  return (
    <button type="button" onClick={() => dispatch({
      type: ACTIONS.SET_BUILD_FIELD, field: 'sensorHw', value: { ...S.ecuHardwareOf(build).sensorHw, wideband: id },
    })}>fit-wideband</button>
  );
}

describe('sensorMismatches', () => {
  const cal = S.defaultEcuCalibration({});
  const fitted = S.DEFAULT_ECU_HW.sensorHw;

  it('finds nothing on the factory setup', () => {
    expect(S.sensorMismatches(fitted, cal)).toEqual([]);
  });

  it('names the part fitted, the setting, and the value that fixes it', () => {
    const [m] = S.sensorMismatches({ ...fitted, wideband: 'afr-10-20' }, cal);
    expect(m.path).toBe('sensors.wideband');
    expect(m.value).toBe('afr-10-20');
    expect(m.fitted).toMatch(/AFR 10–20/);
    expect(m.told).toMatch(/λ 0.50–1.50/);
  });

  it('treats the automatic MAP setting as always matching', () => {
    expect(S.sensorMismatches({ ...fitted, map: '1bar' }, cal)).toEqual([]);
    expect(S.sensorMismatches({ ...fitted, map: '1bar' }, S.setCal(cal, 'sensors.map', '3bar'))).toHaveLength(1);
  });
});

describe('the sensor note on BUILD', () => {
  it('says the ECU matches, then flags a new part and fixes it in one tap', () => {
    mount(<><FitWideband id="afr-8.5-18" /><SensorMatchNote sensor="wideband" /></>);
    expect(screen.getByText('The ECU is set up for this sensor.')).toBeTruthy();
    fireEvent.click(screen.getByText('fit-wideband'));
    expect(screen.getByText(/The ECU is still set for/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Set ECU to match' }));
    expect(screen.getByText('The ECU is set up for this sensor.')).toBeTruthy();
  });
});

describe('the page guide', () => {
  it('says what the page is for and that nothing has been changed', () => {
    mount(<EcuSection section="idle" title="Idle" />);
    expect(screen.getByText(PAGE_GUIDES.idle.does)).toBeTruthy();
    expect(screen.getByText(/All factory settings/)).toBeTruthy();
  });

  it('counts a changed setting, and Factory puts it back', () => {
    mount(<EcuSection section="idle" title="Idle" />);
    fireEvent.click(screen.getByRole('button', { name: 'Increase A/C idle-up' }));
    expect(screen.getByText(/1 setting changed from factory/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Factory/ }));
    expect(screen.getByText(/All factory settings/)).toBeTruthy();
  });

  it('lists a sensor mismatch on TUNE › SENSORS with its fix', () => {
    mount(<><FitWideband id="afr-10-20" /><EcuSection section="sensors" title="Sensors" /></>);
    fireEvent.click(screen.getByText('fit-wideband'));
    expect(screen.getByRole('alert').textContent).toMatch(/Wideband/);
    fireEvent.click(screen.getByRole('button', { name: 'Match BUILD' }));
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('shows a short tip, with the full explanation one tap away', () => {
    mount(<EcuSection section="idle" title="Idle" />);
    expect(screen.getByText(FIELD_TIPS['idle.acAirAdd'], { exact: false })).toBeTruthy();
    const whys = screen.getAllByRole('button', { name: 'Why?' });
    fireEvent.click(whys[0]);
    expect(screen.queryAllByRole('button', { name: 'Why?' })).toHaveLength(whys.length - 1);
  });
});

describe('the guidance text', () => {
  it('has a guide for every page and a tip for every setting shown by default', () => {
    for (const section of new Set(S.ECU_META.map((m) => m.section))) expect(PAGE_GUIDES[section]).toBeTruthy();
    for (const m of S.ECU_META.filter((x) => !x.pro)) expect(FIELD_TIPS[m.path], m.path).toBeTruthy();
  });

  it('never points at a setting that does not exist', () => {
    const paths = new Set(S.ECU_META.map((m) => m.path));
    for (const p of Object.keys(FIELD_TIPS)) expect(paths.has(p), p).toBe(true);
  });

  it('falls back to the first sentence of the full explanation', () => {
    expect(tipFor({ path: 'nope', help: 'One thing. Then another.' })).toBe('One thing.');
  });
});
