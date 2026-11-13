# G915 / Omarchy / Local AI — New Agent Handoff

**Date:** 2026-11-12  
**Status:** Working dual-boot system; evaluating whether to replace RTX 5080 with AMD Radeon AI PRO R9700 32GB to run more capable local LLMs.  
**Important:** This is a summary of conversations and user-reported checks, not a live inspection of the computer.

## 1. Immediate decision

The user wants a **more capable local LLM**, especially for coding, general conversation, research, and eventually a personal AI assistant. They are considering **replacing** (not adding to) their NVIDIA RTX 5080 16GB with an **AMD Radeon AI PRO R9700 32GB**.

The agent should evaluate:
- Physical fit in the PowerSpec G915 chassis (card dimensions, slot width, cooling/airflow).
- PSU wattage, PCIe power connectors, and whether adapters are required. **Verify exact installed PSU and exact R9700 board SKU before advising purchase.**
- PCIe compatibility and BIOS/UEFI implications.
- AMD ROCm support on **Omarchy (Arch-based Linux)** and Windows; runtime support for llama.cpp, Ollama, vLLM, SGLang, etc. Do not assume Ubuntu installation instructions work unchanged on Omarchy.
- Performance/quality improvements from 16GB to 32GB VRAM: model fit, quantization, context/KV cache, tokens/sec, prompt throughput, reliability for tool calling and coding.
- The tradeoff: loss of NVIDIA CUDA/DLSS ecosystem and potentially substantially worse 4K gaming experience.
- Whether a different GPU, extra RAM, or hybrid CPU/GPU runtime (e.g., Strata for supported MoE models) is a better investment.
- Resale/replacement economics and compatibility risks.

**Do not assume a 32GB GPU automatically runs a more intelligent model.** Quantization, architecture, runtime support, context, and benchmarks matter. First benchmark the existing 5080 with representative coding tasks.

## 2. Current hardware

- **Computer:** PowerSpec G915 desktop (purchased prebuilt).
- **CPU:** AMD Ryzen 9 9900X3D.
- **GPU:** NVIDIA GeForce RTX 5080, 16GB GDDR7.
- **RAM:** 64GB DDR5-6000.
- **SSD:** 2TB NVMe, split roughly 50/50 between Windows 11 and Omarchy.
- **Motherboard:** MSI X870E family; exact board revision/model should be verified on machine rather than assumed.
- **PSU:** Unknown; inspect case label/spec sheet before GPU swap.
- **Display:** LG E9 55-inch OLED via HDMI, couch viewing around 8 feet.
- **Audio:** Sony HT-XT2 soundbar; Sennheiser headphones plugged into DualSense controller for gaming.
- **Controller:** Sony DualSense (USB verified under Linux; Bluetooth reliability still to be tested).
- **Remote administration:** User also owns MacBook Pro 16-inch M3 Pro, 36GB RAM; wants SSH/remote development.

## 3. Verified installation progress (reported during interactive setup)

### Windows 11
- Windows installed, activated/configured, Chrome and Steam installed.
- RTX 5080 drivers checked, temps normal.
- 3DMark Steel Nomad score ~8,771 versus average ~8,833 for the card, suggesting expected performance.
- Crimson Desert ran well at 4K with DLSS, Ray Reconstruction, Frame Generation; roughly 75–90 FPS in some configurations, ~45–50 FPS in dense areas at higher quality, with user satisfied after tuning.
- Windows HDR worked with LG E9.
- DualSense over USB worked, including headphone audio once Windows device volume was raised.

### Omarchy
- Installed alongside Windows using **Free space install**; each OS boots.
- Limine bootloader detected Windows Boot Manager; MSI UEFI boot priority changed to prefer Limine.
- Limine configuration `/boot/limine.conf` changed to `timeout: 10` and `quiet: no`. Menu became visible; verify whether timeout auto-selects when no keys are pressed.
- NVIDIA driver working (`nvidia-smi` reported RTX 5080, ~30°C idle, ~19W idle GPU power at that moment).
- Hyprland version **0.56.2** using **Lua configuration**; older `hyprctl keyword` commands for certain options returned `keyword can't work with non-legacy parsers`.
- Monitor is `HDMI-A-1`; configured 3840x2160@119.88Hz, scale 3 in `~/.config/hypr/monitors.lua`.
- VRR policy set to fullscreen (`misc:vrr = 2`) via Lua configuration. Actual VRR engagement in game not independently verified.
- Color management enabled; `render:cm_auto_hdr = 1` added in `~/.config/hypr/auto-hdr.lua` and required from `~/.config/hypr/hyprland.lua`. **HDR is not yet available in Crimson Desert under Proton**; setting enabled does not prove functioning HDR.
- Hyprland monitor output showed `colorManagementPreset: srgb`, `sdrSaturation: 1`, `currentFormat: XRGB8888`; desktop and game appear **oversaturated** compared with Windows. Unresolved. Possible TV color gamut setting, compositor color management, SDR/HDR signaling. Do not assume the cause.
- Steam installed, Proton Experimental selected; Crimson Desert runs through Proton with DLSS/Ray Reconstruction/Frame Generation apparently working, performance subjectively comparable to Windows. FPS counter/controlled benchmarks not yet completed.
- DualSense USB recognized (`lsusb` Sony 054c:0ce6), `hid_playstation` loaded, `/dev/input/js0` and `/dev/input/event14` created, ACL granted logged-in user access, `steam-devices` installed. After restarting Steam, controller recognized and Steam input test passed.
- Steam settings windows sometimes extend offscreen at scale 3; `Super+V` to float, Super+mouse drag to move/resize.
- DualSense headphone output worked through USB after adjusting volume using `pavucontrol` (installed via pacman).
- Omarchy updates should use `omarchy update` rather than generic full `sudo pacman -Syu` in this configuration; `sudo pacman -S <package>` was used for targeted packages.
- `nano` installed for easier config edits.

