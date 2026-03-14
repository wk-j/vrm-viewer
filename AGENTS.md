# AGENTS.md — Coding Agent Guidelines for vrm-viewer

## Project Overview

Desktop VRM model viewer built with Tauri v2 (Rust) + React 19 + TypeScript + Three.js.
Frontend-heavy: all 3D/animation logic is in TypeScript. Rust backend is minimal (plugin init only).

## Build & Dev Commands

| Command                | Purpose                                      |
|------------------------|----------------------------------------------|
| `npm run tauri dev`    | Development mode (Vite HMR + Rust backend)   |
| `npm run tauri build`  | Production build + platform bundles           |
| `npm run build`        | Frontend only: `tsc && vite build`            |
| `npm run dev`          | Vite dev server only (no Tauri backend)       |
| `npx tsc --noEmit`     | Type-check without emitting files             |

- **Prefer `npx tsc --noEmit`** for quick validation during development.
- **Use `npm run tauri dev`** when testing Tauri-specific features (dialog, fs).
- **Avoid `npm run tauri build`** unless a release build is explicitly requested — it compiles Rust in release mode and bundles installers, which takes minutes.
- No test framework is configured. No linter or formatter is configured.

## Rust Backend

Minimal boilerplate — only plugin registration in `src-tauri/src/lib.rs`. No custom Tauri commands.
Build deps managed via `src-tauri/Cargo.toml`. Edition 2021. Uses 4-space indentation (standard rustfmt).

To add a Tauri plugin:
1. Add crate to `src-tauri/Cargo.toml` under `[dependencies]`
2. Register with `.plugin(tauri_plugin_name::init())` in `lib.rs`
3. Add permissions in `src-tauri/capabilities/default.json`
4. Install JS bindings: `npm install @tauri-apps/plugin-name`

## Project Structure

```
src/
├── main.tsx                    # React entry (StrictMode + createRoot)
├── App.tsx                     # Root component: toolbar, viewport, side panels
├── App.css                     # All styles (single global CSS file, dark theme)
├── hooks/
│   └── useVrmViewer.ts         # Core hook: Three.js scene, VRM, animation, retargeting (~1000 lines)
├── components/
│   ├── AnimationPanel.tsx      # Animation clip list, transport, speed controls
│   └── ExpressionPanel.tsx     # VRM expression sliders, idle animation toggles
└── vite-env.d.ts

src-tauri/
├── src/lib.rs                  # Tauri builder with plugins (dialog, fs, opener)
├── src/main.rs                 # Entry point, calls lib::run()
├── capabilities/default.json   # Tauri permission grants
├── Cargo.toml                  # Rust dependencies
└── tauri.conf.json             # App config (window size, bundle, build commands)

public/examples/                # Default VRM + FBX loaded on startup
```

## Code Style

### TypeScript / React

**Formatting:**
- 2-space indentation
- Double quotes for strings
- Semicolons always
- Trailing commas in multi-line constructs

**Imports — order by group, separated implicitly:**
1. React imports (`react`, `react-dom`)
2. Third-party libraries (`three`, `@tauri-apps/*`, `@pixiv/*`)
3. Internal modules (relative `./` imports)
4. CSS imports last

Use `import type { ... }` for type-only imports.

**Types and Interfaces:**
- `interface` for object shapes and component props (e.g., `AnimationPanelProps`)
- `type` for unions and aliases (e.g., `type SideTab = "animation" | "expressions" | null`)
- `as const` for literal arrays used as type sources
- No enums — use union types instead
- Minimize `as any`; acceptable only for library type gaps (e.g., VRM bone name lookups)
- Strict mode enabled: `noUnusedLocals`, `noUnusedParameters`, `noFallthroughCasesInSwitch`

**Naming:**
- Files: PascalCase for components (`AnimationPanel.tsx`), camelCase for hooks (`useVrmViewer.ts`)
- Directories: lowercase (`components/`, `hooks/`)
- Components: PascalCase, named exports (`export function AnimationPanel`)
- Only `App` uses default export
- Event handlers: `handle` prefix (`handleOpenFile`, `handleDrop`)
- Callback props: `on` prefix (`onPlayClip`, `onSpeedChange`)
- Refs: camelCase + `Ref` suffix (`mixerRef`, `vrmRef`, `canvasRef`)
- Constants: UPPER_SNAKE_CASE (`DEFAULT_VRM`, `MIXAMO_TO_VRM_BONE`)
- Types/Interfaces: PascalCase (`VrmViewerState`, `AnimationClipInfo`)

**React Patterns:**
- Custom hooks for complex logic (`useVrmViewer` encapsulates all 3D state)
- `useRef` for mutable objects that shouldn't trigger re-renders (Three.js objects, timers)
- `useCallback` for all functions returned from hooks or passed as props
- `useState` with functional updates: `setState((prev) => ({ ...prev, ... }))`
- Cleanup in `useEffect` return (dispose renderers, cancel animation frames, remove listeners)
- IIFE for async logic inside `useEffect`: `(async () => { ... })()`
- No external state management (no Redux/Zustand). Single hook + refs pattern.

**Error Handling:**
- Wrap all async operations in `try/catch`
- Extract message: `err instanceof Error ? err.message : "fallback"`
- Store in `state.error` for UI display
- Log with `console.error("Context:", err)` or `console.warn()`
- Guard clauses with early return for missing prerequisites

### CSS

- Single global file (`App.css`), plain CSS, no modules/preprocessors/Tailwind
- kebab-case class names (`toolbar-btn`, `clip-item`, `side-panel`)
- Section headers: `/* ========== Section Name ========== */`
- Dark theme with hardcoded hex colors (purple-tinted: `#1a1a2e`, `#16162a`, etc.)

### Three.js Integration

- Bare Three.js (no React-Three-Fiber)
- Loaders from `three/examples/jsm/`: `GLTFLoader`, `FBXLoader`, `BVHLoader`, `OrbitControls`
- VRM via `@pixiv/three-vrm` (`VRMLoaderPlugin`) and `@pixiv/three-vrm-animation`
- AnimationMixer targets `vrm.humanoid.normalizedHumanBonesRoot` (detached hierarchy)
- Mixamo FBX retargeting: `inverse(fbxLocalRest) * fbxLocalAnim` applied to normalized bones
- Always call `updateMatrixWorld(true)` on both FBX root and normalized rig root before retargeting

## Key Architectural Notes

- The `useVrmViewer` hook is the heart of the app. Changes to 3D logic go there.
- VRM normalized bones have identity rest rotations — retargeted animations write motion deltas directly.
- Default example files in `public/examples/` are fetched on startup via `fetch()`.
- User-opened files use Tauri's `@tauri-apps/plugin-dialog` (open) + `@tauri-apps/plugin-fs` (readFile).
- Drag & drop bypasses Tauri and uses the browser File API directly.

## Dependencies

**Key frontend:** `three` ^0.183, `@pixiv/three-vrm` ^3.5, `@pixiv/three-vrm-animation` ^3.5, `react` ^19, `@tauri-apps/api` ^2
**Key backend:** `tauri` 2, `tauri-plugin-dialog` 2, `tauri-plugin-fs` 2
