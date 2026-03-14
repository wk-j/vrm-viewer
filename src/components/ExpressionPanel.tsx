import { useState, useCallback } from "react";
import type { IdleAnimationState } from "../hooks/useVrmViewer";

// Pretty labels for expression preset names
const EXPRESSION_LABELS: Record<string, string> = {
  happy: "Happy",
  angry: "Angry",
  sad: "Sad",
  relaxed: "Relaxed",
  surprised: "Surprised",
  blink: "Blink",
  blinkLeft: "Blink Left",
  blinkRight: "Blink Right",
  aa: "Aa",
  ih: "Ih",
  ou: "Ou",
  ee: "Ee",
  oh: "Oh",
  neutral: "Neutral",
};

// Group expressions by category
const EMOTION_EXPRESSIONS = ["happy", "angry", "sad", "relaxed", "surprised", "neutral"];
const BLINK_EXPRESSIONS = ["blink", "blinkLeft", "blinkRight"];
const VISEME_EXPRESSIONS = ["aa", "ih", "ou", "ee", "oh"];

interface ExpressionPanelProps {
  availableExpressions: string[];
  idle: IdleAnimationState;
  onSetExpression: (name: string, value: number) => void;
  onResetExpressions: () => void;
  onSetIdleEnabled: (enabled: boolean) => void;
  onSetIdleBreathing: (breathing: boolean) => void;
  onSetIdleBlinking: (blinking: boolean) => void;
}

export function ExpressionPanel({
  availableExpressions,
  idle,
  onSetExpression,
  onResetExpressions,
  onSetIdleEnabled,
  onSetIdleBreathing,
  onSetIdleBlinking,
}: ExpressionPanelProps) {
  const [values, setValues] = useState<Record<string, number>>({});

  const handleChange = useCallback(
    (name: string, value: number) => {
      setValues((prev) => ({ ...prev, [name]: value }));
      onSetExpression(name, value);
    },
    [onSetExpression]
  );

  const handleReset = useCallback(() => {
    setValues({});
    onResetExpressions();
  }, [onResetExpressions]);

  const emotions = availableExpressions.filter((e) =>
    EMOTION_EXPRESSIONS.includes(e)
  );
  const blinks = availableExpressions.filter((e) =>
    BLINK_EXPRESSIONS.includes(e)
  );
  const visemes = availableExpressions.filter((e) =>
    VISEME_EXPRESSIONS.includes(e)
  );
  const other = availableExpressions.filter(
    (e) =>
      !EMOTION_EXPRESSIONS.includes(e) &&
      !BLINK_EXPRESSIONS.includes(e) &&
      !VISEME_EXPRESSIONS.includes(e)
  );

  const renderSlider = (name: string) => (
    <div key={name} className="expression-row">
      <label className="expression-label">
        {EXPRESSION_LABELS[name] ?? name}
      </label>
      <input
        type="range"
        min="0"
        max="1"
        step="0.01"
        value={values[name] ?? 0}
        onChange={(e) => handleChange(name, parseFloat(e.target.value))}
        className="slider"
      />
      <span className="expression-value">
        {(values[name] ?? 0).toFixed(2)}
      </span>
    </div>
  );

  return (
    <div className="panel">
      <div className="panel-header">
        <span className="panel-title">Expressions</span>
        <button className="panel-btn" onClick={handleReset}>
          Reset
        </button>
      </div>

      {availableExpressions.length === 0 ? (
        <p className="panel-hint">Load a VRM model to see expressions</p>
      ) : (
        <div className="expression-groups">
          {emotions.length > 0 && (
            <div className="expression-group">
              <div className="group-label">Emotion</div>
              {emotions.map(renderSlider)}
            </div>
          )}

          {blinks.length > 0 && (
            <div className="expression-group">
              <div className="group-label">Blink</div>
              {blinks.map(renderSlider)}
            </div>
          )}

          {visemes.length > 0 && (
            <div className="expression-group">
              <div className="group-label">Viseme</div>
              {visemes.map(renderSlider)}
            </div>
          )}

          {other.length > 0 && (
            <div className="expression-group">
              <div className="group-label">Other</div>
              {other.map(renderSlider)}
            </div>
          )}
        </div>
      )}

      {/* Idle animation section */}
      <div className="panel-section">
        <div className="panel-header">
          <span className="panel-title">Idle Animation</span>
        </div>
        <div className="idle-controls">
          <label className="checkbox-row">
            <input
              type="checkbox"
              checked={idle.enabled}
              onChange={(e) => onSetIdleEnabled(e.target.checked)}
            />
            Enable Idle
          </label>
          <label className="checkbox-row">
            <input
              type="checkbox"
              checked={idle.breathing}
              disabled={!idle.enabled}
              onChange={(e) => onSetIdleBreathing(e.target.checked)}
            />
            Breathing
          </label>
          <label className="checkbox-row">
            <input
              type="checkbox"
              checked={idle.blinking}
              disabled={!idle.enabled}
              onChange={(e) => onSetIdleBlinking(e.target.checked)}
            />
            Auto-Blink
          </label>
        </div>
      </div>
    </div>
  );
}
