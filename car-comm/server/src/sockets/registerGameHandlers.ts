import type { Server, Socket } from "socket.io";
import type {
  ClientToServerEvents,
  InterServerEvents,
  ServerToClientEvents,
  SocketData,
} from "../protocol/events.js";
import { SessionManager } from "../sessions/SessionManager.js";
import { TriviaGame } from "../game/TriviaGame.js";
import { config } from "../config.js";

type IOServer = Server<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>;
type IOSocket = Socket<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>;

// Keyed by session code. Module-level so it's shared across every socket
// connection handled by this process (registerGameHandlers is called once
// per connected socket, but the timers belong to the session, not a socket).
const roundTimers = new Map<string, NodeJS.Timeout>();

function clearRoundTimer(code: string): void {
  const timer = roundTimers.get(code);
  if (timer) {
    clearTimeout(timer);
    roundTimers.delete(code);
  }
}

export function registerGameHandlers(io: IOServer, socket: IOSocket, sessions: SessionManager): void {
  socket.on("start-game", ({ code }) => {
    const session = sessions.getSessionByCode(code);
    if (!session) return;

    const participantIds = [...session.participants.keys()];
    if (participantIds.length < config.maxParticipants) {
      socket.emit("error", { code: "NOT_ENOUGH_PLAYERS", message: "Waiting for the other car to join" });
      return;
    }

    session.game = new TriviaGame(participantIds);
    session.touch();
    io.to(code).emit("game-question", session.game.currentQuestionPayload());
    armRoundTimer(io, sessions, code);
  });

  socket.on("game-answer", ({ code, questionId, choiceIndex }) => {
    const clientId = socket.data.clientId;
    const session = sessions.getSessionByCode(code);
    if (!clientId || !session?.game) return;

    // Ignore answers for a question that has already been resolved/advanced past.
    if (session.game.currentQuestionPayload().questionId !== questionId) return;

    const recorded = session.game.recordAnswer(clientId, choiceIndex);
    if (!recorded) return;
    session.touch();

    if (session.game.haveAllAnswered()) {
      clearRoundTimer(code);
      resolveAndAdvance(io, sessions, code);
    }
  });
}

function armRoundTimer(io: IOServer, sessions: SessionManager, code: string): void {
  clearRoundTimer(code);
  const timer = setTimeout(() => resolveAndAdvance(io, sessions, code), config.answerWindowMs);
  timer.unref?.();
  roundTimers.set(code, timer);
}

function resolveAndAdvance(io: IOServer, sessions: SessionManager, code: string): void {
  const session = sessions.getSessionByCode(code);
  if (!session?.game) return;

  const result = session.game.resolveRound();
  io.to(code).emit("game-result", result);

  const next = session.game.nextQuestion();
  if (!next) {
    clearRoundTimer(code);
    io.to(code).emit("game-over", { finalScores: session.game.getScores() });
    session.game = null;
    return;
  }

  // Brief pause so both phones can show the reveal before the next question.
  const timer = setTimeout(() => {
    io.to(code).emit("game-question", next);
    armRoundTimer(io, sessions, code);
  }, config.gameResultPauseMs);
  timer.unref?.();
  roundTimers.set(code, timer);
}
