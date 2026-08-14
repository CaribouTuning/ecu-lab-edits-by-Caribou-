/**
 * Nissan SH705x ROM checksums.
 *
 * A stock Nissan ROM stores two 32-bit values computed over the whole image: a
 * running SUM of every big-endian u32, and a running XOR of the same words. The
 * ECU verifies both at startup. Get them wrong and the ECU refuses to run — which
 * is the single most common way a first-time reflash ends badly.
 *
 * Both values are computed over the image with the two stored checksum words
 * themselves excluded from the total, because they cannot be part of a sum that
 * produces them.
 *
 * There are two ways to make a modified ROM check out again:
 *
 *  - {@link fixByRewrite} — recompute the two words and store the new values.
 *    Simple and always works on a ROM you flash yourself.
 *  - {@link fixByCorrection} — leave the two stored words at their factory values
 *    and instead adjust three spare "correction" words elsewhere in the image so
 *    the totals come back out to the original numbers. Needed when something else
 *    (an immobiliser routine, a signature, another tool) expects the factory
 *    checksum values to be unchanged.
 *
 * The algorithms are ports of `sum32()` and `checksum_fix()` from fenugrec's
 * nissutils (`cli_utils/nislib.c`, GPLv3). See docs/rom/LICENSING.md — this file
 * is a clean-room-in-name-only reimplementation and carries that provenance.
 *
 * Everything here is unsigned 32-bit modular arithmetic. JavaScript bitwise
 * operators produce *signed* 32-bit results, so every value is forced back to
 * unsigned with `>>> 0` at each step. Dropping one of those is a silent
 * correctness bug that only shows up on ROMs whose sum happens to exceed 2^31.
 */

/**
 * Read a big-endian unsigned 32-bit word.
 *
 * SuperH ECUs are big-endian, so the most significant byte is at the lowest
 * address. This is the one endianness decision that everything else inherits.
 *
 * @param {Uint8Array} buf
 * @param {number} offset byte offset, need not be aligned
 * @returns {number} value in [0, 2^32)
 */
export function readU32BE(buf, offset) {
  return (
    ((buf[offset] << 24) |
      (buf[offset + 1] << 16) |
      (buf[offset + 2] << 8) |
      buf[offset + 3]) >>>
    0
  );
}

/**
 * Write a big-endian unsigned 32-bit word.
 *
 * @param {Uint8Array} buf
 * @param {number} offset
 * @param {number} value truncated to 32 bits
 */
export function writeU32BE(buf, offset, value) {
  const v = value >>> 0;
  buf[offset] = (v >>> 24) & 0xff;
  buf[offset + 1] = (v >>> 16) & 0xff;
  buf[offset + 2] = (v >>> 8) & 0xff;
  buf[offset + 3] = v & 0xff;
}

/**
 * Running sum and xor of every big-endian u32 in the image.
 *
 * Any trailing bytes past the last whole 4-byte word are ignored, matching the
 * `siz &= ~3` in the reference implementation. A real ROM is always a whole
 * number of 32-bit words, so this only matters for truncated dumps.
 *
 * @param {Uint8Array} buf
 * @returns {{sum: number, xor: number}} both unsigned 32-bit
 */
export function sum32(buf) {
  const size = buf.length & ~3;
  let sum = 0;
  let xor = 0;
  for (let i = 0; i < size; i += 4) {
    const word = readU32BE(buf, i);
    sum = (sum + word) >>> 0;
    xor = (xor ^ word) >>> 0;
  }
  return { sum, xor };
}

/**
 * Sum and xor with the two stored checksum words excluded from the totals.
 *
 * This is the quantity the ECU actually compares against, so it is what both
 * verification and both repair strategies are written in terms of.
 *
 * @param {Uint8Array} buf
 * @param {number} sumOffset byte offset of the stored SUM word
 * @param {number} xorOffset byte offset of the stored XOR word
 * @returns {{sum: number, xor: number}}
 */
function sum32Excluding(buf, sumOffset, xorOffset) {
  const { sum, xor } = sum32(buf);
  const storedSum = readU32BE(buf, sumOffset);
  const storedXor = readU32BE(buf, xorOffset);
  return {
    sum: (sum - storedSum - storedXor) >>> 0,
    xor: (xor ^ storedSum ^ storedXor) >>> 0,
  };
}

/**
 * Guard the offsets a caller hands us before we index with them.
 *
 * A bad offset here would silently corrupt an unrelated part of the image, and
 * the result would still look like a valid ROM. Fail loudly instead.
 *
 * @param {Uint8Array} buf
 * @param {number[]} offsets
 */
function assertWordOffsets(buf, offsets) {
  for (const offset of offsets) {
    if (!Number.isInteger(offset) || offset < 0 || offset + 4 > buf.length) {
      throw new RangeError(
        `checksum offset 0x${Number(offset).toString(16)} is outside a ${buf.length}-byte image`
      );
    }
    if (offset & 3) {
      throw new RangeError(
        `checksum offset 0x${offset.toString(16)} is not 4-byte aligned`
      );
    }
  }
}

/**
 * Check a ROM against its own stored checksum words.
 *
 * @param {Uint8Array} buf
 * @param {number} sumOffset
 * @param {number} xorOffset
 * @returns {{valid: boolean, storedSum: number, storedXor: number,
 *            actualSum: number, actualXor: number}}
 */
export function verify(buf, sumOffset, xorOffset) {
  assertWordOffsets(buf, [sumOffset, xorOffset]);
  const storedSum = readU32BE(buf, sumOffset);
  const storedXor = readU32BE(buf, xorOffset);
  const { sum, xor } = sum32Excluding(buf, sumOffset, xorOffset);
  return {
    valid: sum === storedSum && xor === storedXor,
    storedSum,
    storedXor,
    actualSum: sum,
    actualXor: xor,
  };
}

