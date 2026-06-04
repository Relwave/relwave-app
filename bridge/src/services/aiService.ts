import { AIServiceImpl } from "./ai.impl";

// Re-export the AIService class for discoverability under services/
export class AIService extends AIServiceImpl {}

// Also provide a singleton instance for callers that prefer a shared object
export const aiService = new AIService();
