import { useEffect, useRef, useState } from "react";
import { io, type Socket } from "socket.io-client";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { getAccessToken } from "./api";
import { useAuth } from "./auth";

const TOPICS = [
  "sensor:reading",
  "excursion:updated",
  "incident:created",
  "incident:updated",
  "alert:created",
  "alert:updated",
  "shipment:updated",
  "batch:created",
  "product:created",
] as const;

/** Maps a realtime topic to the React Query roots that need revalidation. */
const TOPIC_ROOTS: Record<string, string[]> = {
  "sensor:reading": ["dashboard", "telemetry", "sensors", "analytics", "shipments"],
  "excursion:updated": ["dashboard", "incidents", "shipments", "analytics", "alerts"],
  "incident:created": ["dashboard", "incidents", "alerts", "shipments"],
  "incident:updated": ["dashboard", "incidents", "alerts"],
  "alert:created": ["dashboard", "alerts", "incidents"],
  "alert:updated": ["dashboard", "alerts", "incidents"],
  "shipment:updated": ["shipments", "dashboard", "analytics"],
  "batch:created": ["batches", "dashboard", "analytics"],
  "product:created": ["products", "dashboard"],
};

export type RealtimeStatus = "connecting" | "connected" | "offline";

/**
 * One authenticated socket per session. Events arrive only after the producing
 * database transaction has committed (transactional outbox), so invalidating
 * here can never surface uncommitted state.
 */
export function useRealtimeBridge(): RealtimeStatus {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<RealtimeStatus>("offline");
  const socketRef = useRef<Socket | null>(null);
  const dirty = useRef(new Set<string>());
  const seenEventIds = useRef(new Set<string>());
  const flushTimer = useRef<number | null>(null);

  useEffect(() => {
    if (!user) {
      setStatus("offline");
      return;
    }

    const token = getAccessToken();
    const socket = io({
      path: "/socket.io",
      withCredentials: true,
      transports: ["websocket", "polling"],
      auth: token ? { token } : {},
    });
    socketRef.current = socket;
    setStatus("connecting");

    const scheduleFlush = (topic: string) => {
      for (const root of TOPIC_ROOTS[topic] ?? []) dirty.current.add(root);
      if (flushTimer.current !== null) return;
      flushTimer.current = window.setTimeout(() => {
        flushTimer.current = null;
        const roots = [...dirty.current];
        dirty.current.clear();
        for (const root of roots) {
          void queryClient.invalidateQueries({ queryKey: [root] });
        }
      }, 1000);
    };

    const handlers = new Map<string, (payload: Record<string, unknown>) => void>();

    for (const topic of TOPICS) {
      handlers.set(topic, (payload) => {
        const eventId = typeof payload.eventId === "string" ? payload.eventId : null;
        if (eventId && seenEventIds.current.has(eventId)) return;
        if (eventId) {
          seenEventIds.current.add(eventId);
          if (seenEventIds.current.size > 500) {
            const oldest = seenEventIds.current.values().next().value;
            if (oldest) seenEventIds.current.delete(oldest);
          }
        }
        scheduleFlush(topic);
        if (topic === "incident:created") {
          toast.error("Critical incident opened", {
            description: `Incident ${String(payload.code ?? "")} has been escalated for review.`,
          });
        }
        if (topic === "excursion:updated" && payload.status === "RECOVERED") {
          toast.success("Temperature recovered", { description: "The excursion has returned to profile." });
        }
      });
    }

    socket.on("connect", () => {
      setStatus("connected");
      // Reconcile current API state after reconnect because events emitted
      // during the disconnection window are not replayed to this socket.
      const roots = new Set(Object.values(TOPIC_ROOTS).flat());
      for (const root of roots) void queryClient.invalidateQueries({ queryKey: [root] });
    });
    socket.on("disconnect", () => setStatus("connecting"));
    socket.on("connect_error", () => setStatus("offline"));
    for (const [topic, handler] of handlers) socket.on(topic, handler);

    return () => {
      if (flushTimer.current !== null) {
        window.clearTimeout(flushTimer.current);
        flushTimer.current = null;
      }
      for (const [topic, handler] of handlers) socket.off(topic, handler);
      socket.disconnect();
      socketRef.current = null;
      setStatus("offline");
    };
  }, [user, queryClient]);

  return status;
}
