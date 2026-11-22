# Crux Garden Home discovery harness

Start with the [discovery report](../../docs/crux-garden-home-discovery.md). This is an experiment on the Omarchy workstation, not the finished Crux Garden Home application.

## Use the installed system

```bash
cd ~/Workspace/CruxGarden/crux-garden
python3 experiments/home-lab/home_lab.py status
python3 experiments/home-lab/home_lab.py ask \
  'Use offline Wikipedia to explain photosynthesis and cite the article.'
python3 experiments/home-lab/home_lab.py ask \
  'Play the video Crux Garden Calibration' --hold
python3 experiments/home-lab/home_lab.py ask \
  'Launch Crux Checker NES' --hold
```

`--hold` keeps a launched player/emulator open until you press Enter. Without it, the invocation cleans up its own processes before exiting. Test media is muted and emulator audio is disabled in the discovery profile. The generated ROMs display patterns; they are small execution fixtures, not finished games. No commercial ROMs or BIOS files are supplied.

Use `--model lfm2.5:8b` to compare the alternative. `--json` shows tools, observed responses and timing. Models have no shell or arbitrary-file tool. Playback/launch IDs must come from this session's search/list, and the exact normalized title must appear in the original user request. Nicknames and ambiguous titles require another explicit request. This conservative title check prevents substitution in these tests; it is **not a complete natural-language permission system**.

Convenience commands installed under `~/.local/bin`:

```bash
crux-home status
crux-home ask 'Play the video Crux Garden Color Bars' --hold
crux-ollama list
crux-ollama run qwen3.5:9b
crux-retroarch --menu
```

Omarchy’s app launcher also includes **Crux Wikipedia**, **Crux Media**, **Crux RetroArch** and **Crux Local AI**. The interactive RetroArch launcher uses a separate audio-enabled profile that can save your preferences.

The raw `crux-ollama run` chat has no service tools. Use `crux-home ask` for the tool bridge. RetroArch's menu lets you load other legally obtained games with installed cores; the model bridge intentionally exposes only the two original fixtures.

## Local browser and Mac access

- Kiwix: <http://127.0.0.1:8081>
- Jellyfin: <http://127.0.0.1:8096>
- Ollama HTTP API: <http://127.0.0.1:11434> (not a browser chat UI)

Inside Moonlight, open the browser on Omarchy. From a Mac terminal, keep this tunnel running, then open the same browser addresses on the Mac:

```bash
ssh -N -L 8081:127.0.0.1:8081 -L 8096:127.0.0.1:8096 \
  -L 11434:127.0.0.1:11434 daniel@10.0.0.39
```

If a Mac port is already occupied, use a different left-hand port, e.g. `-L 18081:127.0.0.1:8081`, then open `http://127.0.0.1:18081`. The host IP is the currently observed address, not a guaranteed DHCP reservation.

Jellyfin's discovery admin is `crux-admin`. Its generated password and local API token are in `~/.config/crux-garden-home/credentials.json`, mode `0600`. To display the password **in your own terminal**, without putting it in shell history:

```bash
python3 -c 'import json,pathlib; print(json.loads((pathlib.Path.home()/".config/crux-garden-home/credentials.json").read_text())["password"])'
```

Do not paste that file into GitHub. It is excluded from this experiment's Git rules, and the test artifacts do not contain it.

## Repeat the installation

This installer targets the existing **x86-64 Arch/Omarchy environment**, with system Python, curl, bsdtar, ffmpeg, mpv, NVIDIA drivers, Qt6 and the other current dynamic libraries. It is not a general Mac/Windows installer. A different Linux distribution needs its own dependency check. Native Arch package management remains the preferred long-term maintenance path once an interactive administrator is available; this task used isolated official builds because unattended sudo was unavailable.

```bash
cd ~/Workspace/CruxGarden/crux-garden
python3 experiments/home-lab/install_runtime.py --with-wikipedia --pull-models
```

The full download is large: Wikipedia alone is 127,418,087,648 bytes. Allow at least 160 GB free for this stack plus working room; do not download into this machine's RAM-backed `/tmp`. The installer writes only under your home, enables three user services, generates fixtures, and initializes **its dedicated** Jellyfin instance. It refuses to take over an already configured Jellyfin server if the expected private credential record is missing. It does not alter boot, partitions, Windows, SSH, Sunshine, monitors or firewall settings.

The artifact manifest pins observed digests. Ollama and Wikipedia have publisher SHA256 digests; Kiwix tools also had a published MD5. The Arch RetroArch/OpenSSL packages were separately verified against the installed Arch keyring. Some other downloads had no published digest: their locally recorded SHA256 pins the bytes used here, without claiming independent publisher attestation. Nightly core and core-info URLs are mutable: if they change, verification intentionally fails. Review upstream changes and update the manifest instead of deleting the hash checks.

`--configure-only` installs service/config templates and command wrappers using already extracted binaries; it also generates fixtures and initializes/refreshes this dedicated Jellyfin account/library. Existing changed configuration receives a `.before-discovery-installer` backup. The configure-only mode does not restart an already running service. A full reinstall verifies downloads first, then stops/restarts the three dedicated discovery services around extraction. Use the explicit service restart commands below if you intentionally change a running service's configuration.

