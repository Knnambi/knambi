import React from "react";
import {
  AbsoluteFill,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { PortraitFrame } from "../components/PortraitFrame";
import { COLORS, FONT_SANS, FONT_SERIF } from "../theme";

export const TitleCard: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();

  const portrait = spring({ frame, fps, config: { damping: 200, mass: 0.9 } });
  const title = spring({ frame: frame - 10, fps, config: { damping: 200 } });
  const sub = spring({ frame: frame - 22, fps, config: { damping: 200 } });
  const out = interpolate(
    frame,
    [durationInFrames - 16, durationInFrames],
    [1, 0],
    { extrapolateLeft: "clamp" }
  );

  return (
    <AbsoluteFill
      style={{
        background: `radial-gradient(70% 70% at 50% 40%, ${COLORS.sea}, ${COLORS.seaDeep})`,
        justifyContent: "center",
        alignItems: "center",
        opacity: out,
      }}
    >
      <div
        style={{
          opacity: portrait,
          transform: `translateY(${interpolate(
            portrait,
            [0, 1],
            [30, 0]
          )}px) scale(${interpolate(portrait, [0, 1], [0.94, 1])})`,
        }}
      >
        <PortraitFrame src="napoleon_face.jpg" width={230} height={300} />
      </div>

      <h1
        style={{
          fontFamily: FONT_SERIF,
          fontSize: 92,
          fontWeight: 700,
          color: COLORS.ink,
          margin: "38px 0 0",
          letterSpacing: 1,
          textAlign: "center",
          opacity: title,
          transform: `translateY(${interpolate(title, [0, 1], [24, 0])}px)`,
          textShadow: "0 4px 24px rgba(0,0,0,0.6)",
        }}
      >
        The Continental Blockade
      </h1>

      <div
        style={{
          marginTop: 22,
          display: "flex",
          alignItems: "center",
          gap: 20,
          opacity: sub,
          transform: `translateY(${interpolate(sub, [0, 1], [18, 0])}px)`,
        }}
      >
        <span style={{ height: 1, width: 60, background: COLORS.gold }} />
        <span
          style={{
            fontFamily: FONT_SANS,
            fontSize: 30,
            letterSpacing: 3,
            color: COLORS.goldSoft,
            textTransform: "uppercase",
          }}
        >
          Napoleon&apos;s war to starve Britain · 1806
        </span>
        <span style={{ height: 1, width: 60, background: COLORS.gold }} />
      </div>
    </AbsoluteFill>
  );
};
