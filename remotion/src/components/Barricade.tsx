import React from "react";
import { interpolate } from "remotion";
import { BRITAIN, MAP_H, MAP_W } from "../mapConfig";
import { COLORS } from "../theme";

// A fortified ring that draws itself clockwise around Britain, sprouting palisade
// spikes as it closes. `progress` 0→1 = open coastline → sealed blockade.
export const Barricade: React.FC<{ progress: number; pulse?: number }> = ({
  progress,
  pulse = 0,
}) => {
  const { cx, cy, rx, ry } = BRITAIN;
  const spikeCount = 46;
  const spikeLen = 26;
  const glow = interpolate(pulse, [-1, 1], [0.35, 0.7]);

  return (
    <svg
      width={MAP_W}
      height={MAP_H}
      viewBox={`0 0 ${MAP_W} ${MAP_H}`}
      style={{ position: "absolute", left: 0, top: 0, overflow: "visible" }}
    >
      <defs>
        <radialGradient id="blockadeGlow" cx="50%" cy="50%" r="50%">
          <stop offset="60%" stopColor="rgba(230,180,80,0)" />
          <stop offset="100%" stopColor={`rgba(230,180,80,${glow * 0.5})`} />
        </radialGradient>
      </defs>

      {/* Soft threat glow around the ring */}
      <ellipse
        cx={cx}
        cy={cy}
        rx={rx + 34}
        ry={ry + 34}
        fill="url(#blockadeGlow)"
        opacity={progress}
      />

      {/* Palisade spikes pointing outward */}
      {new Array(spikeCount).fill(0).map((_, i) => {
        const frac = i / spikeCount;
        const appear = interpolate(
          progress,
          [frac - 0.05, frac + 0.02],
          [0, 1],
          { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
        );
        if (appear <= 0) return null;
        // Start at top (−90°) and sweep clockwise to match the ring draw.
        const theta = -Math.PI / 2 + frac * Math.PI * 2;
        const bx = cx + rx * Math.cos(theta);
        const by = cy + ry * Math.sin(theta);
        // Outward normal of the ellipse.
        const nx = Math.cos(theta) / rx;
        const ny = Math.sin(theta) / ry;
        const nl = Math.hypot(nx, ny) || 1;
        const ox = bx + (nx / nl) * spikeLen * appear;
        const oy = by + (ny / nl) * spikeLen * appear;
        return (
          <line
            key={i}
            x1={bx}
            y1={by}
            x2={ox}
            y2={oy}
            stroke={COLORS.gold}
            strokeWidth={5}
            strokeLinecap="round"
            opacity={0.9 * appear}
          />
        );
      })}

      {/* Outer stone ring (dark) */}
      <ellipse
        cx={cx}
        cy={cy}
        rx={rx}
        ry={ry}
        fill="none"
        stroke={COLORS.seaDeep}
        strokeWidth={16}
        strokeLinecap="round"
        pathLength={1}
        strokeDasharray={1}
        strokeDashoffset={1 - progress}
        transform={`rotate(-90 ${cx} ${cy})`}
      />
      {/* Inner gold ring (the blockade line) */}
      <ellipse
        cx={cx}
        cy={cy}
        rx={rx}
        ry={ry}
        fill="none"
        stroke={COLORS.gold}
        strokeWidth={7}
        strokeLinecap="round"
        pathLength={1}
        strokeDasharray={1}
        strokeDashoffset={1 - progress}
        transform={`rotate(-90 ${cx} ${cy})`}
        style={{ filter: `drop-shadow(0 0 6px rgba(230,180,80,${glow}))` }}
      />
    </svg>
  );
};
