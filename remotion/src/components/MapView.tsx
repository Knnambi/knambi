import React from "react";
import { AbsoluteFill, Img, staticFile, useVideoConfig } from "remotion";
import { FOCAL, MAP_H, MAP_SRC, MAP_W } from "../mapConfig";

// Renders the Europe map at native pixel scale inside a transformed container and
// centers `focal` on screen at the given zoom. Children are positioned in map-pixel space.
export const MapView: React.FC<{
  scale: number;
  focalX?: number;
  focalY?: number;
  children?: React.ReactNode;
}> = ({ scale, focalX = FOCAL.x, focalY = FOCAL.y, children }) => {
  const { width, height } = useVideoConfig();
  const offsetX = width / 2 - focalX * scale;
  const offsetY = height / 2 - focalY * scale;

  return (
    <AbsoluteFill style={{ overflow: "hidden" }}>
      <div
        style={{
          position: "absolute",
          left: offsetX,
          top: offsetY,
          width: MAP_W,
          height: MAP_H,
          transform: `scale(${scale})`,
          transformOrigin: "top left",
        }}
      >
        <Img
          src={staticFile(MAP_SRC)}
          style={{
            width: MAP_W,
            height: MAP_H,
            display: "block",
          }}
        />
        {children}
      </div>
    </AbsoluteFill>
  );
};
