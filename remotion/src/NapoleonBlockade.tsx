import React from "react";
import { AbsoluteFill, Series } from "remotion";
import { TitleCard } from "./scenes/TitleCard";
import { BlockadeMap } from "./scenes/BlockadeMap";
import { COLORS } from "./theme";

// Full film: title card → the map story of the blockade.
export const NapoleonBlockade: React.FC = () => {
  return (
    <AbsoluteFill style={{ backgroundColor: COLORS.seaDeep }}>
      <Series>
        <Series.Sequence durationInFrames={95}>
          <TitleCard />
        </Series.Sequence>
        <Series.Sequence durationInFrames={610}>
          <BlockadeMap />
        </Series.Sequence>
      </Series>
    </AbsoluteFill>
  );
};

export const DURATION = 95 + 610;
