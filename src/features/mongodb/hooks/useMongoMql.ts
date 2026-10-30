import { useMutation } from "@tanstack/react-query";
import { queryService } from "@/services/bridge/query";
import type {
  MongoMqlExecuteRequest,
  MongoMqlExecuteResult,
  MongoExplainRequest,
  MongoExplainResult,
} from "../types";

export function useExecuteMql(dbId: string) {
  return useMutation<MongoMqlExecuteResult, Error, Omit<MongoMqlExecuteRequest, "dbId">>({
    mutationFn: (req) => queryService.executeMql({ ...req, dbId }),
  });
}

export function useExplainMql(dbId: string) {
  return useMutation<MongoExplainResult, Error, Omit<MongoExplainRequest, "dbId">>({
    mutationFn: (req) => queryService.explainMql({ ...req, dbId }),
  });
}
