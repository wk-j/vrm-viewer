import { useCallback } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { readFile } from "@tauri-apps/plugin-fs";
import type { AnimationState, AnimationClipInfo } from "../hooks/useVrmViewer";

interface AnimationPanelProps {
  animation: AnimationState;
  onLoadAnimation: (bytes: Uint8Array, name: string) => void;
  onPlayClip: (name: string) => void;
  onTogglePlayPause: () => void;
  onStop: () => void;
  onSpeedChange: (speed: number) => void;
  onLoopChange: (loop: boolean) => void;
  onRemoveClip: (name: string) => void;
}

export function AnimationPanel({
  animation,
  onLoadAnimation,
  onPlayClip,
  onTogglePlayPause,
  onStop,
  onSpeedChange,
  onLoopChange,
  onRemoveClip,
}: AnimationPanelProps) {
  const handleLoadFile = useCallback(async () => {
    try {
      const selected = await open({
        multiple: false,
        filters: [
          {
            name: "Animation Files",
            extensions: ["vrma", "fbx", "glb", "gltf", "bvh"],
          },
        ],
      });

      if (!selected) return;

      const filePath = selected;
      const fileName = filePath.split(/[/\\]/).pop() ?? "animation";
      const bytes = await readFile(filePath);
      onLoadAnimation(new Uint8Array(bytes), fileName);
    } catch (err) {
      console.error("Animation file open error:", err);
    }
  }, [onLoadAnimation]);

  const formatDuration = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = (seconds % 60).toFixed(1);
    return m > 0 ? `${m}:${s.padStart(4, "0")}` : `${s}s`;
  };

  return (
    <div className="panel">
      <div className="panel-header">
        <span className="panel-title">Animation</span>
        <button className="panel-btn accent" onClick={handleLoadFile}>
          Load
        </button>
      </div>

      {/* Clip list */}
      {animation.clips.length > 0 && (
        <div className="clip-list">
          {animation.clips.map((clip: AnimationClipInfo) => (
            <div
              key={clip.name}
              className={`clip-item ${animation.currentClip === clip.name ? "active" : ""}`}
            >
              <button
                className="clip-name"
                onClick={() => onPlayClip(clip.name)}
                title={`Play: ${clip.name}`}
              >
                <span className="clip-icon">
                  {animation.currentClip === clip.name && animation.isPlaying
                    ? "\u25B6"
                    : "\u25CF"}
                </span>
                <span className="clip-label">{clip.name}</span>
                <span className="clip-duration">
                  {formatDuration(clip.duration)}
                </span>
              </button>
              <button
                className="clip-remove"
                onClick={() => onRemoveClip(clip.name)}
                title="Remove"
              >
                x
              </button>
            </div>
          ))}
        </div>
      )}

      {animation.clips.length === 0 && (
        <p className="panel-hint">
          Load .vrma, .fbx, .glb, or .bvh files
        </p>
      )}

      {/* Transport controls */}
      {animation.clips.length > 0 && (
        <div className="transport">
          <button
            className="transport-btn"
            onClick={onTogglePlayPause}
            disabled={!animation.currentClip}
            title={animation.isPlaying ? "Pause" : "Play"}
          >
            {animation.isPlaying ? "\u23F8" : "\u25B6"}
          </button>
          <button
            className="transport-btn"
            onClick={onStop}
            disabled={!animation.currentClip}
            title="Stop"
          >
            {"\u23F9"}
          </button>
          <label className="transport-loop" title="Loop">
            <input
              type="checkbox"
              checked={animation.loop}
              onChange={(e) => onLoopChange(e.target.checked)}
            />
            Loop
          </label>
        </div>
      )}

      {/* Speed control */}
      {animation.clips.length > 0 && (
        <div className="speed-control">
          <label className="speed-label">Speed: {animation.speed.toFixed(1)}x</label>
          <input
            type="range"
            min="0.1"
            max="3.0"
            step="0.1"
            value={animation.speed}
            onChange={(e) => onSpeedChange(parseFloat(e.target.value))}
            className="slider"
          />
        </div>
      )}
    </div>
  );
}
