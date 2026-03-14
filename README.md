# VRM Viewer

A desktop VRM model viewer built with Tauri, React, and Three.js.

## Features

- Load `.vrm` models via file dialog or drag & drop
- Animation support: `.fbx` (Mixamo), `.vrma`, `.glb`, `.bvh`
- Mixamo FBX auto-retargeting to VRM skeleton
- Expression controls (emotion, blink, viseme sliders)
- Idle animation (breathing, auto-blink)
- Playback controls (play/pause/stop, speed, loop)
- Orbit camera, grid toggle, background color presets

## Getting Started

```sh
npm install
npm run tauri dev
```

## Build

```sh
npm run tauri build
```

## Resources

- [Mixamo](https://www.mixamo.com) — Free character animations (export as FBX Without Skin)
- [VRM Consortium](https://vrm.dev/en/) — VRM format specification
- [@pixiv/three-vrm](https://github.com/pixiv/three-vrm) — VRM loader for Three.js

## Tech Stack

- **Backend**: Tauri (Rust)
- **Frontend**: React + TypeScript
- **3D**: Three.js + @pixiv/three-vrm
