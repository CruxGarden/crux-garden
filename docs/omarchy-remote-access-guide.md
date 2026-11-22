# Omarchy Remote Access Guide

Crux Garden Home · Updated 22 November 2026

Set up the Omarchy PC as the host, then connect from a Mac, Windows PC, or Linux computer on your home network. **SSH** provides a terminal, file transfers, and remote development with VS Code and Git. **Sunshine** runs on Omarchy; **Moonlight** runs on the computer viewing and controlling its desktop.

**This Omarchy host is already configured.** To add another computer, start with [Connecting a new computer](#2-connecting-a-new-computer). Each computer needs its own authorized SSH key and its own Moonlight pairing. You can use either service independently.

| Connection detail | Current value |
| --- | --- |
| Omarchy address | `10.0.0.39` |
| SSH account and port | `daniel` · TCP `22` |
| Normal SSH command | `ssh daniel@10.0.0.39` |
| Moonlight computer name | **Crux Omarchy** |
| Sunshine administration | `https://localhost:47990` on Omarchy, or through the SSH tunnel below |
| Allowed network | `10.0.0.0/24`, through Omarchy Wi-Fi interface `wlp15s0` |
| Host desktop | **CRUX-REMOTE virtual display**: 3456 × 2160 at 60 Hz, with **2×** scaling; HDMI can stay disconnected |

The PC must be booted into Omarchy and awake. Sunshine captures a virtual display called `CRUX-REMOTE` in the existing desktop session. **No TV or HDMI connection is needed for streaming.** If the TV is connected, it is another display and may show a different workspace. Open applications can be moved between displays. Automatic disk unlock and desktop login are configured. The full HDMI-disconnected reboot and Moonlight reconnection test passed on 22 November 2026. Moonlight itself cannot show the bootloader or early disk-unlock screen. Windows hosting and access away from home are separate projects.

## Contents

1. [Setting up the Omarchy host](#1-setting-up-the-omarchy-host)
2. [Connecting a new computer](#2-connecting-a-new-computer)
3. [Developing remotely with VS Code and GitHub](#3-developing-remotely-with-vs-code-and-github)
4. [Everyday use and troubleshooting](#4-everyday-use-and-troubleshooting)

## 1. Setting up the Omarchy host

These are host-side instructions and a record of the working configuration. Run them in an **Omarchy terminal**, using the local console or an already authorized connection. Do not repeat installation or overwrite existing configurations just to add a client. Before changing an existing host, back up the affected files and keep local access available.

### Check the address and network

```bash
ip -brief address
ip route
sudo ufw status verbose
```

The current address is `10.0.0.39` and the home subnet is `10.0.0.0/24`. Guest Wi-Fi or client isolation can prevent access even when both computers are on Wi-Fi. The commands below use `wlp15s0`; if you switch the host to Ethernet or a different subnet, review those rules rather than copying them unchanged.

The address is assigned by DHCP. A router DHCP reservation can keep it stable. If it changes, find the new address on Omarchy and update SSH and Moonlight. No router port forwarding is needed for home access.

### Install and configure SSH

**Already completed here.** For a fresh Omarchy setup, install OpenSSH:

```bash
omarchy pkg add openssh
```

Authorize the first client key using the [key authorization procedure below](#authorize-the-new-key-on-omarchy) before starting the service. Then create `/etc/ssh/sshd_config.d/10-crux-lan.conf` with the following contents. Preserve any existing file before replacing it:

```sshconfig
AddressFamily inet
PermitRootLogin no
AllowUsers daniel@10.0.0.0/24
PubkeyAuthentication yes
PasswordAuthentication no
KbdInteractiveAuthentication no
```

The main `/etc/ssh/sshd_config` must include `/etc/ssh/sshd_config.d/*.conf`, as it does on this PC. This policy allows the `daniel` account from the home IPv4 subnet using authorized keys. The Linux account password is not an SSH login method.

With UFW active and its incoming policy set to deny, add the scoped rule, generate missing host identity keys, validate the configuration, and start SSH:

```bash
sudo ufw limit in on wlp15s0 proto tcp from 10.0.0.0/24 to any port 22 comment crux-lan-ssh
sudo ssh-keygen -A
if sudo sshd -t; then
    sudo systemctl enable --now sshd.service
    sudo systemctl reload sshd.service
fi
```

Stop and fix any configuration error before proceeding. On a host where UFW is inactive or has a different policy, review that policy locally before enabling or changing it. Check the resulting service and host identity:

```bash
systemctl status sshd.service --no-pager
sudo ufw status verbose
ssh-keygen -lf /etc/ssh/ssh_host_ed25519_key.pub
```

The current PC’s **ED25519 host fingerprint** is:

```text
SHA256:0ayddSkyjeroDOAwpZk1xpVZ6hi/b/VaMx0wZF6v2n4
```

A fresh installation that generates new host keys will have a different fingerprint. Verify it directly on that host; do not carry this value over to a rebuilt machine.

### Install Sunshine on Omarchy

**Already completed here:** official LizardByte Sunshine `2026.914.233613-1`, plus `libmfx` and `miniupnpc`. It uses NVIDIA NVENC encoding and Wayland (`wlr`) capture of a virtual display. The earlier KMS configuration depended on the TV and was replaced after an HDMI-unplug test. The upstream native Arch package was selected for its CUDA-enabled build. Installing the CUDA toolkit afterward does not add CUDA support to a package built without it. See the [official installation notes](https://docs.lizardbyte.dev/projects/sunshine/latest/md_docs_2getting__started.html).

For a fresh installation, choose a current upstream native Arch package compatible with your installed libraries. The exact package below was tested against this machine’s November 2026 software. Newer builds of the same release required OpenSSL 4, while this host had OpenSSL 3; do not blindly install a newer archive or downgrade an existing working installation.

#### Exact package used on this machine

```bash
mkdir -p ~/Downloads/omarchy-remote-setup
cd ~/Downloads/omarchy-remote-setup
curl -fL -o sunshine.pkg.tar.zst   https://github.com/LizardByte/pacman-repo/releases/download/stable/sunshine-2026.914.233613-1-x86_64.pkg.tar.zst
printf '%s  %s\n'   afe4a4527249a5b4337e926dd9ded1ce88c4eb7351e99204cc80806d2effe9c3   sunshine.pkg.tar.zst | sha256sum -c -
```

Only after the checksum reports `OK` and package compatibility has been checked, install:

```bash
omarchy pkg add libmfx miniupnpc
sudo pacman -U ./sunshine.pkg.tar.zst
```

This package’s installation hook grants the Sunshine binary `cap_sys_admin` and `cap_sys_nice`, installs input-device udev rules, and loads `uinput`/`uhid`. These support screen capture and remote input. A full CUDA toolkit was not installed on this host.

### Configure the Desktop stream

Create `~/.config/sunshine` if needed. On an existing installation, back up the configuration and preserve credentials, paired clients, and any applications you still use. The working `sunshine.conf` settings are:

```ini
sunshine_name = Crux Omarchy
address_family = ipv4
upnp = disabled
origin_web_ui_allowed = pc
capture = wlr
encoder = nvenc
lan_encryption_mode = 2
output_name = CRUX-REMOTE
```

These settings keep router mapping off, require encrypted LAN streaming, and restrict the administration page to localhost. NVIDIA `nvenc` is specific to this PC; another GPU may need a different encoder. The [Sunshine configuration reference](https://docs.lizardbyte.dev/projects/sunshine/latest/md_docs_2configuration.html) describes these options.

For a fresh Desktop-only configuration, save this as `~/.config/sunshine/apps.json`:

```json
{
  "env": {},
  "apps": [
    {
      "name": "Desktop",
      "image-path": "desktop.png"
    }
  ]
}
```

Keep the `env` object even when empty. Omitting it caused this Sunshine build to abort during our initial setup.

Add only the required home-network streaming ports. Leave the administration port `47990` closed to the LAN:

```bash
for port in 47984 47989 48010; do
    sudo ufw allow in on wlp15s0 proto tcp from 10.0.0.0/24 to any port "$port" comment crux-lan-sunshine
done
sudo ufw allow in on wlp15s0 proto udp from 10.0.0.0/24 to any port 47998:48000 comment crux-lan-sunshine
```

### Create the virtual display and its startup helper

**Already installed and tested here.** This section makes the host usable with HDMI disconnected. Merely creating a Hyprland headless output is insufficient with the old KMS capture setting: Sunshine must use `capture = wlr` and `output_name = CRUX-REMOTE` as shown above. See the [Sunshine capture reference](https://docs.lizardbyte.dev/projects/sunshine/latest/md_docs_2configuration.html#capture) and [Hyprland output controls](https://wiki.hypr.land/configuring/core/advanced-configuration/using-hyprctl/).

For a fresh setup, add this rule once to `~/.config/hypr/monitors.lua`, preserving the other monitor rules:

```lua
hl.monitor({ output = "CRUX-REMOTE", mode = "3456x2160@60", position = "auto", scale = 2 })
```

Reload and confirm that the configuration-error output is empty:

```bash
hyprctl reload
hyprctl configerrors
```

Create the helper and service-override directories:

```bash
mkdir -p ~/.local/bin ~/.config/systemd/user/app-dev.lizardbyte.app.Sunshine.service.d
```

Save the following script as `~/.local/bin/crux-remote-display`. It reuses an existing virtual output or creates it if absent, waits briefly for Hyprland, and checks the expected resolution and scale:

```python
#!/usr/bin/python3
"""Ensure Sunshine's named virtual display exists in the active Hyprland session."""
import json
import subprocess
import sys
import time

NAME = "CRUX-REMOTE"


def run(*args):
    return subprocess.run(
        ["/usr/bin/hyprctl", *args],
        capture_output=True,
        text=True,
        timeout=5,
        check=True,
    ).stdout


def find_display():
    return next((m for m in json.loads(run("monitors", "-j")) if m["name"] == NAME), None)


def main():
    last_error = "Hyprland is not ready"
    for attempt in range(10):
        try:
            monitor = find_display()
            if monitor is None:
                result = run("output", "create", "headless", NAME).strip()
                monitor = find_display()
                if monitor is None:
                    raise RuntimeError(f"Display creation did not produce {NAME}: {result}")
            if monitor.get("disabled"):
                raise RuntimeError(f"{NAME} is disabled")
            if (monitor["width"], monitor["height"], monitor["scale"]) != (3456, 2160, 2):
                raise RuntimeError(
                    f"Unexpected mode for {NAME}; check ~/.config/hypr/monitors.lua: "
                    f"{monitor['width']}x{monitor['height']} scale {monitor['scale']}"
                )
            print(f"{NAME} ready: 3456x2160, {monitor['refreshRate']:g} Hz, scale 2")
            return 0
        except (OSError, subprocess.SubprocessError, ValueError, KeyError, RuntimeError) as exc:
            last_error = str(exc)
            if attempt < 9:
                time.sleep(0.5)
    print(f"Could not prepare Sunshine virtual display: {last_error}", file=sys.stderr)
    return 1


if __name__ == "__main__":
    sys.exit(main())
```

```bash
chmod 755 ~/.local/bin/crux-remote-display
```

Save this as `~/.config/systemd/user/app-dev.lizardbyte.app.Sunshine.service.d/10-crux-headless.conf`:

```ini
[Service]
ExecStartPre=%h/.local/bin/crux-remote-display
```

The override runs the helper before Sunshine starts. It is independent of the package-owned unit, so the package file stays untouched. Check the unit and prepare the display from an Omarchy desktop terminal:

```bash
systemctl --user daemon-reload
systemd-analyze --user verify app-dev.lizardbyte.app.Sunshine.service
~/.local/bin/crux-remote-display
```

Expected helper output: `CRUX-REMOTE ready: 3456x2160, 60 Hz, scale 2`. If a previously running Sunshine instance needs to pick up the changed capture settings, use `systemctl --user restart app-dev.lizardbyte.app.Sunshine.service`, then reconnect Moonlight. This briefly interrupts streaming, while applications and this chat remain open. For the first test on a new host, keep the physical display connected until the virtual stream works.

Test the result by unplugging HDMI, disconnecting Moonlight, and reconnecting to **Desktop**. That test passed on this PC on 22 November 2026. A second reconnect after a Sunshine service restart also succeeded with only CRUX-REMOTE present. Automatic display creation and password-free disk startup are configured. The combined reboot test passed at approximately 14:55–14:56 on 22 November 2026, with only CRUX-REMOTE present after boot.

Start Sunshine inside the logged-in Omarchy desktop session:

```bash
systemctl --user daemon-reload
systemctl --user start app-dev.lizardbyte.app.Sunshine.service
```

On **Omarchy itself**, open `https://localhost:47990` and create the Sunshine administration username/password. The browser may show a warning for Sunshine’s self-signed certificate. Continue only for the known local setup page or the authenticated SSH tunnel described later. Store these credentials in your password manager.

Pair a client and test Desktop. After it works, enable automatic startup with the desktop:

```bash
systemctl --user enable app-dev.lizardbyte.app.Sunshine.service
systemctl --user status app-dev.lizardbyte.app.Sunshine.service --no-pager
```

The canonical unit above creates the `sunshine.service` alias when enabled. Do not also add a second Hyprland autostart command. SSH starts as a system service; Sunshine starts with the graphical session. HDMI-disconnected streaming and reconnection have been verified. Full reboot and Moonlight reconnection have also been verified. Locked-screen behavior remains untested.

### Automatic boot without the disk-password prompt

**Configured and reboot-tested on 22 November 2026.** The user chose straightforward unattended startup and does not require protection against physical access to the disk. The existing Omarchy `encrypt` boot hook supports a key file, so no custom TPM boot hook or change of boot system is needed.

The root-only file `/crypto_keyfile.bin` is enrolled in LUKS slot `2`. The original password remains in slot `0`. The short configuration file `/etc/mkinitcpio.conf.d/zz-crux-auto-unlock.conf` contains:

```bash
FILES+=(/crypto_keyfile.bin)
```

The boot image was rebuilt using `sudo limine-mkinitcpio linux-omarchy`. Its embedded key was checked against the source file, and the extracted image’s own cryptsetup successfully tested that key against the disk. The earlier trial TPM enrollment was removed; this boot path has no TPM dependency. SDDM is already configured to log `daniel` into `omarchy.desktop`. SSH is enabled at system startup, and Sunshine starts with the graphical session and prepares CRUX-REMOTE.

**Physical-access tradeoff:** although the disk remains encrypted, its boot image contains the unlock key. Someone with access to the disk can therefore recover the key. This is a deliberate convenience setting; never share the key file, boot image, or encryption-header backup.

The original password-based boot image is retained as **Omarchy manual unlock (before automatic startup)** in the boot menu. Private setup backups are in `/var/tmp/crux-auto-unlock-backup-20261122-IW02Sn`. To undo automatic unlock, first verify the original password, remove the key-file inclusion and rebuild the normal image, then revoke only automatic slot 2 and remove its key copies from boot images. Do not overwrite the entire LUKS header with an old backup over later key changes.

This provides automatic startup when the PC boots. It does not provide a video view of firmware/bootloader screens or a way to press the power button remotely. The HDMI-disconnected reboot and reconnection test passed: a fresh boot ID was verified, SDDM logged daniel in automatically, the Sunshine helper created CRUX-REMOTE, and the Mac reconnected to an HEVC stream. SSH also started automatically.

### Keep desktop sizing comfortable

The remote virtual display is set to **3456×2160 at 60 Hz with 2× scaling**. The TV retains its separate 3840×2160 at 119.88 Hz setting when connected. The remote display gives a 1728×1080 logical workspace and matches the usable screen area below the camera notch on the 16-inch M3 MacBook Pro. The earlier 4× setting was oversized for the Mac workflow; 1× was too small.

To restore the current desktop scale if needed, run on Omarchy:

```bash
omarchy hyprland monitor scaling 2
hyprctl reload
hyprctl configerrors
dbus-update-activation-environment --systemd GDK_SCALE=2
```

Existing applications may need to be closed and reopened to pick up toolkit scaling. The top bar currently has an opaque background. Its relevant controls are:

```bash
omarchy bar position top
omarchy bar background opaque
```

## 2. Connecting a new computer

Connect the new computer to the trusted home network. Install an SSH client for terminal access and Moonlight for desktop access. **Sunshine is already on the host; it does not need to be installed on the viewing computer.** Moonlight clients for macOS, Windows, and Linux are linked from [moonlight-stream.org](https://moonlight-stream.org/).

### Prepare SSH on macOS, Windows, or Linux

| Client | Where to run commands | Check for SSH |
| --- | --- | --- |
| macOS | Open the Mac’s own **Terminal**, outside Moonlight. SSH is normally included. | `ssh -V` |
| Windows | Open **Windows Terminal → PowerShell**. | `ssh -V` |
| Linux | Open a terminal. Install your distribution’s OpenSSH client package if missing. | `ssh -V` |

If Windows says SSH is not recognized, install **OpenSSH Client** through Windows Optional Features, or run this in PowerShell as Administrator, then open a new normal PowerShell window:

```powershell
Add-WindowsCapability -Online -Name OpenSSH.Client~~~~0.0.1.0
```

A Windows viewing computer needs the client, not an SSH server. See [Microsoft’s OpenSSH instructions](https://learn.microsoft.com/en-us/windows-server/administration/openssh/openssh_install_firstuse).

### Create or reuse a key on the new computer

Use a separate key pair for each computer. If this computer already has an `id_ed25519` key pair you want to use, reuse its public key. Otherwise run the following on the **new client**, replacing the comment with a recognizable device name:

```bash
ssh-keygen -t ed25519 -C "my-laptop-to-crux-omarchy"
```

Press Enter to accept the default filename and choose a passphrase. If asked to overwrite an existing key, answer **no**; inspect or reuse it, or choose a different filename. The `.pub` file is the public key. Keep the matching private file, without `.pub`, on that client. This use of key types, filenames and passphrases follows the [OpenSSH key-generation manual](https://man.openbsd.org/ssh-keygen).

| Client | Display the public key | Show its fingerprint |
| --- | --- | --- |
| macOS or Linux | `cat ~/.ssh/id_ed25519.pub` | `ssh-keygen -lf ~/.ssh/id_ed25519.pub` |
| Windows PowerShell | `Get-Content "$env:USERPROFILE\.ssh\id_ed25519.pub"` | `ssh-keygen -lf "$env:USERPROFILE\.ssh\id_ed25519.pub"` |

Transfer the `.pub` file to the Omarchy administrator by USB or through an already trusted computer. Avoid Moonlight paste for key transfer: it produced missing/garbled characters during this setup. A public key is safe to share, but authorize only the intended device’s key. Never send the private key or its passphrase.

### Authorize the new key on Omarchy

This step runs **on Omarchy**, logged in as `daniel`, either locally or through an already working SSH client. A new computer cannot authorize itself through SSH before its key has been accepted. Password-based bootstrap and `ssh-copy-id` using an account password will not work with this host’s policy.

Save the new public key file as `/home/daniel/new-client.pub`. For example, after receiving it in Downloads on the already authorized Mac, send it with:

```bash
scp ~/Downloads/new-client.pub daniel@10.0.0.39:new-client.pub
```

Then, on Omarchy, validate it and compare the printed fingerprint with the fingerprint on the new client:

```bash
ssh-keygen -lf ~/new-client.pub
```

If the fingerprints match and the file contains the intended single public key, append it while preserving existing keys:

```bash
if ssh-keygen -lf "$HOME/new-client.pub"; then
    mkdir -p "$HOME/.ssh"
    chmod 700 "$HOME/.ssh"
    touch "$HOME/.ssh/authorized_keys"
    chmod 600 "$HOME/.ssh/authorized_keys"
    cp -a "$HOME/.ssh/authorized_keys" "$HOME/.ssh/authorized_keys.backup-$(date +%Y%m%d-%H%M%S)"
    printf '\n' >> "$HOME/.ssh/authorized_keys"
    cat "$HOME/new-client.pub" >> "$HOME/.ssh/authorized_keys"
    printf '\n' >> "$HOME/.ssh/authorized_keys"
fi
```

Add each key once. No SSH restart is needed for `authorized_keys` changes. Each accepted key gives access to the `daniel` account and its files. For another person needing separate access, set up a separate Linux account and revise the account policy deliberately.

### Connect and verify the host identity

On the new client, run:

```bash
ssh daniel@10.0.0.39
```

At first connection, compare the displayed **ED25519 server fingerprint** with the value in this guide or obtain it directly from Omarchy. This is the server identity, not the client-key fingerprint used above. Accept it if it matches. If asked for a passphrase, enter the passphrase for your client’s private key; characters normally do not appear while typing.

Test the shell with:

```bash
whoami
hostname
```

Expected results are `daniel` and `omarchy`. Type `exit` to end the SSH session.

If the client picks the wrong key, force the expected identity. This works in macOS/Linux terminals and PowerShell with the default key location:

```bash
ssh -o IdentitiesOnly=yes -i ~/.ssh/id_ed25519 daniel@10.0.0.39
```

Use your actual filename if you created a differently named key. The normal command and the explicit-key command were both confirmed working on the original MacBook.

### Optional short name for SSH

On the client, add this block to its existing SSH config file. On macOS/Linux that is `~/.ssh/config`; on Windows it is `%USERPROFILE%\.ssh\config`, with no `.txt` extension. Preserve other entries and update an existing `Host crux` block rather than adding duplicates:

```sshconfig
Host crux
    HostName 10.0.0.39
    User daniel
    IdentityFile ~/.ssh/id_ed25519
    IdentitiesOnly yes
```

You can then use `ssh crux` and `scp file.txt crux:Downloads/`. The host name and identity options are documented in [OpenSSH client configuration](https://man.openbsd.org/ssh_config).

### Install and pair Moonlight

1. Install the client for your operating system from [the official Moonlight download page](https://moonlight-stream.org/).
2. Open Moonlight. Select **Crux Omarchy** if discovered automatically, or add the computer manually with `10.0.0.39`.
3. Select the computer to display a pairing PIN.
4. Open Sunshine’s administration page on Omarchy, sign in, and enter that PIN in its **PIN** page.
5. Back in Moonlight, select **Desktop**.

Pair every new Moonlight client separately. The Sunshine admin password is used in its web interface; the displayed PIN pairs the viewing computer. General pairing and streaming instructions are in [Moonlight’s setup guide](https://github.com/moonlight-stream/moonlight-docs/wiki/Setup-Guide).

### Open Sunshine administration from an authorized client

Directly opening `https://10.0.0.39:47990` from another computer is intentionally blocked. Once SSH works, open a tunnel in the client’s terminal:

```bash
ssh -N -L 127.0.0.1:47990:127.0.0.1:47990 daniel@10.0.0.39
```

Leave that terminal running. A blank terminal is expected here: `-N` forwards the port without starting a shell. In that same client’s browser, open **https://127.0.0.1:47990**, sign in to Sunshine, and enter the Moonlight PIN. Close the tunnel with Control+C when finished. If local port 47990 is already occupied, close the previous tunnel or local Sunshine instance before retrying.

### Set readable picture quality

Disconnect the current stream to reach Moonlight’s main screen and its gear/settings icon. Use these settings for the current 16-inch M3 MacBook Pro and matching Omarchy virtual display:

| Setting | Starting value |
| --- | --- |
| Resolution | **Native (Excluding Notch) — 3456×2160** |
| Display mode | **Fullscreen** |
| Frame rate | **60 FPS** |
| Bitrate | **40 Mbps** as a starting point; reduce if the network stutters |
| HDR | **Off** for the initial desktop test |
| Codec | Auto; the working Mac session used HEVC hardware encoding |
| Host desktop scale | **2×** |

Reconnect to Desktop after changing settings. On 22 November 2026, the user confirmed the notch-safe picture and fully visible top bar after reconnecting. Sunshine independently captured 3456×2160 using HEVC NVENC at about 57 Mbps negotiated bitrate; the Mac settings were user-operated. A stream below the host resolution can soften text. For another computer, match the virtual display and stream to its usable screen resolution or aspect ratio, then choose a comfortable host scale.

### Fill the MacBook screen without hiding the top bar

The 16-inch M3 MacBook Pro panel is 3456×2234 including the camera-notch area. Moonlight’s **Native (Excluding Notch)** mode uses **3456×2160**, keeping Omarchy’s whole top bar below the notch. The narrow strip containing the physical notch remains outside the desktop. Full Native (3456×2234) was tested and filled the panel, but the notch covered the center of the top bar. Standard 4K (3840×2160) has a different aspect ratio and produced wide bars above and below the image.

Whenever changing the host resolution, update both the CRUX-REMOTE rule in `~/.config/hypr/monitors.lua` and the size check/status text in `~/.local/bin/crux-remote-display`. The helper checks the expected mode before Sunshine starts. Back up both files, reload Hyprland, check `hyprctl configerrors`, run the helper, and reconnect Moonlight using the matching resolution. Use a timed rollback when changing the display remotely. The physical HDMI TV has its own rule.

The final mode/helper and HEVC capture were verified live, and the user confirmed the picture. Both trial rollback timers were cancelled. The earlier unattended reboot test passed at the original 4K mode; a new reboot after this resolution-only change was not performed.

References: [Apple’s display specifications](https://support.apple.com/en-au/117737) and [Moonlight’s native and notch-safe resolution options](https://github.com/moonlight-stream/moonlight-qt/blob/master/app/gui/SettingsView.qml).

## 3. Developing remotely with VS Code and GitHub

### Where the repositories live

The local workspace is `/home/daniel/Workspace`; it was renamed from `Work`. All six CruxGarden repositories were cloned with full history under `/home/daniel/Workspace/CruxGarden`:

| Folder | Repository |
| --- | --- |
| `crux-garden` | Monorepo and this guide |
| `app` | Existing desktop and web application |
| `api` | API service |
| `cli` | Nursery command-line tools |
| `plasma-ui` | Plasma UI library |
| `.github` | GitHub organization profile repository (hidden folder) |

The monorepo is newly initialized; application source remains in the sibling repositories at this setup checkpoint. Cloning and Git access are complete. Project dependencies, builds, and a migration into the monorepo were not performed. Follow each repository’s current README and agent instructions before development.

### Connect VS Code from the Mac

1. Install VS Code and Microsoft’s **Remote - SSH** extension on the Mac.
2. Press **Cmd+Shift+P**, choose **Remote-SSH: Connect to Host…**, and enter `daniel@10.0.0.39`. Use the Mac SSH key already authorized on Omarchy. On Windows/Linux, use Ctrl+Shift+P.
3. Choose **Linux** if asked. On the first connection, VS Code installs its remote server component under the Omarchy user account.
4. Use **File → Open Folder** in the remote window and select `/home/daniel/Workspace/CruxGarden/crux-garden`, or the individual sibling repository you want to develop.
5. Confirm the window shows an SSH connection. Its file editor, integrated terminal, and Git Source Control operate on Omarchy’s files.

Moonlight does not need to be connected. The Mac displays the editor; development commands run on Omarchy. Terminal SSH login and GitHub writes were verified during setup; this specific VS Code client connection was not independently tested. See [Microsoft’s Remote SSH instructions](https://code.visualstudio.com/docs/remote/ssh).

### Two separate SSH connections

**Mac → Omarchy** uses the Mac’s key and Omarchy’s `~/.ssh/authorized_keys`. **Omarchy → GitHub** uses a separate key stored on Omarchy, with its public key registered to the GitHub account. A local Git commit needs no GitHub authentication; pushing commits does. Omarchy’s dedicated key lets authorized agents push even when the Mac is disconnected. [SSH agent forwarding](https://docs.github.com/en/authentication/connecting-to-github-with-ssh/using-ssh-agent-forwarding) is an alternative that uses a connected client’s key.

**Already configured on this host:** Git author `Will Stepp <willstepp@gmail.com>`, GitHub account `willstepp`, dedicated key `~/.ssh/id_ed25519_github`, and SSH origins of the form `git@github.com:CruxGarden/REPOSITORY.git`. GitHub authentication, remote reads, and push dry runs passed for all six repositories. A real empty [test commit](https://github.com/CruxGarden/crux-garden/commit/6436d164081eeee7e26c0a3cf613cbdf5be01e34) was pushed to `test/omarchy-ssh-20261122` and verified on GitHub.

From an Omarchy terminal, check the current identity and authentication with:

```bash
git config --global user.name
git config --global user.email
ssh -T git@github.com
```

The GitHub response should identify `willstepp` and say authentication succeeded. GitHub does not provide an interactive shell, so that successful test normally exits with status 1.

#### Set up GitHub SSH on another development host

Use that host’s own Git identity and a dedicated key. Check for existing keys/configuration first and preserve them. The following is a new-host example; it is not necessary on this configured Omarchy machine:

```bash
git config --global user.name "Your Name"
git config --global user.email "you@example.com"
ssh-keygen -t ed25519 -C "you@example.com development host" -f ~/.ssh/id_ed25519_github
cat ~/.ssh/id_ed25519_github.pub
```

Add only the public `.pub` key to [GitHub → Settings → SSH and GPG keys → New SSH key](https://github.com/settings/ssh/new), choosing **Authentication Key** and a recognizable machine name. Keep the private key on its host. Add or merge this entry into that host’s existing `~/.ssh/config`:

```sshconfig
Host github.com
    HostName github.com
    User git
    IdentityFile ~/.ssh/id_ed25519_github
    IdentitiesOnly yes
```

Verify GitHub’s host key against its [official published fingerprints](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/githubs-ssh-key-fingerprints) before accepting the initial connection. Then test `ssh -T git@github.com`. For an existing clone, inspect its origin with `git remote -v` and switch that repository to its correct SSH URL if necessary. See [GitHub’s key-registration guide](https://docs.github.com/en/authentication/connecting-to-github-with-ssh/adding-a-new-ssh-key-to-your-github-account).

### Edit, commit, and coordinate

Use VS Code’s Source Control panel or Git in its remote terminal. For example, starting from a clean, up-to-date checkout:

```bash
cd ~/Workspace/CruxGarden/crux-garden
git status
git pull --ff-only
git switch -c feature/my-change
# Edit the files, then stage the specific files you changed:
git add path/to/changed-file
git diff --cached
git commit -m "Describe the change"
git push -u origin HEAD
```

Replace the example branch and file path with your actual work. Follow repository rules for review and merging. If a pull cannot fast-forward, inspect the differing commits rather than forcing an update.

Agent communications and coordination are intended to live in the GitHub repositories. Read the applicable repository instructions and shared project records before starting work. Use the project’s agreed files, issues, or pull requests for authorized handoffs; a detailed cross-repository coordination protocol has not yet been established. Git-over-SSH handles repository content. Tools that create GitHub issues, comments, or pull requests also need their own authenticated GitHub API or CLI connection.

This guide is maintained at `CruxGarden/crux-garden/docs/omarchy-remote-access-guide.md`. A matching Markdown copy is saved as `~/Documents/Omarchy-Remote-Access-Guide.md`. Update both when maintaining these instructions. The earlier HTML copy remains in Documents for reference.

## 4. Everyday use and troubleshooting

### Reconnect the TV for gaming

Reconnect the TV to the GPU’s HDMI port and select that HDMI input on the TV. The saved HDMI-A-1 configuration remains **3840×2160 at 119.88 Hz with 2× desktop scaling**. Existing automatic game HDR and fullscreen VRR settings were retained. The virtual display used by Moonlight remains a separate 3456×2160/60 output; it does not replace the physical TV.

The two displays can show different workspaces. On the PC keyboard, **Ctrl + Alt + Tab** focuses the next monitor. Launch the game on the TV’s workspace, or move an existing game/window to the TV with **Super + Shift + Ctrl + Left/Right** in the TV’s direction. **Super + Shift + Alt + Left/Right** moves the whole workspace. Super means the Windows/logo key on a PC keyboard. These bindings were verified in the running configuration.

Moonlight continues showing CRUX-REMOTE, so a game moved onto the TV may disappear from the stream while continuing to run on the TV. TV hotplug and a new gaming/HDR session have not been retested since adding the virtual display; the physical display settings and gaming configuration are preserved.

### Moonlight shortcuts

| Action | Mac | Windows or Linux |
| --- | --- | --- |
| Disconnect stream and keep the PC desktop running | Control + Option + Shift + Q | Ctrl + Alt + Shift + Q |
| Toggle fullscreen | Control + Option + Shift + X | Ctrl + Alt + Shift + X |
| Toggle input capture | Control + Option + Shift + Z | Ctrl + Alt + Shift + Z |
| Show performance statistics | Control + Option + Shift + S | Ctrl + Alt + Shift + S |
| Type local clipboard text into the remote application | Control + Option + Shift + V | Ctrl + Alt + Shift + V |

These are the [documented desktop-client shortcuts](https://github.com/moonlight-stream/moonlight-docs/wiki/Setup-Guide#keyboardmousegamepad-input-options). Clipboard transfer is not a full shared clipboard; host-to-client copy is not provided by the paste shortcut. Our Mac-to-Omarchy paste attempts garbled text and triggered unexpected behavior, so use file transfer for reliable text or key delivery.

### Transfer files with SSH

Run file-copy commands in the **client’s terminal**. Send a file to Omarchy:

```bash
scp ./example.txt daniel@10.0.0.39:Downloads/
```

Download this guide to a Mac or Linux client:

```bash
scp daniel@10.0.0.39:Documents/Omarchy-Remote-Access-Guide.md ~/Downloads/
```

In Windows PowerShell, use this destination:

```powershell
scp daniel@10.0.0.39:Documents/Omarchy-Remote-Access-Guide.md "$env:USERPROFILE\Downloads\"
```

Open the downloaded Markdown file in VS Code or another Markdown reader, or review it directly on GitHub. The earlier HTML copy remains in Documents if you want a browser-printable snapshot.

### When something does not work

| Symptom | What to check |
| --- | --- |
| SSH says Permission denied | Use `daniel`, force the correct private key with the explicit command above, and compare the client public-key fingerprint with the authorized key. Confirm the public key was added on Omarchy. Do not enable password login as a workaround. |
| SSH appears blank | A passphrase prompt hides typed characters. An ordinary SSH session should eventually show a prompt; try Enter, then `whoami`. A tunnel started with `-N` is intentionally blank. If an ordinary login remains stuck, inspect the server log before changing shell files. |
| SSH times out or Moonlight cannot find the PC | Check that Omarchy is awake, its current IP, the home network rather than guest Wi-Fi, and host interface/subnet firewall rules. Try manual IP entry in Moonlight. |
| SSH warns that the host identity changed | Verify the fingerprint directly on Omarchy and determine whether the host was rebuilt or the address now belongs to another device. Do not accept a changed identity blindly. |
| Sunshine admin page is inaccessible from the client | Use the SSH tunnel. Direct LAN access to port 47990 is intentionally closed. |
| Text looks soft | Match the stream to the 3456×2160 virtual display, keep 2× host scaling, and reconnect. Adjust bitrate for your network. Fullscreen viewing can avoid additional window resizing. |
| UI is far too large or small | Use 2× scaling for CRUX-REMOTE. Monitor scaling applies to the selected output; toolkit scaling can also affect application sizing. The physical TV has its own monitor rule. |
| Streaming stutters | Check Moonlight’s statistics, lower bitrate, and improve Wi-Fi or use Ethernet where available. Changing the host interface requires revisiting this setup’s interface-specific firewall rules. |
| Blank stream after startup or locking | Check `hyprctl monitors` for CRUX-REMOTE and inspect the Sunshine service log for the startup-helper result. Confirm `capture = wlr` and `output_name = CRUX-REMOTE`. Use an SSH session for diagnosis if Moonlight cannot connect. HDMI is not required by the corrected setup. Locked-screen behavior remains untested. |
| No connection after a reboot | Automatic disk unlock and desktop login are configured. Allow time for startup, then check SSH and Moonlight. The combined reboot test passed on 22 November 2026. If boot falls back to a password prompt, use a local display and the original disk password. |

Useful **Omarchy-side** checks:

```bash
ip -brief address
systemctl status sshd.service --no-pager
sudo journalctl -u sshd.service -n 40 --no-pager
systemctl --user status app-dev.lizardbyte.app.Sunshine.service --no-pager
tail -n 60 ~/.config/sunshine/sunshine.log
sudo ufw status verbose
```

HDMI-disconnected streaming and Moonlight reconnection were confirmed on the original MacBook, including reconnection after a Sunshine restart. Full reboot recovery was verified on 22 November 2026. Audible audio, reliable clipboard transfer, and locked-screen behavior remain follow-up checks. The normal boot path now has an automatic key; the original disk password remains available for recovery.

### Recover the virtual display or return to TV capture

From an existing SSH session, verify that `WAYLAND_DISPLAY` and `HYPRLAND_INSTANCE_SIGNATURE` are present in `systemctl --user show-environment`. The Sunshine service uses that desktop environment. Its startup helper creates CRUX-REMOTE before capture. To retry the configured startup path, run:

```bash
systemctl --user restart app-dev.lizardbyte.app.Sunshine.service
journalctl --user -u app-dev.lizardbyte.app.Sunshine.service -n 60 --no-pager
```

Then reconnect Moonlight. If the compositor or graphical session is not running, this helper cannot create a desktop session; inspect that separately. Check the boot state before rebooting to troubleshoot capture. Automatic disk unlock is configured, and the combined full reboot test passed on 22 November 2026.

To deliberately return to the old TV-dependent configuration: reconnect HDMI, back up current files, change Sunshine to `capture = kms`, remove only `output_name = CRUX-REMOTE`, remove the virtual monitor rule, and remove the helper and `10-crux-headless.conf` override. Reload Hyprland, check `hyprctl configerrors`, run `systemctl --user daemon-reload`, remove the live virtual output with `hyprctl output remove CRUX-REMOTE`, then restart Sunshine. Open workspaces should migrate to the remaining physical display; verify them before closing anything. The original configuration backup is `~/.local/state/crux-remote/before-headless-20261122-142356/`. Preserve any newer unrelated settings instead of restoring old files wholesale.

### Remove a computer or turn access off

To revoke one computer’s SSH access, back up `~/.ssh/authorized_keys` on Omarchy and remove only that device’s key line, identified by its key/fingerprint and comment. Existing logged-in sessions may remain active until closed. Revoke its Moonlight pairing in Sunshine’s client-management interface separately.

To turn off the host services deliberately:

```bash
sudo systemctl disable --now sshd.service
systemctl --user disable --now app-dev.lizardbyte.app.Sunshine.service
```

Stopping SSH prevents new connections; stopping Sunshine disconnects streaming. Manage service shutdown from the local PC when possible. For full rollback, remove only UFW rules labeled `crux-lan-ssh` or `crux-lan-sunshine` after reviewing `sudo ufw status numbered`, and remove only configuration changes or packages introduced for this setup. Do not replace the entire firewall with a historical backup over newer unrelated changes.

---

Prepared for Daniel’s Omarchy and Crux Garden Home workstation. Based on the configuration and tests from 22 November 2026. Host address, package compatibility, and client interfaces may change; recheck them when reusing the host-installation section.
