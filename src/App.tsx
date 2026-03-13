import { useRef, useCallback } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { readFile } from "@tauri-apps/plugin-fs";
import { useVrmViewer } from "./hooks/useVrmViewer";
import "./App.css";

function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const { state, loadVrm, resetCamera, toggleGrid, setBackground } =
    useVrmViewer(canvasRef);

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

  const handleDrop = useCallback(
    async (e: React.DragEvent) => {
      e.preventDefault();
      const file = e.dataTransfer.files[0];
      if (!file || !file.name.endsWith(".vrm")) return;

      const arrayBuffer = await file.arrayBuffer();
      await loadVrm(new Uint8Array(arrayBuffer), file.name);
    },
    [loadVrm]
  );

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
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
          <button className="toolbar-btn" onClick={resetCamera} title="Reset Camera">
            Reset View
          </button>
          <button className="toolbar-btn" onClick={toggleGrid} title="Toggle Grid">
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

      {/* 3D Viewport */}
      <div
        className="viewport"
        onDrop={handleDrop}
        onDragOver={handleDragOver}
      >
        <canvas ref={canvasRef} className="render-canvas" />

        {/* Loading overlay */}
        {state.isLoading && (
          <div className="overlay">
            <div className="spinner" />
            <p>Loading VRM...</p>
          </div>
        )}

        {/* Error overlay */}
        {state.error && (
          <div className="overlay error-overlay">
            <p>Error: {state.error}</p>
          </div>
        )}

        {/* Empty state */}
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

      {/* Status bar */}
      <div className="status-bar">
        <span>Orbit: Left Mouse | Pan: Right Mouse | Zoom: Scroll</span>
        {state.hasModel && <span>{state.modelName}.vrm</span>}
      </div>
    </div>
  );
}

export default App;
