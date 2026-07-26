import React from "react";
import {
  AbsoluteFill,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { Barricade } from "../components/Barricade";
import { Caption } from "../components/Caption";
import { CompassRose } from "../components/CompassRose";
import { Fleet } from "../components/Fleet";
import { MapView } from "../components/MapView";
import { PortraitFrame } from "../components/PortraitFrame";
import { FRANCE_STAND, OCEAN } from "../mapConfig";
import { COLORS, FONT_SANS, FONT_SERIF } from "../theme";

// Napoleon planted on France: framed portrait with a tricolour + name ribbon on its lower edge.
const NapoleonMarker: React.FC<{ enter: number }> = ({ enter }) => (
  <div
    style={{
      position: "absolute",
      left: FRANCE_STAND.x,
      top: FRANCE_STAND.y,
      width: 116,
      transform: `translate(-50%, -50%) translateY(${interpolate(
        enter,
        [0, 1],
        [22, 0]
      )}px) scale(${interpolate(enter, [0, 1], [0.9, 1])})`,
      transformOrigin: "center",
      opacity: enter,
    }}
  >
    <div style={{ position: "relative" }}>
      <PortraitFrame src="napoleon.jpg" width={116} height={148} radius={7} />
      {/* small tricolour flag, top-right */}
      <div
        style={{
          position: "absolute",
          top: -6,
          right: -8,
          display: "flex",
          width: 30,
          height: 20,
          borderRadius: 2,
          overflow: "hidden",
          border: "1px solid rgba(0,0,0,0.4)",
          boxShadow: "0 2px 5px rgba(0,0,0,0.5)",
        }}
      >
        <div style={{ flex: 1, background: COLORS.imperialBlue }} />
        <div style={{ flex: 1, background: "#F4F4F0" }} />
        <div style={{ flex: 1, background: COLORS.imperialRed }} />
      </div>
      {/* name ribbon overlapping the lower edge */}
      <div
        style={{
          position: "absolute",
          bottom: -10,
          left: "50%",
          transform: "translateX(-50%)",
          background: "rgba(8,19,33,0.94)",
          color: COLORS.goldSoft,
          padding: "5px 14px",
          fontFamily: FONT_SANS,
          fontSize: 17,
          fontWeight: 700,
          letterSpacing: 2,
          borderRadius: 5,
          border: `1px solid ${COLORS.gold}`,
          whiteSpace: "nowrap",
          boxShadow: "0 6px 14px rgba(0,0,0,0.5)",
        }}
      >
        NAPOLEON
      </div>
    </div>
  </div>
);

const CAPTIONS = [
  {
    start: 12,
    len: 138,
    kicker: "1806",
    text: "Napoleon commands nearly all of Europe — but the sea defies him.",
  },
  {
    start: 150,
    len: 150,
    kicker: "The Continental Blockade",
    text: "His decree seals the coast: no European port may trade with Britain.",
  },
  {
    start: 300,
    len: 140,
    kicker: "Turned Back",
    text: "Ship after ship sails for Britain and is repelled at the blockade line.",
  },
  {
    start: 440,
    len: 170,
    kicker: "The Reckoning",
    text: "Britain's navy ruled the waves — the blockade bled Napoleon's own empire.",
  },
] as const;

export const BlockadeMap: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();

  // Gentle Ken Burns push across the whole scene.
  const scale = interpolate(frame, [0, durationInFrames], [1.46, 1.55]);

  const napEnter = spring({ frame: frame - 14, fps, config: { damping: 200 } });
  const barricade = interpolate(frame, [55, 175], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const pulse = Math.sin((frame - 175) / 11);

  return (
    <AbsoluteFill style={{ backgroundColor: OCEAN }}>
      <MapView scale={scale} focalX={345} focalY={588}>
        <Barricade progress={barricade} pulse={pulse} />
        <NapoleonMarker enter={napEnter} />
        {frame > 120 && <Fleet localFrame={frame - 120} fps={fps} />}
      </MapView>

      {/* Compass rose + ocean label dressing the open Atlantic */}
      <div style={{ position: "absolute", left: 150, top: 210 }}>
        <CompassRose size={150} opacity={0.5} />
      </div>
      <div
        style={{
          position: "absolute",
          left: 110,
          top: 470,
          fontFamily: FONT_SERIF,
          fontSize: 30,
          letterSpacing: 8,
          color: "rgba(30,58,110,0.42)",
          fontStyle: "italic",
        }}
      >
        ATLANTIC&nbsp;&nbsp;OCEAN
      </div>

      {/* Cinematic vignette */}
      <AbsoluteFill
        style={{
          boxShadow: "inset 0 0 220px 80px rgba(8,19,33,0.55)",
          pointerEvents: "none",
        }}
      />

      {CAPTIONS.map((c) =>
        frame >= c.start && frame < c.start + c.len ? (
          <Caption
            key={c.start}
            localFrame={frame - c.start}
            durationInFrames={c.len}
            kicker={c.kicker}
            text={c.text}
          />
        ) : null
      )}
    </AbsoluteFill>
  );
};
