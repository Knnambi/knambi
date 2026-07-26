import React from "react";
import { COLORS } from "../theme";

// A faded cartographic compass rose to dress the open ocean.
export const CompassRose: React.FC<{ size?: number; opacity?: number }> = ({
  size = 150,
  opacity = 0.5,
}) => {
  const r = size / 2;

  // Four-point star: tip + two shoulders per arm.
  const star = (armLen: number, shoulder: number, rot: number) =>
    [0, 90, 180, 270]
      .map((a) => {
        const t = ((a + rot) * Math.PI) / 180;
        const s1 = ((a + rot - 45) * Math.PI) / 180;
        const s2 = ((a + rot + 45) * Math.PI) / 180;
        const tip = `${r + armLen * Math.sin(t)},${r - armLen * Math.cos(t)}`;
        const sh1 = `${r + shoulder * Math.sin(s1)},${r - shoulder * Math.cos(s1)}`;
        const sh2 = `${r + shoulder * Math.sin(s2)},${r - shoulder * Math.cos(s2)}`;
        return `${sh1} ${tip} ${sh2}`;
      })
      .join(" ");

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ opacity }}>
      <circle cx={r} cy={r} r={r - 4} fill="none" stroke={COLORS.imperialBlue} strokeWidth={1.5} />
      <circle cx={r} cy={r} r={r - 16} fill="none" stroke={COLORS.imperialBlue} strokeWidth={0.8} />
      <polygon points={star(r - 20, 15, 45)} fill={COLORS.imperialBlue} opacity={0.35} />
      <polygon points={star(r - 8, 17, 0)} fill={COLORS.imperialRed} opacity={0.7} />
      <text
        x={r}
        y={19}
        textAnchor="middle"
        fill={COLORS.imperialBlue}
        fontSize={15}
        fontFamily="Georgia, serif"
        fontWeight={700}
      >
        N
      </text>
    </svg>
  );
};
