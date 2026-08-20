import AsyncStorage from "@react-native-async-storage/async-storage";
import { getSocket } from "./socket";
import type { JoinAck, JoinAckError, Participant } from "../protocol/events";

const STORAGE_KEY = "car-comm/last-session";

interface PersistedSession {
  code: string;
  clientId: string;
}

async function persistSession(session: PersistedSession): Promise<void> {
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(session));
}

export async function getPersistedSession(): Promise<PersistedSession | null> {
  const raw = await AsyncStorage.getItem(STORAGE_KEY);
  return raw ? (JSON.parse(raw) as PersistedSession) : null;
}

export async function clearPersistedSession(): Promise<void> {
  await AsyncStorage.removeItem(STORAGE_KEY);
}

export function createTrip(): Promise<{ code: string; sessionId: string; clientId: string }> {
  return new Promise((resolve) => {
    getSocket().emit("create-session", async (res) => {
      await persistSession({ code: res.code, clientId: res.clientId });
      resolve(res);
    });
  });
}

export function joinTrip(code: string): Promise<JoinAck | JoinAckError> {
  return new Promise((resolve) => {
    getSocket().emit("join-session", { code: code.toUpperCase() }, async (res) => {
      if (res.ok) await persistSession({ code: code.toUpperCase(), clientId: res.clientId });
      resolve(res);
    });
  });
}

/** Attempts to resume the last trip after an app restart/reconnect. Returns null if there was none, or it's no longer valid. */
export async function tryRejoin(): Promise<(JoinAck & { code: string }) | null> {
  const persisted = await getPersistedSession();
  if (!persisted) return null;

  return new Promise((resolve) => {
    getSocket().emit("rejoin-session", persisted, (res) => {
      if (res.ok) {
        resolve({ ...res, code: persisted.code });
      } else {
        clearPersistedSession().finally(() => resolve(null));
      }
    });
  });
}

export function leaveTrip(code: string): void {
  getSocket().emit("leave-session", { code });
  void clearPersistedSession();
}

export function onSessionJoined(cb: (payload: { code: string; participants: Participant[]; you: string }) => void): () => void {
  const socket = getSocket();
  socket.on("session-joined", cb);
  return () => socket.off("session-joined", cb);
}

export function onPeerLeft(cb: (payload: { clientId: string }) => void): () => void {
  const socket = getSocket();
  socket.on("peer-left", cb);
  return () => socket.off("peer-left", cb);
}
