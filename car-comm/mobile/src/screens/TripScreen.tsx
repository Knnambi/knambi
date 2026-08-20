import { useEffect, useState } from "react";
import { Share, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { PeerStatusBadge } from "../components/PeerStatusBadge";
import { PushToTalkButton } from "../components/PushToTalkButton";
import { onPeerLeft, onSessionJoined, leaveTrip } from "../services/sessionService";
import { useVoiceMessaging } from "../services/voiceService";
import type { Participant } from "../protocol/events";

interface Props {
  code: string;
  clientId: string;
  initialParticipants: Participant[];
  onPlayGame: () => void;
  onEndTrip: () => void;
}

export function TripScreen({ code, clientId, initialParticipants, onPlayGame, onEndTrip }: Props) {
  const [participants, setParticipants] = useState<Participant[]>(initialParticipants);
  const { isRecording, lastIncoming, error, startTalking, stopTalking } = useVoiceMessaging(code);

  useEffect(() => {
    const unsubJoined = onSessionJoined((payload) => {
      if (payload.code === code) setParticipants(payload.participants);
    });
    const unsubLeft = onPeerLeft(() => {
      setParticipants((prev) => prev.filter((p) => p.clientId === clientId));
    });
    return () => {
      unsubJoined();
      unsubLeft();
    };
  }, [code, clientId]);

  const connected = participants.length >= 2;

  const handleShare = () => {
    void Share.share({ message: `Join my trip on Car Comm — enter code ${code}` });
  };

  const handleEndTrip = () => {
    leaveTrip(code);
    onEndTrip();
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.codeLabel}>Trip code</Text>
        <Text style={styles.code}>{code}</Text>
        <TouchableOpacity onPress={handleShare}>
          <Text style={styles.shareLink}>Share code</Text>
        </TouchableOpacity>
      </View>

      <PeerStatusBadge connected={connected} />

      <View style={styles.talkArea}>
        <PushToTalkButton
          isRecording={isRecording}
          disabled={!connected}
          onPressIn={() => void startTalking()}
          onPressOut={() => void stopTalking()}
        />
        {lastIncoming && <Text style={styles.incoming}>Message received from the other car</Text>}
        {error && <Text style={styles.error}>{error}</Text>}
      </View>

      <TouchableOpacity style={styles.gameButton} onPress={onPlayGame} disabled={!connected}>
        <Text style={styles.gameButtonText}>Play road-trip trivia</Text>
      </TouchableOpacity>

      <TouchableOpacity style={styles.endButton} onPress={handleEndTrip}>
        <Text style={styles.endButtonText}>End Trip</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 24,
    backgroundColor: "#f9fafb",
    gap: 16,
  },
  header: {
    alignItems: "center",
    marginTop: 12,
  },
  codeLabel: {
    color: "#6b7280",
    fontSize: 13,
  },
  code: {
    fontSize: 36,
    fontWeight: "800",
    letterSpacing: 6,
    color: "#111827",
  },
  shareLink: {
    color: "#2563eb",
    marginTop: 4,
    fontSize: 14,
  },
  talkArea: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
  },
  incoming: {
    color: "#16a34a",
    fontWeight: "600",
  },
  error: {
    color: "#dc2626",
  },
  gameButton: {
    backgroundColor: "#111827",
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: "center",
  },
  gameButtonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "700",
  },
  endButton: {
    alignItems: "center",
    paddingVertical: 12,
  },
  endButtonText: {
    color: "#dc2626",
    fontSize: 15,
  },
});
