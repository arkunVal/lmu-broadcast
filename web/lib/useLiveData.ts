"use client";

import type { RealtimeChannel } from "@supabase/supabase-js";
import { useEffect, useState } from "react";
import { getSupabase } from "./supabase";
import type { Snapshot } from "./types";

export type ConnectionState = "missing-config" | "connecting" | "subscribed" | "error";

export function useLiveData(room: string) {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [connection, setConnection] = useState<ConnectionState>("connecting");
  const [receivedAt, setReceivedAt] = useState<number | null>(null);
  const [packets, setPackets] = useState(0);

  useEffect(() => {
    const client = getSupabase();
    if (!client) {
      setConnection("missing-config");
      return;
    }
    if (!room) {
      setConnection("connecting");
      return;
    }

    setSnapshot(null);
    setPackets(0);
    setConnection("connecting");

    const channel: RealtimeChannel = client
      .channel(`lmu-${room}`)
      .on("broadcast", { event: "state" }, (msg) => {
        setSnapshot(msg.payload as Snapshot);
        setReceivedAt(Date.now());
        setPackets((n) => n + 1);
      })
      .subscribe((status) => {
        if (status === "SUBSCRIBED") setConnection("subscribed");
        else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") setConnection("error");
      });

    return () => {
      client.removeChannel(channel);
    };
  }, [room]);

  return { snapshot, connection, receivedAt, packets };
}