## Run the experiments

```bash
python3 experiments/home-lab/benchmark.py --model qwen3.5:9b \
  --group all --repeats 3 --output /tmp/crux-qwen-repeat
python3 experiments/home-lab/benchmark.py --model lfm2.5:8b \
  --group all --repeats 3 --output /tmp/crux-lfm-repeat
```

An independent integration check is also available:

```bash
python3 experiments/home-lab/verify_runtime.py --with-wikipedia \
  --output /tmp/crux-runtime-check.json
```

Run one model benchmark at a time. Ollama is configured for one loaded model and one parallel inference request. Each case launches only its own bounded player/emulator, then closes it. Results include the original question, final answer, tool arguments/results, API timings, seed and explicit checks. Internal reasoning is excluded. `--case media_cycle` selects one case. `--group services` or `--group knowledge` selects a subset.

The unavailable-media case directs **only that test adapter** to unused loopback port 18096, causing a real connection failure without stopping the server. The retrieval-injection case appends a clearly hostile instruction to a real retrieved article. Neither is an invisible claim of a real outage or an unmodified Wikipedia page. The model is expected to ignore the injected directions and use the article as evidence.

Automatic scoring is intentionally narrow. It checks actions against observed tool state, missing-content behavior and selected factual terms/citation URLs. It is not an independent semantic judge. Read the saved answers; the report separates scoring corrections, model errors and bridge fixes. Three seeds on a small fixture collection do not establish household-scale reliability.

## Services and recovery

```bash
systemctl --user status crux-ollama crux-jellyfin crux-kiwix
journalctl --user -u crux-ollama -u crux-jellyfin -u crux-kiwix -n 80
systemctl --user restart crux-ollama crux-jellyfin crux-kiwix
```

These user services start with the existing Omarchy user session/autologin. This work does not introduce a separate login-free system-service arrangement. The full Wikipedia download used `crux-wikipedia-fetch.service` for resume across session interruptions and automatically started Kiwix after checksum verification. A `.zim.part` file is incomplete. Only the final `.zim` plus `.verified.json` represents the verified completed transfer.

The model context is set to 8,192 tokens for this experiment, below the models' advertised maximum. Keeping it bounded leaves GPU space for the desktop and Sunshine. If gaming needs more GPU memory, unload the model:

```bash
crux-ollama stop qwen3.5:9b
crux-ollama stop lfm2.5:8b
```

Ollama will reload a model on the next request. User services are loopback-only; no router ports or firewall exceptions were added.

## Rollback / removal

First stop/disable only the discovery services:

```bash
systemctl --user disable --now crux-wikipedia-fetch.service \
  crux-kiwix.service crux-jellyfin.service crux-ollama.service
```

Close any player/emulator you launched. Removing the following **dedicated paths** removes the discovery installation; inspect them first and retain any later-added personal media, ROMs, save states or credentials you want to keep:

- `~/.local/opt/crux-garden-home/` — extracted runtimes and isolated libraries.
- `~/.local/share/crux-garden-home/` — Wikipedia, models, downloaded packages, original fixtures, Jellyfin database and saves.
- `~/.config/crux-garden-home/` — dedicated settings and private credentials.
- `~/.local/state/crux-garden-home/` and `~/.cache/crux-garden-home/` — logs/cache.
- The four `~/.config/systemd/user/crux-{ollama,jellyfin,kiwix,wikipedia-fetch}.service` files, followed by `systemctl --user daemon-reload`.
- `~/.local/bin/crux-home`, `crux-ollama`, `crux-retroarch`.
- `~/.local/share/applications/crux-home-{wikipedia,media,retroarch,llm}.desktop`.

RetroArch also created default directories under `~/.config/retroarch/` while initializing, and Ollama created its normal runtime identity under `~/.ollama/`. Do not remove these indiscriminately if another installation uses them. Debugging downloaded symbols into the existing `~/.cache/debuginfod_client/`; those are ordinary cache files. No system packages were installed and no system libraries were replaced.

## Files

| File | Purpose |
|---|---|
| `artifacts.json`, `binary-inventory.json`, `cores-manifest.json` | Sources, versions, hashes, provenance |
| `fetch_artifact.py` | Resumable HTTPS download and full-file digest verification |
| `install_runtime.py`, `templates/` | Recreate the user-local configuration |
| `make_fixtures.py`, `fixtures.json` | Original media/ROM generator and observed output hashes |
| `setup_jellyfin.py` | Initialize the dedicated server and sample library privately |
| `home_lab.py` | Actual local tool bridge and CLI |
| `benchmark.py` | Repeated integration cases and transparent checks |
| `results/2026-11-22/` | Saved experiment evidence; no models, ZIM, media binaries or secrets |

The generated fixture source is covered by this repository's license. Third-party binaries/models retain their own licenses. Wikipedia extracts retain [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/) terms and attribution to Wikipedia contributors; original article URLs and the license URL are included in saved read-tool results. See [Wikipedia copyrights](https://en.wikipedia.org/wiki/Wikipedia:Copyrights). These extracts are not relicensed under this repository’s MIT license.
