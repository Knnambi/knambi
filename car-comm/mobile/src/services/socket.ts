import { io, type Socket } from "socket.io-client";
import { SERVER_URL } from "../config";
import type { ClientToServerEvents, ServerToClientEvents } from "../protocol/events";

// Socket.IO's client-side Socket<ListenEvents, EmitEvents> generic order is
// the reverse of the server's Socket<ClientToServerEvents, ServerToClientEvents>.
export type AppSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

let socket: AppSocket | null = null;

export function getSocket(): AppSocket {
  if (!socket) {
    socket = io(SERVER_URL, {
      transports: ["websocket"],
      autoConnect: true,
    });
  }
  return socket;
}
