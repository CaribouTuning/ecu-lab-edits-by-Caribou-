/**
 * Storage types and scaling — the bridge between ROM bytes and real units.
 *
 * A map in a real ECU is not a grid of numbers, it is a grid of small integers
 * plus a rule for reading them. An ignition table holds bytes; the ROM says
 * "multiply by 0.5 and subtract 20" and now they are degrees. Every value you
 * type into a map editor has to survive the trip back down to an integer, and
 * the value the ECU ends up running is the rounded one, not the one you typed.
 *
 * That rounding is not a rounding error to be hidden. It is the reason a tuner
 * cannot ask for 12.37 degrees when the table resolution is 0.5, and it is the
 * thing ECU Lab's floating-point calibration tables cannot currently express.
 * Every conversion here reports what the ECU will actually see.
 *
 * Expressions are evaluated by a small parser rather than by `eval`, because
 * definition files are third-party data. Feeding a downloaded XML file to `eval`
 * would let it run arbitrary code in the app.
 */

/**
 * How a value is stored in the ROM, before any scaling is applied.
 *
 * `signed` decides whether the top bit means "negative"; `min`/`max` are the
 * representable raw range and are what a write gets clamped to.
 *
 * @type {Record<string, {bytes: number, signed: boolean, min: number, max: number}>}
 */
export const STORAGE_TYPES = {
  uint8: { bytes: 1, signed: false, min: 0, max: 0xff },
  int8: { bytes: 1, signed: true, min: -0x80, max: 0x7f },
  uint16: { bytes: 2, signed: false, min: 0, max: 0xffff },
  int16: { bytes: 2, signed: true, min: -0x8000, max: 0x7fff },
  uint32: { bytes: 4, signed: false, min: 0, max: 0xffffffff },
  int32: { bytes: 4, signed: true, min: -0x80000000, max: 0x7fffffff },
};

/**
 * Read one raw integer out of the image.
 *
 * Big-endian only. Nissan SH705x ECUs are big-endian throughout, and a
 * definition that claims otherwise is describing a different ECU family.
 *
 * @param {Uint8Array} buf
 * @param {number} offset
 * @param {string} storageType key of {@link STORAGE_TYPES}
 * @returns {number} the raw stored integer, sign-extended if the type is signed
 */
export function readRaw(buf, offset, storageType) {
  const type = STORAGE_TYPES[storageType];
  if (!type) throw new Error(`unknown storage type "${storageType}"`);
  if (offset < 0 || offset + type.bytes > buf.length) {
    throw new RangeError(
      `read of ${type.bytes} bytes at 0x${offset.toString(16)} is outside a ${buf.length}-byte image`
    );
  }

  let value = 0;
  for (let i = 0; i < type.bytes; i++) {
    value = value * 256 + buf[offset + i];
  }

  // Sign-extend by hand. Doing this with `<<` would break on int32, where the
  // shift overflows into JavaScript's signed 32-bit result.
  if (type.signed) {
    const limit = Math.pow(2, type.bytes * 8 - 1);
    if (value >= limit) value -= limit * 2;
  }
  return value;
}

/**
 * Write one raw integer into the image, clamped to what the type can hold.
 *
 * @param {Uint8Array} buf
 * @param {number} offset
 * @param {string} storageType
 * @param {number} value
 * @returns {{written: number, clamped: boolean}} the value actually stored
 */
export function writeRaw(buf, offset, storageType, value) {
  const type = STORAGE_TYPES[storageType];
  if (!type) throw new Error(`unknown storage type "${storageType}"`);
  if (offset < 0 || offset + type.bytes > buf.length) {
    throw new RangeError(
      `write of ${type.bytes} bytes at 0x${offset.toString(16)} is outside a ${buf.length}-byte image`
    );
  }

  const rounded = Math.round(value);
  const written = Math.min(type.max, Math.max(type.min, rounded));
  const clamped = written !== rounded;

  // Work in the unsigned domain so the byte extraction below is uniform.
  let store = written < 0 ? written + Math.pow(2, type.bytes * 8) : written;
  for (let i = type.bytes - 1; i >= 0; i--) {
    buf[offset + i] = store % 256;
    store = Math.floor(store / 256);
  }
  return { written, clamped };
}

