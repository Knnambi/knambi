// Shared Socket.IO event contract between server and mobile client.
// The mobile app keeps a manually-synced copy at mobile/src/protocol/events.ts.

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

// Client -> Server
export interface ClientToServerEvents {
  "create-session": (
    ack: (res: { code: string; sessionId: string; clientId: string }) => void
  ) => void;
  "join-session": (
    payload: { code: string },
    ack: (
      res:
        | { ok: true; sessionId: string; participants: Participant[]; clientId: string }
        | { ok: false; error: string }
    ) => void
  ) => void;
  "rejoin-session": (
    payload: { code: string; clientId: string },
    ack: (
      res:
        | { ok: true; sessionId: string; participants: Participant[]; clientId: string }
        | { ok: false; error: string }
    ) => void
  ) => void;
  "leave-session": (payload: { code: string }) => void;
  "voice-clip": (payload: {
    code: string;
    seq: number;
    mimeType: string;
    durationMs: number;
    data: ArrayBuffer;
  }) => void;
  "start-game": (payload: { code: string }) => void;
  "game-answer": (payload: {
    code: string;
    questionId: string;
    choiceIndex: number;
    answeredAtMs: number;
  }) => void;
}

// Server -> Client
export interface ServerToClientEvents {
  // Broadcast to everyone already in the room whenever the roster changes
  // because someone (re)joined. The joiner learns the roster from their own
  // join-session/rejoin-session ack instead, so this only fires for peers.
  "session-joined": (payload: {
    code: string;
    participants: Participant[];
    you: string;
  }) => void;
  "peer-left": (payload: { clientId: string }) => void;
  "session-ended": (payload: { reason: string }) => void;
  "voice-clip": (payload: {
    senderId: string;
    seq: number;
    mimeType: string;
    durationMs: number;
    data: ArrayBuffer;
  }) => void;
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

export interface InterServerEvents {}

export interface SocketData {
  clientId: string;
}
