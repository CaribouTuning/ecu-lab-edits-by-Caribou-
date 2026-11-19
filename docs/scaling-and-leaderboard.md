# Many players, and a leaderboard: what the code already gives, and what it needs

An audit, not a design to build now: where ECU Lab's work happens today, why the simulator is
ready to referee a public leaderboard (best hp, by I4, I6, V6 and V8), and what such a
leaderboard has to add. Every figure here was measured on this code.

## Where things run today

- **On the player's device, all of it.** The simulator runs in the page and in two web workers
  (`src/ui/sim/warm.js`); saves go to `localStorage` (the artifact host's store where there is
  one, memory otherwise: `src/storage.js`); solved breathing is kept in IndexedDB
  (`src/ui/sim/breathingStore.js`). The app makes no network request of any kind.
- **So players cost the server nothing.** Thousands at once is thousands of devices each
  running their own engine; hosting is static files behind a CDN. There is no backend to fall
  over, and none hidden.
- **The one server is the Discord `/dyno` bot** (`bot/`, on Vercel): it checks Discord's
  Ed25519 signature and rejects a request more than five minutes old (no replays), answers at
  once and does the pull afterwards, and serves one request per instance (Fluid compute off) so
  one tester's pull never makes another's wait past Discord's three seconds.

## Why the simulator can be the referee

A leaderboard must never rank a number the player's own browser computed: it can be edited in
seconds. The server re-runs the pull and ranks its own result. The simulator is ready for that:

- **Portable.** `src/sim` imports only itself, and touches no browser API, network, clock or
  unseeded random number (`tests/sim-portable.test.js` keeps it so). It runs unchanged in Node.
- **Deterministic.** A pull is the same to the last bit whatever ran before it in the process:
  the 13 factory engines pulled in order, then in reverse after six unrelated custom engines
  had filled every cache, hash identically. Kept breathing is checked bit for bit before use
  (`tests/breathing-reuse.test.js`).
- **Bounded.** Every cache is capped (breathing grids 48, runner lengths 4,096, knock limits
  50,000, dissociation 2,000). 300 different custom engines pulled in one process: heap
  20 → 43 MB.
- **Its inputs are already named in one place.** `src/ui/state/pullSignature.js` lists every
  input a pull is computed from: exactly what a submission carries, and what the server hashes
  to cache and deduplicate.
- **The segments are the game's own.** A layout is one of I4, I6, V6, V8 (`CONFIG_OPTS`).
- **It has a version.** `tests/fixtures/fingerprint.sha256` moves whenever any physics number
  does (CI fails until it is refreshed).

## What a leaderboard needs that is not here yet

1. **Submit inputs, never results.** The client sends the pull signature's fields; the server
   runs `simulateSweep` on `pullInputs` and stores its own peak.
2. **Validate every input at the boundary.** The UI never sends a value out of range, but a
   forged request can, and the physics does not guard against it. Measured on an LS6:
   NaN bore → NaN hp; MAF scalar 0 → −10 whp; a 20:1 blower ratio → −116 whp; injector index 99
   → an exception. Only engine geometry has a validator today (`validateCustomEngine`). Needed:
   one schema over every signed field, with the UI's own limits (`CUSTOM_ENGINE_LIMITS`, each
   compressor's `boostCeiling`, option indices, table sizes and cell ranges, the ECU
   calibration's fields), finite numbers only, and a size cap on the request.
3. **Pin the physics version.** Store the fingerprint with each entry. When physics changes,
   re-run every entry (deterministic, so a batch job) or start a new season.
4. **Budget the CPU.** A custom engine the server has not seen costs about 1.5–2.5 s of one
   core (its breathing is solved from scratch); a factory engine about half a second. Verify in
   a queue with a worker pool, not inside the request; cache by signature hash; rate-limit per
   account. A few thousand submissions an hour fit on one small machine.
5. **Accounts and a database.** One table is enough to start: `entries(id, user, segment, hp,
   signature_hash, inputs jsonb, fingerprint, created_at)`, indexed on
   `(segment, fingerprint, hp desc)`. Reads dominate: cache the top of each board.
6. **Write the rules down.** What counts as an entry (the engine survived the pull; no knock
   or lean on it?), wheel or crank hp (the simulator reports wheel), whether nitrous counts,
   and how ties break.
7. **Show the server's number.** JavaScript's `Math` functions may differ in the last bit from
   one browser engine to another, so a client's figure can differ from the server's in its
   last digit. The server's is the one ranked and shown.

Nothing on the client has to change for this but a Submit button that sends the signature's
fields to one endpoint.