/* ------------------------------------------------------------------ *
 * Expression evaluation
 * ------------------------------------------------------------------ */

/**
 * Tokenise an arithmetic expression in one variable.
 *
 * @param {string} src
 * @returns {Array<{type: string, value?: number}>}
 */
function tokenize(src) {
  const tokens = [];
  let i = 0;
  while (i < src.length) {
    const ch = src[i];
    if (ch === ' ' || ch === '\t' || ch === '\n' || ch === '\r') {
      i++;
    } else if (
      (ch >= '0' && ch <= '9') ||
      // Real definitions write ".5" and ".0078125" without a leading zero, so a
      // dot that is followed by a digit starts a number.
      (ch === '.' && src[i + 1] >= '0' && src[i + 1] <= '9')
    ) {
      let j = i;
      while (j < src.length && /[0-9.eE]/.test(src[j])) {
        // Accept the sign of an exponent, but only right after an e/E, so that
        // "2e-3" parses and "2-3" still reads as a subtraction.
        if ((src[j] === 'e' || src[j] === 'E') && (src[j + 1] === '+' || src[j + 1] === '-')) j++;
        j++;
      }
      const text = src.slice(i, j);
      const value = Number(text);
      if (!Number.isFinite(value)) throw new Error(`bad number "${text}" in expression`);
      tokens.push({ type: 'number', value });
      i = j;
    } else if (ch === 'x' || ch === 'X') {
      tokens.push({ type: 'var' });
      i++;
    } else if ('+-*/()'.includes(ch)) {
      tokens.push({ type: ch });
      i++;
    } else {
      throw new Error(`unsupported character "${ch}" in expression "${src}"`);
    }
  }
  return tokens;
}

/**
 * Compile an expression in `x` into a function.
 *
 * Supports the four arithmetic operators, parentheses, unary minus and the
 * single variable `x` — which is everything real RomRaider and TunerPro
 * definitions use. Anything else is rejected rather than guessed at.
 *
 * @param {string} src
 * @returns {(x: number) => number}
 */
export function compileExpression(src) {
  const tokens = tokenize(src);
  let pos = 0;

  const peek = () => tokens[pos]?.type;

  /** @returns {(x: number) => number} */
  function parsePrimary() {
    const token = tokens[pos];
    if (!token) throw new Error(`unexpected end of expression "${src}"`);
    if (token.type === 'number') {
      pos++;
      const value = /** @type {number} */ (token.value);
      return () => value;
    }
    if (token.type === 'var') {
      pos++;
      return (x) => x;
    }
    if (token.type === '-') {
      pos++;
      const operand = parsePrimary();
      return (x) => -operand(x);
    }
    if (token.type === '+') {
      pos++;
      return parsePrimary();
    }
    if (token.type === '(') {
      pos++;
      const inner = parseSum();
      if (peek() !== ')') throw new Error(`unbalanced parenthesis in "${src}"`);
      pos++;
      return inner;
    }
    throw new Error(`unexpected "${token.type}" in expression "${src}"`);
  }

  /** @returns {(x: number) => number} */
  function parseProduct() {
    let left = parsePrimary();
    for (;;) {
      const op = peek();
      if (op !== '*' && op !== '/') return left;
      pos++;
      const right = parsePrimary();
      const l = left;
      left = op === '*' ? (x) => l(x) * right(x) : (x) => l(x) / right(x);
    }
  }

  /** @returns {(x: number) => number} */
  function parseSum() {
    let left = parseProduct();
    for (;;) {
      const op = peek();
      if (op !== '+' && op !== '-') return left;
      pos++;
      const right = parseProduct();
      const l = left;
      left = op === '+' ? (x) => l(x) + right(x) : (x) => l(x) - right(x);
    }
  }

  const fn = parseSum();
  if (pos !== tokens.length) throw new Error(`trailing junk in expression "${src}"`);
  return fn;
}

