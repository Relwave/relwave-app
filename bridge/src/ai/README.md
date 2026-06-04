# AI Integration (Bridge)

This folder contains AI provider implementations and prompt templates used by the bridge.

Layout
- `providers/` — concrete provider adapters (OpenAI, Anthropic, Gemini, Mistral, Ollama, Groq). Implement the `AIProvider` interface in `providers/types.ts`.
- `prompts/` — prompt builders and parsers for schema analysis, query explanation and chart recommendation.

What moved
- The public RPC entry points and handler logic live under `src/handlers/aiHandlers.ts`.
- The service factory implementation was moved to `src/services/ai.impl.ts` and a shim `src/services/aiService.ts` exposes `AIService` and `aiService` for consistency with other bridge services.
- Shared AI types were moved to `src/types/ai.ts` and are re-exported from the central `src/types/index.ts`.

How to add a provider
1. Create a new file under `providers/` implementing the `AIProvider` interface.
2. Add the provider into `src/services/ai.impl.ts` in the `createProvider` switch.
3. Add any provider-specific configuration notes to this README.

Testing
- No tests currently exist for AI. To exercise the integration locally, use the frontend UI features that call `ai.*` RPC methods or create a test that uses the RPC registrar.

Notes
- Keep providers small and avoid direct network retries; the bridge surface should translate provider errors into `AIError` using `providers/types.ts`.
