/**
 * The read-only gate.
 *
 * SPDX-License-Identifier: GPL-3.0-or-later
 *
 * Every command bound for nisprog passes through here first. This is the reason
 * a read-only release can be claimed to be read-only rather than merely intended
 * to be: there is one function, it works from an allowlist, and anything it does
 * not recognise is refused.
 *
 * An allowlist rather than a blocklist, because the failure modes are not
 * symmetric. A blocklist that misses a command lets it through to an engine
 * controller; an allowlist that misses one produces an error message. Only one
 * of those is recoverable.
 *
 * The command names come from `np_cmdtable` in nisprog.c plus freediag's own
 * CLI. If nisprog gains a command, it is denied here until someone adds it
 * deliberately.
 */

/**
 * Commands that only read, and are needed to get to a dump.
 *
 * @type {Map<string, string>} command -> what it does
 */
export const READ_ONLY_COMMANDS = new Map([
  // freediag configuration. These set up the transport; none of them touch the ECU.
  ['set', 'configure interface, port and protocol'],
  ['debug', 'enable protocol tracing'],
  ['help', 'command help'],

  // Session control.
  ['npconn', 'connect to the ECU'],
  ['nc', 'connect to the ECU (shorthand)'],
  ['npdisc', 'disconnect'],
  ['nd', 'disconnect (shorthand)'],
  ['npconf', 'set timing parameters'],
  ['setdev', 'declare the MCU type'],
  ['gk', 'guess the seed/key set'],
  ['setkeys', 'supply the seed/key set manually'],
  ['kspeed', 'change kernel comms speed'],

  // The kernel. This uploads code into ECU *RAM* — see the note below.
  ['runkernel', 'upload and run the npkern RAM kernel'],
  ['initk', 'attach to an already-running kernel'],
  ['stopkernel', 'reset the ECU out of the kernel'],

  // Reading.
  ['dumpmem', 'read memory to a file'],
  ['dm', 'read memory to a file (shorthand)'],
  ['watch', 'read 4 bytes at an address'],
  ['flverif', 'compare a file against ROM — reads only, writes nothing'],
]);

/**
 * Commands refused outright in a read-only build, with the reason shown to the user.
 *
 * Naming them explicitly rather than letting them fall through the allowlist means
 * the error message can say *why*, which is the difference between a user who
 * understands the tool and a user who goes looking for a way around it.
 *
 * @type {Map<string, string>}
 */
export const WRITE_COMMANDS = new Map([
  ['flrom', 'writes a whole ROM to flash'],
  ['flblock', 'writes a flash block'],
  ['writevin', 'writes the VIN to the onboard EEPROM'],
  ['npt', 'undocumented test commands — unknown effects, refused on principle'],
  // Subaru SSM. Out of scope here; a smaller command surface is a safer one.
  ['spconn', 'Subaru protocol, out of scope for this bridge'],
  ['sprunkernel', 'Subaru protocol, out of scope for this bridge'],
]);

/**
 * `runkernel` writes — but to RAM, not flash, and there is no way to dump a ROM
 * at a usable speed without it. It is allowed and this is the note explaining
 * why, so nobody has to rediscover the reasoning later.
 */
export const RUNKERNEL_NOTE =
  'runkernel uploads npkern into ECU RAM. It does not touch flash and does not ' +
  'consume a flash write cycle; the ECU returns to stock behaviour on reset. ' +
  'Without it a full ROM read runs at roughly 100 B/s instead of 5.4 kB/s.';

/**
 * @typedef {object} CommandVerdict
 * @property {boolean} allowed
 * @property {string} command the parsed command name
 * @property {string} [reason] why it was refused
 */

/**
 * Decide whether one command line may be sent to nisprog.
 *
 * @param {*} line the raw command line; non-strings are refused rather than coerced
 * @param {{allowWrites?: boolean}} [options] `allowWrites` is not implemented and
 *        exists so the flashing phase has an obvious place to hook in behind its
 *        own gating, rather than someone deleting this module
 * @returns {CommandVerdict}
 */
export function checkCommand(line, options = {}) {
  if (typeof line !== 'string') {
    return { allowed: false, command: '', reason: 'command must be a string' };
  }

  // A newline would let one approved command smuggle a second, unapproved one
  // into nisprog's stdin. Carriage returns and NULs are refused for the same
  // reason. This check has to come before anything else.
  if (/[\r\n\0]/.test(line)) {
    return {
      allowed: false,
      command: '',
      reason: 'a command may not contain newlines or null bytes',
    };
  }

  const trimmed = line.trim();
  if (!trimmed) {
    return { allowed: false, command: '', reason: 'empty command' };
  }
  if (trimmed.length > 512) {
    return { allowed: false, command: '', reason: 'command is implausibly long' };
  }

  const command = trimmed.split(/\s+/)[0].toLowerCase();

  const writeReason = WRITE_COMMANDS.get(command);
  if (writeReason) {
    return {
      allowed: false,
      command,
      reason: options.allowWrites
        ? `"${command}" ${writeReason}, and writing is not implemented in this build`
        : `"${command}" ${writeReason}. This bridge is read-only.`,
    };
  }

  if (!READ_ONLY_COMMANDS.has(command)) {
    return {
      allowed: false,
      command,
      reason: `"${command}" is not on the allowlist. Commands are permitted individually; ` +
        'if this one only reads, it needs adding to READ_ONLY_COMMANDS deliberately.',
    };
  }

  return { allowed: true, command };
}

/**
 * The commands this build will run, for display.
 *
 * @returns {Array<{command: string, does: string}>}
 */
export function describeAllowed() {
  return [...READ_ONLY_COMMANDS].map(([command, does]) => ({ command, does }));
}
