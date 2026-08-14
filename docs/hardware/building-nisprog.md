# Building nisprog

Garage Bridge runs nisprog as a child process, so nisprog has to exist and be
findable before the bridge can do anything.

The Linux build below was run start to finish and produced a working binary; the
version and command list in this document come from that build, not from the
project's README. The Windows instructions are the same CMake project through
MSYS2 and have **not** been run here — the differences are called out where they
are known.

## What you get

```
nisprog v1.05
```

Its command set, from the binary's own `help`:

```
spconn  npconn  npdisc  npconf  setdev  gk  writevin  setkeys  kspeed
sprunkernel  runkernel  stopkernel  watch  initk  dumpmem  flverif
flblock  flrom  npt  log  stoplog  set  test  diag  vw  850  dyno
debug  source  help  up  exit
```

Garage Bridge permits nineteen of those and refuses the rest. `flrom`,
`flblock`, `writevin` and `npt` are refused because they write or have unknown
effects; `source` is refused because it executes commands from a file and would
hand away the entire allowlist in one call.

## Linux (verified)

```bash
sudo apt install build-essential cmake git      # Debian/Ubuntu

git clone --recursive https://github.com/fenugrec/nisprog.git
cd nisprog
cmake -S . -B build -DCMAKE_BUILD_TYPE=Release
cmake --build build -j4
```

The binary lands at `build/nisprog`. `--recursive` matters: nisprog carries
freediag and nissutils as submodules and will not configure without them.

Put it on your PATH:

```bash
sudo install -m 755 build/nisprog /usr/local/bin/nisprog
nisprog --version
```

Then add yourself to the serial group, or every open will fail with a permission
error that looks like a wiring fault:

```bash
sudo usermod -aG dialout $USER     # log out and back in
```

Set the FTDI latency timer to 1 ms. The 16 ms default is longer than several
K-line timing windows:

```bash
echo 1 | sudo tee /sys/bus/usb-serial/devices/ttyUSB0/latency_timer
```

## Windows (not run here)

The same CMake project, built through MSYS2. This is the path nisprog is most
used on.

1. Install [MSYS2](https://www.msys2.org/), then from the **MINGW64** shell:

   ```bash
   pacman -S --needed git mingw-w64-x86_64-gcc mingw-w64-x86_64-cmake mingw-w64-x86_64-make
   ```

2. Build:

   ```bash
   git clone --recursive https://github.com/fenugrec/nisprog.git
   cd nisprog
   cmake -S . -B build -G "MinGW Makefiles" -DCMAKE_BUILD_TYPE=Release
   cmake --build build
   ```

3. `build/nisprog.exe` is the result. Copy it somewhere on your PATH, or point
   the bridge straight at it:

   ```
   node bridge/bin/garage-bridge.js --nisprog C:\tools\nisprog\build\nisprog.exe
   ```

   Pointing at the path is the more reliable option — it sidesteps PATH problems
   entirely and makes it obvious which binary is running.

Windows specifics that bite:

- **Install the FTDI VCP driver from ftdichip.com.** Not the one bundled with a
  cheap cable.
- **Set the latency timer to 1 ms**: Device Manager → Ports → your cable →
  Properties → Port Settings → Advanced → Latency Timer.
- **Port names above COM9 need the `\\.\COM19` form.** Plain `COM19` will not
  open. Either use that form or renumber the port below 10 in Device Manager.
- If MinGW's build fails on a missing header, check that `--recursive` actually
  pulled `freediag/` and `nissutils/` — a shallow clone is the usual cause.

## Checking it works, without a car

nisprog runs fine with no hardware attached, which is enough to prove the build
and to let the bridge talk to it:

```bash
printf 'help\nset interface dumb\nquit\n' | nisprog
```

You should see the banner, `nisprog> `, the command list, and
`interface is now DUMB`. If that works, the bridge will drive it.

Two things this exercise established that the bridge now depends on:

- **The prompt is `nisprog> `**, printed without a trailing newline.
- **freediag echoes each command back** when its stdin is a pipe rather than a
  terminal, so the first line of every reply is the command itself. The bridge
  strips that echo.

## Running as root

nisprog prints a warning if you run it as root, and it is right to. Use the
`dialout` group instead. The bridge does not need elevated privileges either.
