import { useCallback, useEffect, useRef, useState } from "react";
import { MonitoringSnapshot } from "@/features/database/types";
import { databaseService } from "@/services/bridge/database";

type StreamState = "idle" | "connecting" | "open" | "closed" | "error";

export function useMonitoringStream(dbId: string | undefined, enabled: boolean) {
    const [snapshot, setSnapshot] = useState<MonitoringSnapshot | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [state, setState] = useState<StreamState>("idle");
    const socketRef = useRef<WebSocket | null>(null);

    const closeSocket = useCallback(() => {
        socketRef.current?.close();
        socketRef.current = null;
    }, []);

    const refreshOnce = useCallback(async () => {
        if (!dbId || !enabled) return;
        const nextSnapshot = await databaseService.getMonitoringSnapshot(dbId);
        setSnapshot(nextSnapshot);
    }, [dbId, enabled]);

    useEffect(() => {
        if (!dbId || !enabled) {
            closeSocket();
            setState("idle");
            setSnapshot(null);
            setError(null);
            return;
        }

        let cancelled = false;
        setState("connecting");
        setError(null);

        databaseService
            .getMonitoringWebSocketInfo()
            .then(({ url, intervalMs }) => {
                if (cancelled) return;

                const wsUrl = new URL(url);
                wsUrl.searchParams.set("dbId", dbId);
                wsUrl.searchParams.set("intervalMs", String(intervalMs));

                const socket = new WebSocket(wsUrl.toString());
                socketRef.current = socket;

                socket.onopen = () => {
                    if (!cancelled) setState("open");
                };

                socket.onmessage = (event) => {
                    if (cancelled) return;

                    try {
                        const message = JSON.parse(event.data);
                        if (message.type === "snapshot") {
                            setSnapshot(message.data);
                            setError(null);
                        } else if (message.type === "error" || message.type === "unsupported") {
                            setError(message.message || "Monitoring stream error");
                        }
                    } catch (parseError: any) {
                        setError(parseError?.message || "Invalid monitoring stream payload");
                    }
                };

                socket.onerror = () => {
                    if (!cancelled) {
                        setState("error");
                        setError("Monitoring WebSocket connection failed");
                    }
                };

                socket.onclose = () => {
                    if (!cancelled) {
                        setState((current) => (current === "error" ? "error" : "closed"));
                    }
                };
            })
            .catch((wsError: any) => {
                if (!cancelled) {
                    setState("error");
                    setError(wsError?.message || "Failed to open monitoring WebSocket");
                }
            });

        return () => {
            cancelled = true;
            closeSocket();
        };
    }, [closeSocket, dbId, enabled]);

    return {
        snapshot,
        error,
        state,
        isConnecting: state === "connecting",
        isStreaming: state === "open",
        refreshOnce,
    };
}