/**
 * Repair strategy 1: recompute the checksums and store the new values.
 *
 * Zeroes both stored words so they contribute nothing, totals the image, and
 * writes the results back. Mutates `buf` in place and returns the new values.
 *
 * @param {Uint8Array} buf
 * @param {number} sumOffset
 * @param {number} xorOffset
 * @returns {{sum: number, xor: number}} the values now stored
 */
export function fixByRewrite(buf, sumOffset, xorOffset) {
  assertWordOffsets(buf, [sumOffset, xorOffset]);

  writeU32BE(buf, sumOffset, 0);
  writeU32BE(buf, xorOffset, 0);

  const { sum, xor } = sum32(buf);

  writeU32BE(buf, sumOffset, sum);
  writeU32BE(buf, xorOffset, xor);

  const check = verify(buf, sumOffset, xorOffset);
  if (!check.valid) {
    throw new Error(
      'checksum rewrite did not verify — refusing to hand back a ROM that would not boot'
    );
  }
  return { sum, xor };
}

/**
 * Repair strategy 2: keep the factory checksum words, adjust three spare words.
 *
 * The image has to total to the two values already stored in it. We have three
 * free 32-bit words to play with, so we need `a + b + c == requiredSum` and
 * `a ^ b ^ c == requiredXor` simultaneously. Setting `a == b` makes the xor of
 * the pair vanish, so `c` is forced to `requiredXor`, and `a` and `b` split
 * whatever sum is left over.
 *
 * That last step needs the leftover to be even. It always is on a well-formed
 * ROM: bit 0 of a sum is the xor of all the bit 0s, so the low bits of the sum
 * and xor totals agree by construction. If they do not, the offsets are wrong or
 * the image is damaged, and we refuse rather than write a ROM that is off by one.
 *
 * Mutates `buf` in place.
 *
 * @param {Uint8Array} buf
 * @param {number} sumOffset byte offset of the stored SUM word
 * @param {number} xorOffset byte offset of the stored XOR word
 * @param {number} correctionOffset offset of three consecutive spare u32 words
 * @returns {{a: number, b: number, c: number}} the correction values written
 */
export function fixByCorrection(buf, sumOffset, xorOffset, correctionOffset) {
  const a0 = correctionOffset;
  const b0 = correctionOffset + 4;
  const c0 = correctionOffset + 8;
  assertWordOffsets(buf, [sumOffset, xorOffset, a0, b0, c0]);

  // The factory values are the targets we have to hit; read them before we
  // disturb anything.
  const targetSum = readU32BE(buf, sumOffset);
  const targetXor = readU32BE(buf, xorOffset);

  // Clear the correction words so the totals below reflect the rest of the image
  // only, then measure how far off we are.
  writeU32BE(buf, a0, 0);
  writeU32BE(buf, b0, 0);
  writeU32BE(buf, c0, 0);

  const actual = sum32Excluding(buf, sumOffset, xorOffset);

  const requiredSum = (targetSum - actual.sum) >>> 0;
  const requiredXor = (targetXor ^ actual.xor) >>> 0;

  const c = requiredXor;
  const remainder = (requiredSum - c) >>> 0;
  if (remainder & 1) {
    throw new Error(
      'checksum correction needs an even remainder and got an odd one — ' +
        'the sum/xor offsets are probably wrong for this ROM'
    );
  }
  const a = remainder / 2;
  const b = a;

  writeU32BE(buf, a0, a);
  writeU32BE(buf, b0, b);
  writeU32BE(buf, c0, c);

  const check = verify(buf, sumOffset, xorOffset);
  if (!check.valid) {
    throw new Error(
      'checksum correction did not verify — refusing to hand back a ROM that would not boot'
    );
  }
  return { a, b, c };
}

/**
 * Locate the stored checksum words by brute force.
 *
 * Where the two words live varies between ROMs, and getting them from a
 * definition file is the reliable route. But an unknown ROM can still be solved
 * from arithmetic alone, which is worth having when you are staring at a fresh
 * dump with no definition for it.
 *
 * The trick, from nissutils: total the whole image *including* the two unknown
 * checksum words. The xor total collapses to the stored sum value, because the
 * stored xor cancels itself out of its own xor. That gives one value outright,
 * and the other falls out of the sum total. Then we only have to find where
 * those two numbers sit in the image.
 *
 * @param {Uint8Array} buf
 * @returns {{sumOffset: number, xorOffset: number, sum: number, xor: number} | null}
 *          null when the candidate values do not appear in the image, which means
 *          this ROM does not use the plain sum/xor scheme
 */
export function findChecksumOffsets(buf) {
  const totals = sum32(buf);

  // xor of everything == the stored SUM word, since the stored XOR word cancels
  // against itself. Then sum of everything == storedSum*2 + storedXor.
  const candidateSum = totals.xor;
  const candidateXor = (totals.sum - 2 * candidateSum) >>> 0;

  let sumOffset = -1;
  let xorOffset = -1;
  const size = buf.length & ~3;
  for (let i = 0; i < size; i += 4) {
    const word = readU32BE(buf, i);
    if (sumOffset < 0 && word === candidateSum) sumOffset = i;
    else if (xorOffset < 0 && word === candidateXor) xorOffset = i;
    if (sumOffset >= 0 && xorOffset >= 0) break;
  }

  if (sumOffset < 0 || xorOffset < 0) return null;

  // Only trust the answer if it actually verifies. A coincidental byte match
  // somewhere in the image is entirely possible and would be a disaster.
  const check = verify(buf, sumOffset, xorOffset);
  if (!check.valid) return null;

  return { sumOffset, xorOffset, sum: candidateSum, xor: candidateXor };
}
