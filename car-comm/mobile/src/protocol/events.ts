// Mirrors server/src/protocol/events.ts. Kept as a manually-synced copy for
// this MVP; a shared workspace package is a reasonable follow-up cleanup.

export interface Participant {
  clientId: string;
  joinedAt: number;
}

export interface TriviaQuestionPayload {
  questionId: string;
  index: number;
  total: number;
  prompt: string;
  choices: string[];
  answerWindowMs: number;
}

export interface TriviaAnswerRecord {
  clientId: string;
  choiceIndex: number | null;
  correct: boolean;
}

export interface TriviaScore {
  clientId: string;
  score: number;
}

export interface GameResultPayload {
  questionId: string;
  correctIndex: number;
  answers: TriviaAnswerRecord[];
  scores: TriviaScore[];
}

export interface JoinAck {
  ok: true;
  sessionId: string;
  participants: Participant[];
  clientId: string;
}

export interface JoinAckError {
  ok: false;
  error: string;
}

export interface VoiceClipPayload {
  code: string;
  seq: number;
  mimeType: string;
  durationMs: number;
  data: ArrayBuffer;
}

export interface IncomingVoiceClip {
  senderId: string;
  seq: number;
  mimeType: string;
  durationMs: number;
  data: ArrayBuffer;
}

export interface ClientToServerEvents {
  "create-session": (
    ack: (res: { code: string; sessionId: string; clientId: string }) => void
  ) => void;
  "join-session": (payload: { code: string }, ack: (res: JoinAck | JoinAckError) => void) => void;
  "rejoin-session": (
    payload: { code: string; clientId: string },
    ack: (res: JoinAck | JoinAckError) => void
  ) => void;
  "leave-session": (payload: { code: string }) => void;
  "voice-clip": (payload: VoiceClipPayload) => void;
  "start-game": (payload: { code: string }) => void;
  "game-answer": (payload: {
    code: string;
    questionId: string;
    choiceIndex: number;
    answeredAtMs: number;
  }) => void;
}

export interface ServerToClientEvents {
  "session-joined": (payload: { code: string; participants: Participant[]; you: string }) => void;
  "peer-left": (payload: { clientId: string }) => void;
  "session-ended": (payload: { reason: string }) => void;
  "voice-clip": (payload: IncomingVoiceClip) => void;
  "game-question": (payload: TriviaQuestionPayload) => void;
  "game-result": (payload: {
    questionId: string;
    correctIndex: number;
    answers: TriviaAnswerRecord[];
    scores: TriviaScore[];
  }) => void;
  "game-over": (payload: { finalScores: TriviaScore[] }) => void;
  error: (payload: { code: string; message: string }) => void;
}
