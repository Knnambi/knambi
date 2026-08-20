import type { Server, Socket } from "socket.io";
import type {
  ClientToServerEvents,
  InterServerEvents,
  ServerToClientEvents,
  SocketData,
} from "../protocol/events.js";
import type { Session } from "../sessions/Session.js";
import { SessionManager } from "../sessions/SessionManager.js";

type IOServer = Server<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>;
type IOSocket = Socket<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>;

function notifyExistingPeers(io: IOServer, session: Session, joinerClientId: string): void {
  const participants = session.toParticipantList();
  for (const participant of session.participants.values()) {
    if (participant.clientId === joinerClientId || !participant.socketId) continue;
    io.to(participant.socketId).emit("session-joined", {
      code: session.code,
      participants,
      you: participant.clientId,
    });
  }
}

export function registerSessionHandlers(io: IOServer, socket: IOSocket, sessions: SessionManager): void {
  socket.on("create-session", (ack) => {
    const { session, clientId } = sessions.createSession(socket.id);
    socket.data.clientId = clientId;
    socket.join(session.code);
    ack({ code: session.code, sessionId: session.id, clientId });
  });

  socket.on("join-session", ({ code }, ack) => {
    const result = sessions.joinSession(code, socket.id);
    if (!result.ok) {
      ack({ ok: false, error: result.error });
      return;
    }
    const { session, clientId } = result;
    socket.data.clientId = clientId;
    socket.join(session.code);
    ack({ ok: true, sessionId: session.id, participants: session.toParticipantList(), clientId });
    notifyExistingPeers(io, session, clientId);
  });

  socket.on("rejoin-session", ({ code, clientId }, ack) => {
    const result = sessions.rejoinSession(code, clientId, socket.id);
    if (!result.ok) {
      ack({ ok: false, error: result.error });
      return;
    }
    const { session } = result;
    socket.data.clientId = clientId;
    socket.join(session.code);
    ack({ ok: true, sessionId: session.id, participants: session.toParticipantList(), clientId });
    notifyExistingPeers(io, session, clientId);
  });

  socket.on("leave-session", ({ code }) => {
    const clientId = socket.data.clientId;
    if (!clientId) return;
    sessions.leaveSession(code, clientId);
    socket.to(code).emit("peer-left", { clientId });
    socket.leave(code);
  });

  socket.on("disconnect", () => {
    const entry = sessions.handleDisconnect(socket.id);
    if (entry) {
      socket.to(entry.session.code).emit("peer-left", { clientId: entry.clientId });
    }
  });
}
