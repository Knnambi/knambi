import { useState } from "react";
import { SafeAreaView, StyleSheet } from "react-native";
import { StatusBar } from "expo-status-bar";
import { HomeScreen } from "./src/screens/HomeScreen";
import { TripScreen } from "./src/screens/TripScreen";
import { GameScreen } from "./src/screens/GameScreen";
import type { Participant } from "./src/protocol/events";

interface TripState {
  code: string;
  clientId: string;
  participants: Participant[];
}

type View = "home" | "trip" | "game";

export default function App() {
  const [trip, setTrip] = useState<TripState | null>(null);
  const [view, setView] = useState<View>("home");

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar style="auto" />
      {view === "home" && (
        <HomeScreen
          onEnteredTrip={(code, clientId, participants) => {
            setTrip({ code, clientId, participants });
            setView("trip");
          }}
        />
      )}
      {view === "trip" && trip && (
        <TripScreen
          code={trip.code}
          clientId={trip.clientId}
          initialParticipants={trip.participants}
          onPlayGame={() => setView("game")}
          onEndTrip={() => {
            setTrip(null);
            setView("home");
          }}
        />
      )}
      {view === "game" && trip && (
        <GameScreen code={trip.code} clientId={trip.clientId} onExit={() => setView("trip")} />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: "#f9fafb",
  },
});
