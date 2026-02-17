# Copilot / AI agent instructions — DrawPen

## Quick summary
- Small Electron (React + canvas) screen-annotation app. Main process (OS integration, store, shortcuts, windows) lives in `src/main/index.js`. Renderer (UI + drawing) lives under `src/renderer/*`.

---

## Most important facts (be productive fast) ✅
- Dev/run: `npm start` (development). Packaging: `npm run package`, `npm run make`, `npm run package_no_sign`.
  - On Windows PowerShell set NODE_ENV before starting: `$env:NODE_ENV='development'; npm start`.
- Entry points are declared in `tools/forge/forge.config.js` (three renderer windows: `app_window`, `about_window`, `settings_window`).
- Persistent configuration: `electron-store` schema at the top of `src/main/index.js`. Update schema + settings UI together.
- IPC surface is explicit and must be used via `preload.js` -> `window.electronAPI`. Do NOT call Electron APIs directly from renderer.

---

## Architecture & why it matters 🔧
- `src/main/index.js` — responsibilities:
  - app lifecycle, Tray/menu, `electron-store` schema, global shortcuts, IPC handlers, packaging helpers.
  - central place for platform-specific behavior (mac signing, Linux X11 build variant, shortcut normalization).
- `src/renderer/*` — responsibilities:
  - UI (React functional components + SCSS), canvas drawing logic (`DrawDesk.js`, `components/drawer/figures.js`), settings UI (`settings_page`).
  - Preloads expose a small `window.electronAPI` API surface — renderer → main communication only through these methods.
- Build: `@electron-forge/plugin-webpack` with `tools/webpack/*` (renderer supports HMR in dev; `src/assets` copied into the packaged build).

---

## IPC / preload API (use these exact names) 📡
- App page (`src/renderer/app_page/preload.js`):
  - invokeHideApp()  -> `hide_app`
  - invokeOpenSettings() -> `open_settings`
  - invokeMakeScreenshot() -> `make_screenshot`
  - invokeGetSettings() -> `get_settings`
  - invokeSetSettings(settings) -> `set_settings`
  - onResetScreen(cb) -> listens to `reset_screen`
  - onToggleToolbar(cb) -> `toggle_toolbar`
  - onToggleWhiteboard(cb) -> `toggle_whiteboard`
  - onRefreshSettings(cb) -> `refresh_settings`
- Settings page (`src/renderer/settings_page/preload.js`):
  - getConfiguration() -> `get_configuration`
  - setShortcut(key, value) -> `set_shortcut`
  - canRegisterShortcut(accel) -> `can_register_shortcut`
  - setLaunchOnLogin(value), setDrawingMonitor(value), setShowDrawingBorder(value), etc. (see `preload.js`).
- About page: `getVersion()` -> `get_app_version`.

> When you add a renderer → main interaction: add IPC handler in `src/main/index.js`, expose in the relevant `preload.js`, then consume in renderer.

---

## Key project conventions & patterns 📐
- UI: React functional components + paired `.scss` (e.g. `ToolBar.js` + `ToolBar.scss`).
- Drawing: pointer events + canvas (see `DrawDesk.js`) and low-level rendering in `components/drawer/figures.js`.
- Shared constants in `src/renderer/app_page/components/constants.js` (colors, brushes, width sizes) — change here for visual/size adjustments.
- Settings/state flow:
  - Defaults live in `electron-store` schema (top of `src/main/index.js`).
  - Renderer requests via `get_settings` / `get_configuration` and updates via `set_settings` or dedicated IPC handlers.
- Shortcut handling: normalized in `src/main/index.js` (`normalizeAcceleratorForUI` / `deNormalizeAcceleratorFromUI`) and validated with `can_register_shortcut`.

---

## Examples you will need (copy/paste) ✂️
- Figure object (used across renderer state):

```json
{ "id": 1650000000000, "type": "arrow", "colorIndex": 0, "widthIndex": 2, "points": [[100,100],[400,100]], "rainbowColorDeg": 120 }
```

- Read settings (renderer): `const s = await window.electronAPI.invokeGetSettings()`
- Send settings update (renderer): `window.electronAPI.invokeSetSettings({ show_tool_bar: false })`

---

## Where to change things for common tasks 🛠
- Add new setting: update schema in `src/main/index.js` → expose via `get_configuration` / `get_settings` → add control in `src/renderer/settings_page/components/Settings.js` → call `refreshSettingsInRenderer()` or reload `mainWindow` if necessary.
- Change drawing/rendering: update `components/drawer/figures.js` (visual) and `utils/figureDetection.js` (hit/drag math); test with `src/renderer/app_page/components/Application.js` in dev.
- Add toolbar button/action: `ToolBar.js` → `Application.js` handlers → any IPC if it needs main process behavior.

---

## Build / packaging notes & CI variables ⚠️
- Commands: `npm start`, `npm run package`, `npm run make`, `npm run publish`.
- macOS signing/notarize depends on env vars: `APPLE_ID`, `APPLE_PASSWORD`, `APPLE_TEAM_ID` (configured in `tools/forge/forge.config.js`).
- Analytics: `PUBLIC_POSTHOG_KEY` (disabled in dev).
- Linux: there is an X11-specific maker (`drawpen-x11`) — see `forge.config.js`.

---

## Tests / debugging tips 🔍
- No automated test suite present — rely on manual verification in dev.
- Enable dev-mode to get DevTools and HMR: set `NODE_ENV=development` (PowerShell example above).
- Use `rawLog(...)` in `src/main/index.js` (only logs in dev) for quick main-process diagnostics.

---

## Do / Don't (short) ✅ / ❌
- ✅ Use `window.electronAPI` for renderer → main communication.
- ✅ Update both schema (main) and settings UI (renderer) when adding settings.
- ✅ Edit constants in `constants.js` for UI scale/behavior changes.
- ❌ Don’t access Node APIs from renderer directly.
- ❌ Don’t change shortcut strings in UI without using `set_shortcut` handler (use normalization helpers).

---

If any section is unclear or you want more examples (e.g. adding a new IPC handler, adding a brush type, or making a packaging change), tell me which topic to expand and I will iterate. ✨
