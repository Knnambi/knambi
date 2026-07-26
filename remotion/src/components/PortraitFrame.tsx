import React from "react";
import { Img, staticFile } from "remotion";
import { COLORS } from "../theme";

// A gold-framed historical portrait — used on the title card and planted on France.
export const PortraitFrame: React.FC<{
  src: string;
  width: number;
  height: number;
  radius?: number;
  borderWidth?: number;
}> = ({ src, width, height, radius = 8, borderWidth = 5 }) => {
  return (
    <div
      style={{
        width,
        height,
        borderRadius: radius,
        padding: borderWidth,
        background: `linear-gradient(160deg, ${COLORS.goldSoft}, ${COLORS.gold} 40%, #8a6a2a)`,
        boxShadow:
          "0 18px 40px rgba(0,0,0,0.55), inset 0 0 0 1px rgba(0,0,0,0.35)",
      }}
    >
      <Img
        src={staticFile(src)}
        style={{
          width: "100%",
          height: "100%",
          objectFit: "cover",
          objectPosition: "top center",
          borderRadius: radius - 3,
          display: "block",
        }}
      />
    </div>
  );
};
