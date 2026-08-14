/**
 * ROM screen — open a real Nissan ECU binary and edit its real maps.
 *
 * Presentation only, like the rest of `src/ui/`. Every byte-level decision lives
 * in `src/rom/`; this file decides what to show and when to warn.
 *
 * This screen is deliberately different in tone from the rest of ECU Lab. The
 * simulator is a place to be wrong cheaply. This is a file that ends up in an
 * engine controller, so the screen states what it knows and what it does not:
 * checksum status is always visible, the count of changed bytes is always
 * visible, and an export that cannot be verified is refused rather than
 * downloaded with a warning.
 *
 * Nothing here talks to a car. Getting the dump on and off the ECU is still a
 * nisprog command line — see docs/hardware/z33-kline-setup.md.
 */

import React, { useState, useMemo, useRef } from 'react';
import {
  HardDrive, Upload, Download, AlertTriangle, CheckCircle2, RotateCcw, FileCode2, Search,
} from 'lucide-react';

import { RomImage, importRomRaider, findPartNumbers, quantize } from '../rom/index.js';
import { T, heat } from './theme.js';

/** Hex, padded, the way every other ROM tool prints an address. */
const hex = (n, width = 6) => '0x' + n.toString(16).toUpperCase().padStart(width, '0');

/** A file-picker styled as a button, since a bare file input cannot be themed. */
function FileButton({ label, accept, onFile, icon: Icon, tone = 'normal' }) {
  const input = useRef(null);
  const accent = tone === 'primary' ? T.amber : T.line;
  const fg = tone === 'primary' ? T.amberInk : T.ink2;
  return (
    <>
      <button
        onClick={() => input.current?.click()}
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
          padding: '11px 14px', borderRadius: 9, fontWeight: 700, fontSize: 12.5,
          border: `1px solid ${accent}`, background: tone === 'primary' ? T.amberBg : T.panel2,
          color: fg, width: '100%',
        }}
      >
        {Icon && <Icon size={15} />}{label}
      </button>
      <input
        ref={input}
        type="file"
        accept={accept}
        style={{ display: 'none' }}
        onChange={(e) => {
          const file = e.target.files?.[0];
          // Clear the value so picking the same file twice still fires a change.
          e.target.value = '';
          if (file) onFile(file);
        }}
      />
    </>
  );
}

/** A labelled fact about the loaded image. */
function Fact({ label, value, color = T.ink, mono = true }) {
  return (
    <div style={{ flex: '1 1 140px', background: T.panel2, border: `1px solid ${T.line}`, borderRadius: 10, padding: '10px 12px' }}>
      <div style={{ fontSize: 9, color: T.ink3, letterSpacing: 1, fontWeight: 800 }}>{label}</div>
      <div style={{ fontSize: 14, fontWeight: 700, fontFamily: mono ? T.mono : T.sans, color, marginTop: 3, wordBreak: 'break-all' }}>
        {value}
      </div>
    </div>
  );
}

/**
 * The editable map grid.
 *
 * Generalised from the simulator's TuningGrid: arbitrary dimensions, and axis
 * labels that come from the ROM rather than from the simulator's fixed RPM/LOAD
 * arrays — because a real definition's axes are whatever that ECU uses, and a
 * tuner may have moved the breakpoints themselves.
 */
