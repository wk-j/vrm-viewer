import { useRef, useCallback, useState, useEffect } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { readFile } from "@tauri-apps/plugin-fs";
import { useVrmViewer } from "./hooks/useVrmViewer";
import { AnimationPanel } from "./components/AnimationPanel";
import { ExpressionPanel } from "./components/ExpressionPanel";
import "./App.css";

// Default example files bundled in public/examples/
const DEFAULT_VRM = "/examples/Skull.vrm";
const DEFAULT_ANIMATION = "/examples/Hip Hop Dancing.fbx";

type SideTab = "animation" | "expressions" | null;

function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [sideTab, setSideTab] = useState<SideTab>(null);
  const defaultLoadedRef = useRef(false);

  const {
    state,
    loadVrm,
    loadAnimation,
    playClip,
    togglePlayPause,
    stopAnimation,
    setAnimationSpeed,
    setAnimationLoop,
    removeClip,
    setExpression,
    resetExpressions,
    setIdleEnabled,
    setIdleBreathing,
    setIdleBlinking,
    resetCamera,
    toggleGrid,
    setBackground,
  } = useVrmViewer(canvasRef);

  // Auto-load default VRM and animation on startup
  useEffect(() => {
    if (defaultLoadedRef.current) return;
    defaultLoadedRef.current = true;

    (async () => {
      try {
        // Load default VRM model
        const vrmResp = await fetch(DEFAULT_VRM);
        if (vrmResp.ok) {
          const vrmBytes = new Uint8Array(await vrmResp.arrayBuffer());
          const vrmName = DEFAULT_VRM.split("/").pop() ?? "model.vrm";
          await loadVrm(vrmBytes, vrmName);

          // Then load default animation
          const animResp = await fetch(DEFAULT_ANIMATION);
          if (animResp.ok) {
            const animBytes = new Uint8Array(await animResp.arrayBuffer());
            const animName = DEFAULT_ANIMATION.split("/").pop() ?? "animation.fbx";
            await loadAnimation(animBytes, animName);
          }
        }
      } catch (err) {
        console.warn("Could not load default example files:", err);
      }
    })();
  }, [loadVrm, loadAnimation]);

  const handleOpenFile = useCallback(async () => {
    try {
      const selected = await open({
        multiple: false,
        filters: [{ name: "VRM Files", extensions: ["vrm"] }],
      });

      if (!selected) return;

      const filePath = selected;
      const fileName = filePath.split(/[/\\]/).pop() ?? "model.vrm";
      const bytes = await readFile(filePath);
      await loadVrm(new Uint8Array(bytes), fileName);
    } catch (err) {
      console.error("File open error:", err);
    }
  }, [loadVrm]);

  const handleLoadAnimation = useCallback(
    async (bytes: Uint8Array, name: string) => {
      await loadAnimation(bytes, name);
    },
    [loadAnimation]
  );

  const handleDrop = useCallback(
    async (e: React.DragEvent) => {
      e.preventDefault();
      const file = e.dataTransfer.files[0];
      if (!file) return;

      const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
      const arrayBuffer = await file.arrayBuffer();
      const bytes = new Uint8Array(arrayBuffer);

      if (ext === "vrm") {
        await loadVrm(bytes, file.name);
      } else if (["vrma", "fbx", "glb", "gltf", "bvh"].includes(ext)) {
        await loadAnimation(bytes, file.name);
      }
    },
    [loadVrm, loadAnimation]
  );

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const toggleSideTab = (tab: SideTab) => {
    setSideTab((prev) => (prev === tab ? null : tab));
  };

  return (
    <div className="app">
      {/* Toolbar */}
      <div className="toolbar">
        <div className="toolbar-left">
          <button className="toolbar-btn primary" onClick={handleOpenFile}>
            Open VRM
          </button>
          {state.modelName && (
            <span className="model-name">{state.modelName}</span>
          )}
        </div>
        <div className="toolbar-right">
          <button
            className={`toolbar-btn ${sideTab === "animation" ? "active" : ""}`}
            onClick={() => toggleSideTab("animation")}
            title="Animation Panel"
          >
            Anim
          </button>
          <button
            className={`toolbar-btn ${sideTab === "expressions" ? "active" : ""}`}
            onClick={() => toggleSideTab("expressions")}
            title="Expressions Panel"
          >
            Expr
          </button>
          <div className="toolbar-sep" />
          <button
            className="toolbar-btn"
            onClick={resetCamera}
            title="Reset Camera"
          >
            Reset View
          </button>
          <button
            className="toolbar-btn"
            onClick={toggleGrid}
            title="Toggle Grid"
          >
            Grid
          </button>
          <div className="bg-colors">
            <button
              className="color-swatch dark"
              onClick={() => setBackground("#1a1a2e")}
              title="Dark"
            />
            <button
              className="color-swatch neutral"
              onClick={() => setBackground("#2d2d2d")}
              title="Neutral"
            />
            <button
              className="color-swatch light"
              onClick={() => setBackground("#e0e0e0")}
              title="Light"
            />
          </div>
        </div>
      </div>

      {/* Main content area */}
      <div className="main-area">
        {/* 3D Viewport */}
        <div
          className="viewport"
          onDrop={handleDrop}
          onDragOver={handleDragOver}
        >
          <canvas ref={canvasRef} className="render-canvas" />

          {state.isLoading && (
            <div className="overlay">
              <div className="spinner" />
              <p>Loading...</p>
            </div>
          )}

          {state.error && (
            <div className="overlay error-overlay">
              <p>Error: {state.error}</p>
            </div>
          )}

          {!state.hasModel && !state.isLoading && !state.error && (
            <div className="overlay empty-state">
              <div className="empty-icon">&#x1F464;</div>
              <p className="empty-title">No VRM Model Loaded</p>
              <p className="empty-hint">
                Click <strong>Open VRM</strong> or drag & drop a .vrm file
              </p>
            </div>
          )}
        </div>

        {/* Side panel */}
        {sideTab && (
          <div className="side-panel">
            {sideTab === "animation" && (
              <AnimationPanel
                animation={state.animation}
                onLoadAnimation={handleLoadAnimation}
                onPlayClip={playClip}
                onTogglePlayPause={togglePlayPause}
                onStop={stopAnimation}
                onSpeedChange={setAnimationSpeed}
                onLoopChange={setAnimationLoop}
                onRemoveClip={removeClip}
              />
            )}
            {sideTab === "expressions" && (
              <ExpressionPanel
                availableExpressions={state.availableExpressions}
                idle={state.idle}
                onSetExpression={setExpression}
                onResetExpressions={resetExpressions}
                onSetIdleEnabled={setIdleEnabled}
                onSetIdleBreathing={setIdleBreathing}
                onSetIdleBlinking={setIdleBlinking}
              />
            )}
          </div>
        )}
      </div>

      {/* Status bar */}
      <div className="status-bar">
        <span>Orbit: Left Mouse | Pan: Right Mouse | Zoom: Scroll</span>
        <span>
          {state.animation.currentClip && (
            <>
              {state.animation.isPlaying ? "\u25B6" : "\u23F8"}{" "}
              {state.animation.currentClip}
              {" | "}
            </>
          )}
          {state.hasModel && <>{state.modelName}.vrm</>}
        </span>
      </div>
    </div>
  );
}

export default App;
