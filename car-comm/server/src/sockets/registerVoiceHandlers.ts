import type { Server, Socket } from "socket.io";
import type {
  ClientToServerEvents,
  InterServerEvents,
  ServerToClientEvents,
  SocketData,
} from "../protocol/events.js";
import { SessionManager } from "../sessions/SessionManager.js";
import { config } from "../config.js";

type IOServer = Server<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>;
type IOSocket = Socket<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>;

/** Pure relay: no persistence, no transcoding — just forwards the clip to the other car. */
export function registerVoiceHandlers(_io: IOServer, socket: IOSocket, sessions: SessionManager): void {
  socket.on("voice-clip", (payload) => {
    const clientId = socket.data.clientId;
    if (!clientId || !socket.rooms.has(payload.code)) {
      socket.emit("error", { code: "NOT_IN_SESSION", message: "Not a participant in this session" });
      return;
    }

    const session = sessions.getSessionByCode(payload.code);
    if (!session) {
      socket.emit("error", { code: "SESSION_NOT_FOUND", message: "Session no longer exists" });
      return;
    }

    if (payload.data.byteLength > config.maxVoiceClipBytes) {
      socket.emit("error", { code: "CLIP_TOO_LARGE", message: "Voice clip exceeds the size limit" });
      return;
    }

    session.touch();
    socket.to(payload.code).emit("voice-clip", {
      senderId: clientId,
      seq: payload.seq,
      mimeType: payload.mimeType,
      durationMs: payload.durationMs,
      data: payload.data,
    });
  });
}