/**
 * Recover the inverse of an expression, when the expression is linear.
 *
 * Definition files usually supply both directions, but not always. A linear
 * `toReal` can be inverted exactly: sample it at 0 and 1 to recover the slope
 * and intercept, then confirm the fit at a third point so a non-linear
 * expression cannot slip through and silently corrupt a map on write.
 *
 * @param {(x: number) => number} toReal
 * @returns {((real: number) => number) | null} null when not linear
 */
export function invertLinear(toReal) {
  const intercept = toReal(0);
  const slope = toReal(1) - intercept;
  if (!Number.isFinite(slope) || slope === 0) return null;

  // Verify the linear fit away from the sample points. A quadratic would agree
  // at 0 and 1 and diverge here.
  const probe = 37;
  const predicted = slope * probe + intercept;
  const actual = toReal(probe);
  if (Math.abs(predicted - actual) > Math.abs(actual) * 1e-9 + 1e-9) return null;

  return (real) => (real - intercept) / slope;
}

/**
 * A named conversion between raw storage and real units.
 *
 * @typedef {object} Scaling
 * @property {string} name
 * @property {string} units human-readable, shown in the editor
 * @property {string} storageType key of {@link STORAGE_TYPES}
 * @property {(raw: number) => number} toReal
 * @property {(real: number) => number} toRaw
 * @property {number} [decimals] display precision
 */

/**
 * Build a {@link Scaling} from expression strings.
 *
 * @param {object} spec
 * @param {string} spec.name
 * @param {string} [spec.units]
 * @param {string} spec.storageType
 * @param {string} spec.toReal expression in `x`, where x is the raw integer
 * @param {string} [spec.toRaw] expression in `x`, where x is the real value
 * @param {number} [spec.decimals]
 * @returns {Scaling}
 */
export function makeScaling(spec) {
  if (!STORAGE_TYPES[spec.storageType]) {
    throw new Error(`unknown storage type "${spec.storageType}" in scaling "${spec.name}"`);
  }
  const toReal = compileExpression(spec.toReal);

  let toRaw;
  if (spec.toRaw) {
    toRaw = compileExpression(spec.toRaw);
  } else {
    const inverse = invertLinear(toReal);
    if (!inverse) {
      throw new Error(
        `scaling "${spec.name}" has a non-linear conversion and no inverse expression, ` +
          'so values could be read but never written back'
      );
    }
    toRaw = inverse;
  }

  return {
    name: spec.name,
    units: spec.units ?? '',
    storageType: spec.storageType,
    toReal,
    toRaw,
    decimals: spec.decimals ?? 2,
  };
}

/**
 * Convert a real value to what the ECU will actually store and run.
 *
 * Returns the requested value alongside the achievable one so the editor can
 * show the difference. A tuner asking for a resolution the table does not have
 * should be told, not quietly rounded.
 *
 * @param {Scaling} scaling
 * @param {number} real
 * @returns {{raw: number, actual: number, clamped: boolean, quantized: boolean}}
 */
export function quantize(scaling, real) {
  const type = STORAGE_TYPES[scaling.storageType];
  const exact = scaling.toRaw(real);
  const rounded = Math.round(exact);
  const raw = Math.min(type.max, Math.max(type.min, rounded));
  const actual = scaling.toReal(raw);
  return {
    raw,
    actual,
    clamped: raw !== rounded,
    // Compare against the achievable value rather than the raw integer, so this
    // reads true only when the request genuinely could not be represented.
    quantized: Math.abs(actual - real) > 1e-9,
  };
}
