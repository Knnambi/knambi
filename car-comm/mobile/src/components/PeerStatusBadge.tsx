import { StyleSheet, Text, View } from "react-native";

interface Props {
  connected: boolean;
}

export function PeerStatusBadge({ connected }: Props) {
  return (
    <View style={[styles.badge, connected ? styles.connected : styles.waiting]}>
      <View style={[styles.dot, connected ? styles.dotConnected : styles.dotWaiting]} />
      <Text style={styles.text}>{connected ? "Other car connected" : "Waiting for the other car…"}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "center",
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 999,
  },
  connected: {
    backgroundColor: "#dcfce7",
  },
  waiting: {
    backgroundColor: "#fef9c3",
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 8,
  },
  dotConnected: {
    backgroundColor: "#16a34a",
  },
  dotWaiting: {
    backgroundColor: "#ca8a04",
  },
  text: {
    fontSize: 14,
    fontWeight: "500",
    color: "#1f2937",
  },
});
