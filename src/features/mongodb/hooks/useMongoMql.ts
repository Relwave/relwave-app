import { useState, useRef, useCallback } from "react";
import { useMutation } from "@tanstack/react-query";
import { queryService } from "@/services/bridge/query";
import type {
  MongoMqlExecuteRequest,
  MongoMqlExecuteResult,
  MongoExplainRequest,
  MongoExplainResult,
  MongoAggregateMqlResult,
} from "../types";

export function useExecuteMql(dbId: string) {
  const [isCancelled, setIsCancelled] = useState(false);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const activeSessionIdRef = useRef<string | null>(null);

  const cancelMql = useCallback(async () => {
    setIsCancelled(true);
    abortControllerRef.current?.abort();
    const sid = activeSessionIdRef.current;
    if (sid) {
      try {
        await queryService.cancelQuery(sid);
      } catch (err) {
        console.warn("Failed to cancel MQL operation on bridge:", err);
      }
    }
  }, []);

  const mutation = useMutation<MongoMqlExecuteResult, Error, Omit<MongoMqlExecuteRequest, "dbId">>({
    mutationFn: async (req) => {
      setIsCancelled(false);
      const sessionId =
        req.sessionId ||
        (typeof crypto !== "undefined" && crypto.randomUUID
          ? crypto.randomUUID()
          : `mql-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`);
      activeSessionIdRef.current = sessionId;
      setActiveSessionId(sessionId);

      const controller = new AbortController();
      abortControllerRef.current = controller;

      return queryService.executeMql({ ...req, dbId, sessionId });
    },
    onSettled: () => {
      abortControllerRef.current = null;
      activeSessionIdRef.current = null;
      setActiveSessionId(null);
    },
  });

  return {
    ...mutation,
    isCancelled,
    sessionId: activeSessionId,
    cancelMql,
    cancel: cancelMql,
  };
}

export function useExplainMql(dbId: string) {
  const [isCancelled, setIsCancelled] = useState(false);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const activeSessionIdRef = useRef<string | null>(null);

  const cancelMql = useCallback(async () => {
    setIsCancelled(true);
    abortControllerRef.current?.abort();
    const sid = activeSessionIdRef.current;
    if (sid) {
      try {
        await queryService.cancelQuery(sid);
      } catch (err) {
        console.warn("Failed to cancel explain operation on bridge:", err);
      }
    }
  }, []);

  const mutation = useMutation<MongoExplainResult, Error, Omit<MongoExplainRequest, "dbId">>({
    mutationFn: async (req) => {
      setIsCancelled(false);
      const sessionId =
        req.sessionId ||
        (typeof crypto !== "undefined" && crypto.randomUUID
          ? crypto.randomUUID()
          : `explain-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`);
      activeSessionIdRef.current = sessionId;
      setActiveSessionId(sessionId);

      const controller = new AbortController();
      abortControllerRef.current = controller;

      return queryService.explainMql({ ...req, dbId, sessionId });
    },
    onSettled: () => {
      abortControllerRef.current = null;
      activeSessionIdRef.current = null;
      setActiveSessionId(null);
    },
  });

  return {
    ...mutation,
    isCancelled,
    sessionId: activeSessionId,
    cancelMql,
    cancel: cancelMql,
  };
}

export function useRunAggregation(dbId: string) {
  return useMutation<
    MongoAggregateMqlResult,
    Error,
    {
      collection: string;
      pipeline: any[];
      options?: { maxTimeMS?: number; allowDiskUse?: boolean; batchSize?: number };
    }
  >({
    mutationFn: (req) => queryService.runAggregation({ ...req, dbId }),
  });
}