function MapGrid({ values, axes, decimals, selection, setSelection }) {
  const flat = values.flat();
  const min = Math.min(...flat);
  const max = Math.max(...flat);
  // A flat table would divide by zero in the heat scale; give it a nominal spread.
  const spread = max - min || 1;

  const fmt = (v) => v.toFixed(decimals ?? 1);
  const isSelected = (row, col) => {
    if (!selection) return false;
    if (selection.type === 'cell') return selection.row === row && selection.col === col;
    if (selection.type === 'row') return selection.row === row;
    if (selection.type === 'col') return selection.col === col;
    return false;
  };

  const xLabels = axes.x ?? values[0].map((_, i) => i);
  const yLabels = axes.y ?? values.map((_, i) => i);

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 9.5, color: T.ink3, fontWeight: 700, letterSpacing: 0.8, marginBottom: 4 }}>
        <span>{axes.yName || 'ROW'} &darr;</span><span>{axes.xName || 'COL'} &rarr;</span>
      </div>
      <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch', border: `1px solid ${T.line}`, borderRadius: 10 }}>
        <div style={{ display: 'inline-block', minWidth: '100%' }}>
          <div style={{ display: 'flex' }}>
            <div style={{ width: 52, flexShrink: 0, background: T.panel }} />
            {xLabels.map((label, ci) => {
              const on = selection?.type === 'col' && selection.col === ci;
              return (
                <button key={ci} onClick={() => setSelection({ type: 'col', col: ci })} style={{
                  width: 56, height: 30, flexShrink: 0, border: 'none',
                  borderBottom: `1px solid ${T.line}`, borderLeft: `1px solid ${T.line}`,
                  background: on ? T.amber : T.panel, color: on ? '#1a0f08' : T.ink2,
                  fontFamily: T.mono, fontSize: 10, fontWeight: 700,
                }}>{typeof label === 'number' ? Math.round(label) : label}</button>
              );
            })}
          </div>
          {values.map((row, ri) => {
            const on = selection?.type === 'row' && selection.row === ri;
            return (
              <div key={ri} style={{ display: 'flex' }}>
                <button onClick={() => setSelection({ type: 'row', row: ri })} style={{
                  width: 52, height: 34, flexShrink: 0, border: 'none',
                  borderRight: `1px solid ${T.line}`, borderTop: `1px solid ${T.line}`,
                  background: on ? T.amber : T.panel, color: on ? '#1a0f08' : T.ink2,
                  fontFamily: T.mono, fontSize: 10, fontWeight: 700,
                }}>{typeof yLabels[ri] === 'number' ? Math.round(yLabels[ri]) : yLabels[ri]}</button>
                {row.map((val, ci) => (
                  <button key={ci} onClick={() => setSelection({ type: 'cell', row: ri, col: ci })} style={{
                    width: 56, height: 34, flexShrink: 0,
                    border: isSelected(ri, ci) ? `2px solid ${T.ink}` : '1px solid rgba(0,0,0,0.35)',
                    background: heat(val, min, min + spread), color: '#f2f5f7',
                    fontFamily: T.mono, fontSize: 11.5, fontWeight: 700,
                  }}>{fmt(val)}</button>
                ))}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/**
 * Editing controls for the current selection.
 *
 * The quantization readout is the point of this panel. A real table cannot hold
 * arbitrary precision, and a tuner who types 30.3 into a half-degree table should
 * be told the ECU will run 30.5 — not have it silently rounded behind their back.
 */
function EditDock({ map, values, selection, onApply, onSet, onClose }) {
  const [typed, setTyped] = useState('');

  if (!selection) return null;

  const cells = [];
  if (selection.type === 'cell') cells.push([selection.row, selection.col]);
  else if (selection.type === 'row') values[selection.row].forEach((_, c) => cells.push([selection.row, c]));
  else values.forEach((_, r) => cells.push([r, selection.col]));

  const current = cells.reduce((sum, [r, c]) => sum + values[r][c], 0) / cells.length;
  const label =
    selection.type === 'cell' ? `Cell [${selection.row}, ${selection.col}]`
      : selection.type === 'row' ? `Row ${selection.row} — ${cells.length} cells`
        : `Column ${selection.col} — ${cells.length} cells`;

  // What the ECU would actually store for the value in the box.
  const preview = typed !== '' && Number.isFinite(Number(typed))
    ? quantize(map.scaling, Number(typed))
    : null;

  const steps = [-1, -0.5, +0.5, +1];

  return (
    <div style={{ background: T.panel, border: `1px solid ${T.lineHi}`, borderRadius: 12, padding: 14, marginTop: 12 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 10 }}>
        <div>
          <div style={{ fontSize: 12.5, fontWeight: 800, color: T.ink }}>{label}</div>
          <div style={{ fontSize: 11, color: T.ink2, marginTop: 2, fontFamily: T.mono }}>
            {selection.type === 'cell' ? 'value' : 'mean'} {current.toFixed(map.scaling.decimals ?? 1)} {map.scaling.units}
          </div>
        </div>
        <button onClick={onClose} style={{ background: 'none', border: 'none', color: T.ink3, fontSize: 12, fontWeight: 700 }}>CLOSE</button>
      </div>

      <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
        {steps.map((d) => (
          <button key={d} onClick={() => onApply(cells, d)} style={{
            flex: 1, padding: '11px 0', borderRadius: 9, fontFamily: T.mono, fontSize: 13, fontWeight: 800,
            border: `1px solid ${T.line}`, background: T.panel2, color: d < 0 ? T.cyan : T.amberInk,
          }}>{d > 0 ? `+${d}` : d}</button>
        ))}
      </div>

      <div style={{ display: 'flex', gap: 6 }}>
        <input
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
          placeholder={`set to… (${map.scaling.units || 'raw'})`}
          inputMode="decimal"
          style={{
            flex: 1, padding: '11px 12px', borderRadius: 9, border: `1px solid ${T.line}`,
            background: T.panel2, color: T.ink, fontFamily: T.mono, fontSize: 13,
          }}
        />
        <button
          onClick={() => { if (preview) { onSet(cells, Number(typed)); setTyped(''); } }}
          disabled={!preview}
          style={{
            padding: '11px 18px', borderRadius: 9, fontWeight: 800, fontSize: 12.5,
            border: `1px solid ${preview ? T.amber : T.line}`,
            background: preview ? T.amberBg : T.panel2, color: preview ? T.amberInk : T.ink3,
          }}
        >SET</button>
      </div>

      {preview && (preview.quantized || preview.clamped) && (
        <div style={{
          marginTop: 9, fontSize: 11.5, lineHeight: 1.5, fontFamily: T.mono,
          color: preview.clamped ? T.yellow : T.ink2,
        }}>
          {preview.clamped
            ? `This table cannot hold ${typed}. It would store ${preview.actual} ${map.scaling.units} — the limit of its storage type.`
            : `The table's resolution cannot express ${typed}. The ECU will run ${preview.actual} ${map.scaling.units} (raw ${preview.raw}).`}
        </div>
      )}
    </div>
  );
}

export default function RomScreen() {
  /** The untouched dump, kept so a definition can be loaded later without losing it. */
  const [originalBytes, setOriginalBytes] = useState(null);
  const [image, setImage] = useState(null);
  const [definition, setDefinition] = useState(null);
  const [defProblems, setDefProblems] = useState([]);
  const [error, setError] = useState(null);
  const [activeMapId, setActiveMapId] = useState(null);
  const [selection, setSelection] = useState(null);

  // RomImage owns a mutable byte buffer, so React cannot see edits by identity.
  // Bumping a counter after each write is the honest way to say "that changed"
  // without copying half a megabyte on every keystroke.
  const [revision, setRevision] = useState(0);
  const touched = () => setRevision((r) => r + 1);

  const loadRom = async (file) => {
    setError(null);
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      const next = new RomImage(bytes, definition ?? undefined);
      setOriginalBytes(bytes);
      setImage(next);
      setActiveMapId(next.def?.maps[0]?.id ?? null);
      setSelection(null);
      touched();
    } catch (err) {
      setError(`Could not open ${file.name}: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  const loadDefinition = async (file) => {
    setError(null);
    try {
      const { definition: def, problems } = importRomRaider(await file.text());
      setDefinition(def);
      setDefProblems(problems);

      if (originalBytes) {
        // Rebuild against the new definition, carrying any edits already made.
        const working = image ? new Uint8Array(image.bytes) : null;
        const next = new RomImage(originalBytes, def);
        if (working && working.length === next.bytes.length) next.bytes = working;
        setImage(next);
        setActiveMapId(def.maps[0]?.id ?? null);
        setSelection(null);
        touched();
      }
    } catch (err) {
      setError(`Could not read that definition: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  const checksum = useMemo(
    () => (image ? image.checkChecksum() : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [image, revision]
  );
  const changedBytes = useMemo(
    () => (image ? image.changedBytes().length : 0),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [image, revision]
  );
  const partNumbers = useMemo(
    () => (image ? findPartNumbers(image.original).slice(0, 4) : []),
    [image]
  );
  const changedCells = useMemo(
    () => (image?.def ? image.changedCells() : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [image, revision]
  );

  const activeMap = image?.def?.maps.find((m) => m.id === activeMapId) ?? null;
  const values = activeMap ? image.readMap(activeMapId) : null;
  const axes = activeMap ? image.readAxes(activeMapId) : null;

  const applyDelta = (cells, delta) => {
    for (const [r, c] of cells) {
      image.writeCell(activeMapId, r, c, values[r][c] + delta);
    }
    touched();
  };
  const applySet = (cells, value) => {
    for (const [r, c] of cells) image.writeCell(activeMapId, r, c, value);
    touched();
  };

  const download = () => {
    setError(null);
    try {
      const out = image.export();
      const blob = new Blob([out], { type: 'application/octet-stream' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'tuned.bin';
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  /* ---------------- empty state ---------------- */

  if (!image) {
    return (
      <div style={{ padding: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
          <div style={{ width: 3, height: 13, background: T.amber, borderRadius: 2 }} />
          <HardDrive size={13} color={T.amberInk} />
          <span style={{ fontSize: 10.5, letterSpacing: 1.6, color: T.amberInk, textTransform: 'uppercase', fontWeight: 800 }}>
            Real ROM
          </span>
        </div>
        <h2 style={{ fontSize: 19, fontWeight: 800, margin: '0 0 8px', color: T.ink }}>Open an ECU binary</h2>
        <p style={{ fontSize: 13, color: T.ink2, lineHeight: 1.6, margin: '0 0 14px' }}>
          Load a dump taken from a real Nissan ECU and edit its actual maps. Everything
          on this screen happens on your laptop — no serial port is involved and nothing
          here can reach a car.
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 14 }}>
          <FileButton label="OPEN ROM (.bin)" accept=".bin,.rom,application/octet-stream" onFile={loadRom} icon={Upload} tone="primary" />
          <FileButton label="LOAD DEFINITION (RomRaider .xml)" accept=".xml,text/xml" onFile={loadDefinition} icon={FileCode2} />
        </div>

        {definition && (
          <div style={{ fontSize: 12, color: T.green, fontFamily: T.mono, marginBottom: 10 }}>
            Definition ready: {definition.name} · {definition.maps.length} maps
          </div>
        )}

        {error && (
          <div style={{ display: 'flex', gap: 9, background: T.redBg, border: '1px solid #4a1f1f', borderRadius: 10, padding: '11px 13px', fontSize: 12.5, color: T.red, lineHeight: 1.55 }}>
            <AlertTriangle size={15} style={{ flexShrink: 0, marginTop: 1 }} />
            <div>{error}</div>
          </div>
        )}

        <div style={{ display: 'flex', gap: 9, background: T.panel2, border: `1px solid ${T.line}`, borderRadius: 10, padding: '11px 13px', margin: '10px 0', fontSize: 12.5, color: '#b7c0c9', lineHeight: 1.55 }}>
          <Search size={15} style={{ flexShrink: 0, marginTop: 1, color: T.ink2 }} />
          <div>
            No dump yet? Getting one needs an FTDI K-line cable and nisprog — see
            <span style={{ fontFamily: T.mono, color: T.cyan }}> docs/hardware/z33-kline-setup.md</span>.
            A ROM opens without a definition too: you still get identity, checksum status
            and the strings, just no maps.
          </div>
        </div>
      </div>
    );
  }

  /* ---------------- loaded ---------------- */

  const checksumOk = checksum?.located && checksum.valid;

  return (
    <div style={{ padding: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10 }}>
        <div style={{ width: 3, height: 13, background: T.amber, borderRadius: 2 }} />
        <HardDrive size={13} color={T.amberInk} />
        <span style={{ fontSize: 10.5, letterSpacing: 1.6, color: T.amberInk, textTransform: 'uppercase', fontWeight: 800 }}>
          Real ROM
        </span>
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 10 }}>
        <Fact label="SIZE" value={`${(image.size / 1024).toFixed(0)} kB`} />
        <Fact label="CPU" value={image.cpuGuess} />
        <Fact
          label="CHECKSUM"
          value={checksum?.located ? (checksum.valid ? 'VALID' : 'STALE') : 'NOT FOUND'}
          color={checksumOk ? T.green : checksum?.located ? T.yellow : T.ink2}
        />
        <Fact label="BYTES CHANGED" value={String(changedBytes)} color={changedBytes ? T.amberInk : T.ink2} />
      </div>

      {partNumbers.length > 0 && (
        <div style={{ fontSize: 11.5, color: T.ink2, fontFamily: T.mono, marginBottom: 10 }}>
          Part number candidates:{' '}
          {partNumbers.map((p) => `${p.text} @ ${hex(p.offset)}`).join(' · ')}
        </div>
      )}

      {!checksum?.located && (
        <div style={{ display: 'flex', gap: 9, background: T.yellowBg, border: '1px solid #3a2f16', borderRadius: 10, padding: '11px 13px', margin: '10px 0', fontSize: 12.5, color: T.yellow, lineHeight: 1.55 }}>
          <AlertTriangle size={15} style={{ flexShrink: 0, marginTop: 1 }} />
          <div>
            The checksum words could not be located in this image, and could not be
            derived from it either. Either this is not a stock dump, or this ECU does not
            use the plain sum/xor scheme. Export is blocked until a definition supplies
            their addresses — an image whose checksum cannot be verified is an ECU that
            may not start.
          </div>
        </div>
      )}

      {defProblems.length > 0 && (
        <div style={{ background: T.panel2, border: `1px solid ${T.line}`, borderRadius: 10, padding: '10px 12px', marginBottom: 10, fontSize: 11.5, color: T.ink2, fontFamily: T.mono, lineHeight: 1.7 }}>
          <div style={{ color: T.yellow, fontWeight: 700, marginBottom: 3 }}>
            {defProblems.length} table(s) skipped from the definition
          </div>
          {defProblems.slice(0, 6).map((p, i) => <div key={i}>{p}</div>)}
        </div>
      )}

      {image.validation.errors.length > 0 && (
        <div style={{ background: T.redBg, border: '1px solid #4a1f1f', borderRadius: 10, padding: '10px 12px', marginBottom: 10, fontSize: 11.5, color: T.red, fontFamily: T.mono, lineHeight: 1.7 }}>
          {image.validation.errors.slice(0, 6).map((e, i) => <div key={i}>{e}</div>)}
        </div>
      )}
      {image.validation.warnings.length > 0 && (
        <div style={{ background: T.yellowBg, border: '1px solid #3a2f16', borderRadius: 10, padding: '10px 12px', marginBottom: 10, fontSize: 11.5, color: T.yellow, fontFamily: T.mono, lineHeight: 1.7 }}>
          {image.validation.warnings.slice(0, 6).map((w, i) => <div key={i}>{w}</div>)}
        </div>
      )}

      {error && (
        <div style={{ display: 'flex', gap: 9, background: T.redBg, border: '1px solid #4a1f1f', borderRadius: 10, padding: '11px 13px', marginBottom: 10, fontSize: 12.5, color: T.red, lineHeight: 1.55 }}>
          <AlertTriangle size={15} style={{ flexShrink: 0, marginTop: 1 }} />
          <div>{error}</div>
        </div>
      )}

      {!image.def && (
        <div style={{ marginBottom: 12 }}>
          <div style={{ fontSize: 12.5, color: T.ink2, lineHeight: 1.6, marginBottom: 8 }}>
            No definition loaded, so there are no maps to edit — this is a dump with no
            map for where anything is. Load a RomRaider definition matching this ECU.
          </div>
          <FileButton label="LOAD DEFINITION (RomRaider .xml)" accept=".xml,text/xml" onFile={loadDefinition} icon={FileCode2} />
        </div>
      )}

      {image.def && image.def.maps.length > 0 && (
        <>
          <select
            value={activeMapId ?? ''}
            onChange={(e) => { setActiveMapId(e.target.value); setSelection(null); }}
            style={{
              width: '100%', padding: '11px 12px', borderRadius: 9, marginBottom: 10,
              border: `1px solid ${T.line}`, background: T.panel2, color: T.ink,
              fontSize: 13, fontWeight: 700,
            }}
          >
            {image.def.maps.map((m) => (
              <option key={m.id} value={m.id}>
                {m.category ? `${m.category} — ` : ''}{m.name} ({m.rows}×{m.cols})
              </option>
            ))}
          </select>

          {activeMap && values && (
            <>
              <div style={{ fontSize: 11.5, color: T.ink2, marginBottom: 8, lineHeight: 1.55 }}>
                {activeMap.description && <div style={{ marginBottom: 3 }}>{activeMap.description}</div>}
                <span style={{ fontFamily: T.mono }}>
                  {hex(activeMap.address)} · {activeMap.scaling.storageType} · {activeMap.scaling.units || 'raw counts'}
                </span>
              </div>

              <MapGrid
                values={values}
                axes={{
                  x: axes.x, y: axes.y,
                  xName: activeMap.xAxis?.name, yName: activeMap.yAxis?.name,
                }}
                decimals={activeMap.scaling.decimals}
                selection={selection}
                setSelection={setSelection}
              />

              <EditDock
                map={activeMap}
                values={values}
                selection={selection}
                onApply={applyDelta}
                onSet={applySet}
                onClose={() => setSelection(null)}
              />
            </>
          )}
        </>
      )}

      {changedCells.length > 0 && (
        <div style={{ marginTop: 14 }}>
          <div style={{ fontSize: 10, letterSpacing: 1, color: T.ink3, fontWeight: 800, marginBottom: 5 }}>
            CHANGES AGAINST THE ORIGINAL DUMP
          </div>
          <div style={{ background: T.panel2, border: `1px solid ${T.line}`, borderRadius: 10, padding: '10px 12px', fontSize: 11.5, color: T.ink2, fontFamily: T.mono, lineHeight: 1.8 }}>
            {changedCells.map((m) => (
              <div key={m.mapId}>
                <span style={{ color: T.amberInk }}>{m.name}</span> — {m.changes.length} cell(s)
                {m.changes.slice(0, 4).map((c, i) => (
                  <div key={i} style={{ paddingLeft: 12 }}>
                    [{c.row}, {c.col}] {c.from} → <span style={{ color: T.ink }}>{c.to}</span>
                  </div>
                ))}
                {m.changes.length > 4 && <div style={{ paddingLeft: 12, color: T.ink3 }}>…and {m.changes.length - 4} more</div>}
              </div>
            ))}
          </div>
        </div>
      )}

      <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
        <button
          onClick={() => { image.revert(); setSelection(null); touched(); }}
          disabled={!changedBytes}
          style={{
            flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7,
            padding: '12px 0', borderRadius: 9, fontWeight: 800, fontSize: 12.5,
            border: `1px solid ${T.line}`, background: T.panel2,
            color: changedBytes ? T.ink2 : T.ink3,
          }}
        ><RotateCcw size={15} />REVERT</button>
        <button
          onClick={download}
          disabled={!checksum?.located}
          style={{
            flex: 2, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7,
            padding: '12px 0', borderRadius: 9, fontWeight: 800, fontSize: 12.5,
            border: `1px solid ${checksum?.located ? T.amber : T.line}`,
            background: checksum?.located ? T.amberBg : T.panel2,
            color: checksum?.located ? T.amberInk : T.ink3,
          }}
        ><Download size={15} />EXPORT ROM</button>
      </div>

      <div style={{ display: 'flex', gap: 9, background: T.panel2, border: `1px solid ${T.line}`, borderRadius: 10, padding: '11px 13px', marginTop: 12, fontSize: 12.5, color: '#b7c0c9', lineHeight: 1.55 }}>
        <CheckCircle2 size={15} style={{ flexShrink: 0, marginTop: 1, color: T.green }} />
        <div>
          Export recalculates the checksum and verifies it before the file is written. If
          it cannot be made valid, you get an error instead of a download — a ROM that
          fails its own checksum is an ECU that will not start.
          <div style={{ marginTop: 6, color: T.ink2 }}>
            Keep your original dump. It is the only thing that gets you back if a flash
            goes wrong, and these parts are rated for roughly a hundred writes.
          </div>
        </div>
      </div>
    </div>
  );
}
