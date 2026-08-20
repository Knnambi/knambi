import { useCallback, useEffect, useRef, useState } from "react";
import {
  createAudioPlayer,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  RecordingPresets,
  useAudioRecorder,
  useAudioRecorderState,
} from "expo-audio";
import { File, Paths } from "expo-file-system";
import { getSocket } from "./socket";
import type { IncomingVoiceClip } from "../protocol/events";

const MAX_CLIP_DURATION_MS = 60_000;

export interface IncomingClipInfo {
  senderId: string;
  seq: number;
  receivedAt: number;
}

/**
 * Push-to-talk: record → send the finished clip as bytes over the session
 * socket → the other car auto-plays it on arrival. Not real-time streaming.
 */
export function useVoiceMessaging(code: string | null) {
  const recorder = useAudioRecorder(RecordingPresets.LOW_QUALITY);
  const recorderState = useAudioRecorderState(recorder, 100);
  const seqRef = useRef(0);
  const [lastIncoming, setLastIncoming] = useState<IncomingClipInfo | null>(null);
  const [error, setError] = useState<string | null>(null);

  const stopTalking = useCallback(async () => {
    if (!code || !recorder.isRecording) return;
    await recorder.stop();
    const uri = recorder.uri;
    if (!uri) return;

    const durationMs = Math.round(recorderState.durationMillis);
    const bytes = await new File(uri).bytes();
    const data = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);

    seqRef.current += 1;
    getSocket().emit("voice-clip", {
      code,
      seq: seqRef.current,
      mimeType: "audio/m4a",
      durationMs,
      data,
    });
  }, [code, recorder, recorderState.durationMillis]);

  // Hard cap so a stuck press-and-hold can't record forever.
  useEffect(() => {
    if (!recorderState.isRecording) return;
    const timer = setTimeout(() => {
      void stopTalking();
    }, MAX_CLIP_DURATION_MS);
    return () => clearTimeout(timer);
  }, [recorderState.isRecording, stopTalking]);

  useEffect(() => {
    if (!code) return;
    const socket = getSocket();

    const onClip = async (clip: IncomingVoiceClip) => {
      try {
        const file = new File(Paths.cache, `incoming-${clip.senderId}-${clip.seq}.m4a`);
        if (file.exists) file.delete();
        file.create();
        file.write(new Uint8Array(clip.data));

        const player = createAudioPlayer(file.uri);
        const subscription = player.addListener("playbackStatusUpdate", (status) => {
          if (status.didJustFinish) {
            subscription.remove();
            player.remove();
            file.delete();
          }
        });
        player.play();
        setLastIncoming({ senderId: clip.senderId, seq: clip.seq, receivedAt: Date.now() });
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to play the incoming voice clip");
      }
    };

    socket.on("voice-clip", onClip);
    return () => {
      socket.off("voice-clip", onClip);
    };
  }, [code]);

  const startTalking = useCallback(async () => {
    setError(null);
    const permission = await requestRecordingPermissionsAsync();
    if (!permission.granted) {
      setError("Microphone permission is required to talk to the other car");
      return;
    }
    await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
    await recorder.prepareToRecordAsync();
    recorder.record();
  }, [recorder]);

  return {
    isRecording: recorderState.isRecording,
    lastIncoming,
    error,
    startTalking,
    stopTalking,
  };
}
