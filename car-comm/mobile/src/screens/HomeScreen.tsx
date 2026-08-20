import { useEffect, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { createTrip, joinTrip, tryRejoin } from "../services/sessionService";
import type { Participant } from "../protocol/events";

interface Props {
  onEnteredTrip: (code: string, clientId: string, participants: Participant[]) => void;
}

export function HomeScreen({ onEnteredTrip }: Props) {
  const [codeInput, setCodeInput] = useState("");
  const [busy, setBusy] = useState<"none" | "creating" | "joining" | "resuming">("resuming");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    tryRejoin().then((resumed) => {
      if (cancelled) return;
      if (resumed) {
        onEnteredTrip(resumed.code, resumed.clientId, resumed.participants);
      } else {
        setBusy("none");
      }
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleCreate = async () => {
    setBusy("creating");
    setError(null);
    const res = await createTrip();
    onEnteredTrip(res.code, res.clientId, [{ clientId: res.clientId, joinedAt: Date.now() }]);
  };

  const handleJoin = async () => {
    if (codeInput.trim().length === 0) return;
    setBusy("joining");
    setError(null);
    const res = await joinTrip(codeInput.trim());
    if (res.ok) {
      onEnteredTrip(codeInput.trim().toUpperCase(), res.clientId, res.participants);
    } else {
      setError(res.error);
      setBusy("none");
    }
  };

  if (busy === "resuming") {
    return (
      <View style={styles.center}>
        <ActivityIndicator />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Car Comm</Text>
      <Text style={styles.subtitle}>Talk to the car ahead — no phone call needed.</Text>

      <TouchableOpacity style={styles.primaryButton} onPress={handleCreate} disabled={busy === "creating"}>
        <Text style={styles.primaryButtonText}>{busy === "creating" ? "Starting…" : "Start a Trip"}</Text>
      </TouchableOpacity>

      <Text style={styles.or}>or join a trip your friend started</Text>

      <TextInput
        style={styles.input}
        placeholder="Enter trip code"
        autoCapitalize="characters"
        autoCorrect={false}
        maxLength={5}
        value={codeInput}
        onChangeText={setCodeInput}
      />
      <TouchableOpacity style={styles.secondaryButton} onPress={handleJoin} disabled={busy === "joining"}>
        <Text style={styles.secondaryButtonText}>{busy === "joining" ? "Joining…" : "Join Trip"}</Text>
      </TouchableOpacity>

      {error && <Text style={styles.error}>{error}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 24,
    justifyContent: "center",
    gap: 12,
    backgroundColor: "#f9fafb",
  },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#f9fafb",
  },
  title: {
    fontSize: 32,
    fontWeight: "800",
    textAlign: "center",
    color: "#111827",
  },
  subtitle: {
    fontSize: 15,
    textAlign: "center",
    color: "#6b7280",
    marginBottom: 24,
  },
  primaryButton: {
    backgroundColor: "#2563eb",
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: "center",
  },
  primaryButtonText: {
    color: "#fff",
    fontSize: 17,
    fontWeight: "700",
  },
  or: {
    textAlign: "center",
    color: "#9ca3af",
    marginVertical: 16,
  },
  input: {
    borderWidth: 1,
    borderColor: "#d1d5db",
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 16,
    fontSize: 18,
    textAlign: "center",
    letterSpacing: 4,
    backgroundColor: "#fff",
  },
  secondaryButton: {
    borderWidth: 1,
    borderColor: "#2563eb",
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: "center",
    marginTop: 12,
  },
  secondaryButtonText: {
    color: "#2563eb",
    fontSize: 17,
    fontWeight: "700",
  },
  error: {
    color: "#dc2626",
    textAlign: "center",
    marginTop: 12,
  },
});
