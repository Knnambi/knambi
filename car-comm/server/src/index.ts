import { createServer } from "node:http";
import { Server } from "socket.io";
import type {
  ClientToServerEvents,
  InterServerEvents,
  ServerToClientEvents,
  SocketData,
} from "./protocol/events.js";
import { config } from "./config.js";
import { SessionManager } from "./sessions/SessionManager.js";
import { registerSessionHandlers } from "./sockets/registerSessionHandlers.js";
import { registerVoiceHandlers } from "./sockets/registerVoiceHandlers.js";
import { registerGameHandlers } from "./sockets/registerGameHandlers.js";

export function createApp() {
  const httpServer = createServer();
  const io = new Server<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>(
    httpServer,
    { cors: { origin: "*" } }
  );
  const sessions = new SessionManager();
  sessions.startSweeper();

  io.on("connection", (socket) => {
    registerSessionHandlers(io, socket, sessions);
    registerVoiceHandlers(io, socket, sessions);
    registerGameHandlers(io, socket, sessions);
  });

  return { httpServer, io, sessions };
}

const isMain = process.argv[1] && import.meta.url === `file://${process.argv[1]}`;
if (isMain) {
  const { httpServer } = createApp();
  httpServer.listen(config.port, () => {
    console.log(`car-comm relay server listening on :${config.port}`);
  });
}
