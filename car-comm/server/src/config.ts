export const config = {
  port: Number(process.env.PORT ?? 4000),
  sessionCodeLength: 5,
  maxParticipants: 2,
  disconnectGraceMs: 5 * 60 * 1000, // how long a slot is held after a socket drops
  sessionInactivityMs: 24 * 60 * 60 * 1000, // sweep sessions idle this long
  sweepIntervalMs: 60 * 1000,
  maxVoiceClipBytes: 2 * 1024 * 1024, // ~2MB, generous ceiling for a <=60s low-bitrate clip
  // Overridable via env so the e2e test can run a full round quickly instead
  // of waiting out realistic answer/pause windows.
  answerWindowMs: Number(process.env.ANSWER_WINDOW_MS ?? 15 * 1000),
  gameResultPauseMs: Number(process.env.GAME_RESULT_PAUSE_MS ?? 4 * 1000),
  questionsPerRound: Number(process.env.QUESTIONS_PER_ROUND ?? 8),
};
