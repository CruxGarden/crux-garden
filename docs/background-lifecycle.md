# Migration background lifecycle

The desktop host owns lifetime; the React UI and engine do not own native tray/window behavior. Both Tauri and the Electron comparison host keep the same engine, worker, local API port/token and SQLite owner when closing the window. Closing hides the existing window rather than rebuilding the client. A visible notice explains this behavior.

The tray/menu-bar menu exposes **Open Migration** and **Pause work and quit**. macOS Dock activation reopens the same window; Electron also routes a second launch to it. Tauri retains its existing profile lock rather than spawning a second owner; cross-platform second-launch forwarding remains future work. A tray creation failure does not silently hide the window. Native explicit Quit stops work and flushes SQLite. Tauri explicitly performs service shutdown on the exit event; relying on Rust destructors alone is insufficient for application termination. Electron waits for the child to exit before exiting the host. Both retain their five-second shutdown deadline as a last resort.

This is background operation while the application is running, not an OS service, login item, sleep-prevention policy, network downloader, or promise to survive force quit. Graceful quit pauses incomplete work. Resume is explicit after restart. An unclean force kill can still leave a stale `service.lock`; verify its process is gone before removing it. Direct provider downloading, remote checkpoints and automatic crash ownership recovery remain separate work.

## Acceptance evidence

The real Electron journey starts a 512-file copy after the window is hidden, observes verification through the local API, confirms the same service descriptor, reopens the result, then quits another active copy and resumes it after restart without duplicate output. Existing folder/archive, provider-guide, Mood, narrow-layout and browser embedding checks remain passing.

Packaged Tauri acceptance on macOS Apple Silicon: closed its actual native window with Command-W (no window remained), then started a synthetic copy through the loopback API. It reached verified state with matching bytes and the same service PID. Reopening the running app displayed the verified result. Explicit Command-Q removed the connection descriptor and service ownership lock. Menu items are compiled and registered; direct clicking of the OS tray menu was not automated. Broader Windows/Linux tray behavior remains unqualified.

## References

Implementation uses the native [Tauri tray API](https://v2.tauri.app/learn/system-tray/), [Tauri exit events](https://docs.rs/tauri/latest/tauri/enum.RunEvent.html), and [Electron tray API](https://www.electronjs.org/docs/latest/api/tray). No renderer filesystem or HTTP credentials are added.
