import { AISettings, AIProviderName } from "../types/ai";
import { AIProvider, AIError } from "../ai/providers/types";
import { AnthropicProvider } from "../ai/providers/anthropic.provider";
import { OpenAIProvider } from "../ai/providers/openai.provider";
import { GeminiProvider } from "../ai/providers/gemini.provider";
import { GroqProvider } from "../ai/providers/groq.provider";
import { MistralProvider } from "../ai/providers/mistral.provider";
import { OllamaProvider } from "../ai/providers/ollama.provider";

/**
 * Factory — creates the correct provider from user settings.
 * Throws AIError("MISSING_API_KEY") if the required credential is absent.
 */
export class AIServiceImpl {
  /**
   * Resolve the active provider from the supplied settings.
   */
  resolveProvider(settings: AISettings): AIProvider {
    const provider = settings.defaultProvider;
    return this.createProvider(provider, settings);
  }

  private createProvider(name: AIProviderName, settings: AISettings): AIProvider {
    switch (name) {
      case "anthropic": {
        const key = settings.anthropicApiKey?.trim();
        if (!key) throw new AIError("MISSING_API_KEY", "anthropic", "Anthropic API key is not configured.");
        return new AnthropicProvider(key);
      }
      case "openai": {
        const key = settings.openaiApiKey?.trim();
        if (!key) throw new AIError("MISSING_API_KEY", "openai", "OpenAI API key is not configured.");
        return new OpenAIProvider(key);
      }
      case "gemini": {
        const key = settings.geminiApiKey?.trim();
        if (!key) throw new AIError("MISSING_API_KEY", "gemini", "Gemini API key is not configured.");
        return new GeminiProvider(key);
      }
      case "groq": {
        const key = settings.groqApiKey?.trim();
        if (!key) throw new AIError("MISSING_API_KEY", "groq", "Groq API key is not configured.");
        return new GroqProvider(key);
      }
      case "mistral": {
        const key = settings.mistralApiKey?.trim();
        if (!key) throw new AIError("MISSING_API_KEY", "mistral", "Mistral API key is not configured.");
        return new MistralProvider(key);
      }
      case "ollama": {
        return new OllamaProvider(settings.ollamaBaseUrl, settings.ollamaModel);
      }
      default: {
        throw new AIError("PROVIDER_UNAVAILABLE", name as string, `Unknown provider: ${name}`);
      }
    }
  }
}

export const aiImpl = new AIServiceImpl();
