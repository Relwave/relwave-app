import { useQuery } from "@tanstack/react-query";
import { startBridgeListeners, isBridgeReady } from "@/services/bridgeClient";

export function useBridgeQuery() {
  return useQuery({
    queryKey: ["bridge-ready"],
    queryFn: async () => {
      await startBridgeListeners();
      return isBridgeReady();
    },
    enabled: false, // bridgeInit triggers it manually
    retry: false,
    staleTime: Infinity,
  });
}