## 4. Short-term priorities

1. **Fix oversaturated SDR colors** without breaking 4K/120Hz. Compare LG TV's SDR gamut mode and Hyprland `srgb`/`wide` handling, with reversible one-variable-at-a-time tests. Preserve backup of config. Do not blindly copy another laptop's ICC profile.
2. **Test DualSense Bluetooth** pairing, reconnection after reboot/sleep, Steam recognition, latency, rumble. Headphone audio over Bluetooth is optional, not a requirement.
3. **Get HDR working in Crimson Desert** if feasible under current Hyprland/NVIDIA/Proton stack; distinguish OS-level HDR configuration from game HDR availability and actual TV HDR signaling.
4. Confirm VRR activation during gaming, FPS performance, and consistent input/audio behavior.
5. Set up frontier-model terminal agent (Codex CLI or Claude Code) on Omarchy for safe system administration. Agent should inspect first, propose reversible changes, and request approval for modifications or privileged commands.
6. Configure SSH/remote administration from MacBook, GitHub, development tools, containers, backups/snapshots.
7. Benchmark local inference on RTX 5080 before committing to GPU replacement.

## 5. Long-term vision: Zac / Crux Garden Home

The G915 is a reference machine for a personal, local-first computing platform, **Crux Garden Home** (related project ZACOS, agent named **Zac**). It should eventually operate as:
- Couch-first gaming and media center (Steam/Proton, emulation, Jellyfin/Kodi).
- Household server (photos/Immich, files, backups, media, documents, Home Assistant, local knowledge).
- Local AI assistant with voice, personal search/RAG, tool calling, household automations.
- Linux development workstation and testing environment; Windows partition retained for games and cross-platform testing.
- Host for Crux Garden's broader application-building/runtime environment and cloud-data Migration feature.

**Product philosophy:** user-owned data, local-first and portable applications, open-source tools, progressively less dependence on SaaS. Aim for appliance-like usability with advanced administration available when needed. A frontier cloud model remains preferable for difficult system administration and complex agentic coding; local models can serve routine tasks and private personal data. Eventually use a hybrid model router.

## 6. Local LLM research interests

- 16GB VRAM threshold and new aggressive quantization (e.g., specialized 27B 3-bit builds); benchmark quality and speed rather than assuming equivalence to unquantized weights.
- GGUF/llama.cpp, Ollama, model architectures (dense vs MoE), quantization, KV cache, long context, GPU offload.
- **Strata** hybrid inference for supported MoE models using GPU+RAM+CPU; verify actual project/version, model support and published benchmarks independently before relying on claims.
- AMD R9700 32GB could accommodate higher-quality 27–32B models and some larger quantized models; cannot fit most 70B 4-bit models entirely in 32GB once overhead/context is included.
- The user values a **good all-around model**, not only coding, but coding is a high-priority workload.

## 7. Agent operating rules

- Inspect live system before issuing instructions. Verify exact GPU, board, PSU, PCIe power, case clearance, firmware, ROCm version, and Linux kernel.
- Avoid destructive operations (partitioning, bootloader changes, source data deletion) without explicit approval and verified backups.
- Prefer read-only diagnostics, clear hypotheses, one change at a time, rollback and validation.
- Keep Windows bootable; do not replace NVIDIA driver with AMD stack until hardware swap is actually planned.
- If recommending R9700, show concrete model fits and measured tokens/sec under comparable quantization/context/runtime; differentiate vendor marketing from independent tests.
- Do not assume all local AI workloads need the GPU 24/7: gaming and AI will contend for VRAM, and dual boot means Linux services stop when Windows runs.
- Consider future always-on low-power server separation if reliability/power become priorities.

## 8. Suggested first task for new agent

> Inspect my PowerSpec G915 hardware and Omarchy configuration, then evaluate replacing my RTX 5080 16GB with an AMD Radeon AI PRO R9700 32GB for stronger local LLMs. Verify physical/power/PCIe compatibility, ROCm support on Omarchy, realistic model fit and inference performance, and the effect on gaming. Do not modify hardware, drivers, boot settings, or partitions. Provide a recommendation and benchmark plan for the existing RTX 5080 first.

## 9. Useful links

- Omarchy: https://omarchy.org/
- Hyprland: https://wiki.hypr.land/
- AMD ROCm: https://rocm.docs.amd.com/
- AMD Radeon AI PRO R9700 product page: find/verify from AMD official website
- llama.cpp: https://github.com/ggml-org/llama.cpp
- Ollama: https://ollama.com/
- Crux Garden app: https://github.com/CruxGarden/app
- Crux Garden API: https://github.com/CruxGarden/api

**End of handoff.**
