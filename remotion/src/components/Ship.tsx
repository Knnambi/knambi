import React from "react";

// A small side-view sailing ship, drawn centered on (0,0). `flip` faces it left.
export const Ship: React.FC<{
  size?: number;
  flip?: boolean;
  sailColor?: string;
  opacity?: number;
}> = ({ size = 34, flip = false, sailColor = "#F3E6C8", opacity = 1 }) => {
  return (
    <svg
      width={size}
      height={size}
      viewBox="-20 -22 40 44"
      style={{
        overflow: "visible",
        opacity,
        transform: flip ? "scaleX(-1)" : undefined,
        filter: "drop-shadow(0 2px 2px rgba(0,0,0,0.45))",
      }}
    >
      {/* masts + sails */}
      <line x1={-4} y1={6} x2={-4} y2={-16} stroke="#5A3B21" strokeWidth={1.6} />
      <line x1={6} y1={6} x2={6} y2={-12} stroke="#5A3B21" strokeWidth={1.6} />
      <path d={`M -4 -15 L 7 4 L -4 4 Z`} fill={sailColor} />
      <path d={`M 6 -11 L 14 4 L 6 4 Z`} fill={sailColor} opacity={0.92} />
      {/* hull */}
      <path
        d="M -13 5 L 13 5 L 9 13 L -9 13 Z"
        fill="#6B4326"
        stroke="#3C2413"
        strokeWidth={1}
      />
      <rect x={-13} y={4} width={26} height={2.4} fill="#3C2413" />
    </svg>
  );
};
