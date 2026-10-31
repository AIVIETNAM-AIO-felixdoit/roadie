export type ToolCall = {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
};

export type Message = {
  role: "system" | "user" | "assistant" | "tool";
  content: string | null;
  tool_calls?: ToolCall[];
  tool_call_id?: string;
};

type Provider = { name: string; url: string; key?: string; model: string };

const GEMINI_MODELS = "gemini-3.5-flash-lite,gemini-3.1-flash-lite,gemini-3.5-flash";

// Both providers speak the OpenAI chat format, so one client covers them.
// Models are tried in order, so a busy model falls through to the next one.
const providers = (): Provider[] =>
  [
    ...(process.env.GEMINI_MODEL || GEMINI_MODELS).split(",").map((model) => ({
      name: `gemini/${model.trim()}`,
      url: "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions",
      key: process.env.GEMINI_API_KEY,
      model: model.trim(),
    })),
    {
      name: "openrouter",
      url: "https://openrouter.ai/api/v1/chat/completions",
      key: process.env.OPENROUTER_API_KEY,
      model: process.env.OPENROUTER_MODEL || "nvidia/nemotron-3.5-lightning:free",
    },
  ].filter((provider) => provider.key);

export const hasLlm = () => providers().length > 0;

export async function chat(messages: Message[], tools: object[]): Promise<Message> {
  const failures: string[] = [];
  for (const provider of providers()) {
    try {
      const res = await fetch(provider.url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${provider.key}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ model: provider.model, messages, tools, tool_choice: "required" }),
        // OpenRouter's free models queue, so they get longer than Gemini.
        signal: AbortSignal.timeout(provider.name === "openrouter" ? 20000 : 8000),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const message = (await res.json()).choices?.[0]?.message;
      if (!message) throw new Error("empty response");
      return message;
    } catch (error) {
      failures.push(`${provider.name}: ${(error as Error).message}`);
    }
  }
  throw new Error(`All LLM providers failed (${failures.join("; ")})`);
}
