import React from "react";
import { interpolate, spring, useVideoConfig } from "remotion";
import { COLORS, FONT_SANS, FONT_SERIF } from "../theme";

// A lower-third narration bar. `localFrame` is measured from when this caption mounts.
export const Caption: React.FC<{
  localFrame: number;
  kicker: string;
  text: string;
  durationInFrames?: number;
}> = ({ localFrame, kicker, text, durationInFrames }) => {
  const { fps, width } = useVideoConfig();
  const enter = spring({ frame: localFrame, fps, config: { damping: 200 } });
  const exit = durationInFrames
    ? interpolate(
        localFrame,
        [durationInFrames - 14, durationInFrames],
        [1, 0],
        { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
      )
    : 1;

  return (
    <div
      style={{
        position: "absolute",
        left: 0,
        right: 0,
        bottom: 70,
        display: "flex",
        justifyContent: "center",
        opacity: enter * exit,
        transform: `translateY(${interpolate(enter, [0, 1], [30, 0])}px)`,
      }}
    >
      <div
        style={{
          maxWidth: width * 0.74,
          background: "rgba(8,19,33,0.82)",
          border: `1px solid rgba(230,180,80,0.4)`,
          borderRadius: 14,
          padding: "20px 34px",
          backdropFilter: "blur(4px)",
          textAlign: "center",
        }}
      >
        <div
          style={{
            fontFamily: FONT_SANS,
            fontSize: 22,
            letterSpacing: 4,
            textTransform: "uppercase",
            color: COLORS.gold,
            marginBottom: 8,
          }}
        >
          {kicker}
        </div>
        <div
          style={{
            fontFamily: FONT_SERIF,
            fontSize: 38,
            lineHeight: 1.35,
            color: COLORS.ink,
          }}
        >
          {text}
        </div>
      </div>
    </div>
  );
};
