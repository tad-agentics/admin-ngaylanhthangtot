/**
 * Prompt assembly for the prose engine: mustache-lite rendering over the
 * item's grounding data + few-shot turns + forced tool-use for
 * schema-shaped output.
 */

import { getPath } from "./prose-guards.ts";

export type ProseTemplate = {
  id: string;
  key: string;
  version: number;
  system_prompt: string;
  user_template: string;
  output_schema: Record<string, unknown>;
  few_shots: Array<{ input: unknown; output: unknown }>;
  guards: Record<string, unknown>;
  model: string;
  temperature: number;
  max_tokens: number;
};

/**
 * {{json data}} → pretty JSON of context.data; {{data.a.b}} → path lookup.
 * Context is always {data: input_data}.
 */
export function renderUserTemplate(tpl: string, inputData: unknown): string {
  const ctx = { data: inputData };
  return tpl
    .replaceAll(/\{\{\s*json\s+data\s*\}\}/gu, JSON.stringify(inputData, null, 2))
    .replaceAll(/\{\{\s*([\w.]+)\s*\}\}/gu, (_, path: string) => {
      const v = getPath(ctx, path);
      if (v == null) return "";
      return typeof v === "string" ? v : JSON.stringify(v);
    });
}

type Msg = { role: "user" | "assistant"; content: string };

/**
 * Few-shots as plain user/assistant JSON turns; the live item is the final
 * user turn with the tool forced. Few-shot `input` is stored as the full
 * render context ({data: …}) so we unwrap .data for rendering.
 */
export function buildMessages(t: ProseTemplate, inputData: unknown): Msg[] {
  const msgs: Msg[] = [];
  for (const shot of t.few_shots ?? []) {
    const shotData = getPath(shot.input, "data") ?? shot.input;
    msgs.push({ role: "user", content: renderUserTemplate(t.user_template, shotData) });
    msgs.push({ role: "assistant", content: JSON.stringify(shot.output, null, 2) });
  }
  msgs.push({ role: "user", content: renderUserTemplate(t.user_template, inputData) });
  return msgs;
}

const TOOL_NAME = "emit_prose";

export type AnthropicUsage = { input_tokens: number; output_tokens: number };

/** USD per MTok — used for the cost ledger and estimates. */
const PRICES: Record<string, { input: number; output: number }> = {
  "claude-sonnet-5": { input: 3, output: 15 },
  "claude-haiku-4-5-20251001": { input: 1, output: 5 },
};

/**
 * Sonnet 5 / Opus 4.7+ removed sampling params — sending temperature
 * returns a 400 ("`temperature` is deprecated for this model"). Only models on
 * this allowlist still accept it; everything else omits it and relies on
 * prompt-driven variety (the voice charter + phrase_frequency/similarity gates).
 */
const TEMPERATURE_SUPPORTED = [/^claude-haiku-4-5/u, /^claude-sonnet-4-/u, /^claude-opus-4-[0-6]/u];
function supportsTemperature(model: string): boolean {
  return TEMPERATURE_SUPPORTED.some((re) => re.test(model));
}

/**
 * Strict tool use guarantees the tool input validates against the schema
 * server-side (kills stringified arrays / <item>-tag malformations), but the
 * strict validator rejects numeric/length/array-count constraints — strip
 * them for the API call; our own schema + length gates still enforce them.
 */
const STRICT_UNSUPPORTED = new Set([
  "minItems", "maxItems", "minLength", "maxLength", "pattern",
  "minimum", "maximum", "multipleOf",
]);
export function stripForStrict(schema: unknown): unknown {
  if (Array.isArray(schema)) return schema.map(stripForStrict);
  if (schema && typeof schema === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(schema as Record<string, unknown>)) {
      if (STRICT_UNSUPPORTED.has(k)) continue;
      out[k] = stripForStrict(v);
    }
    return out;
  }
  return schema;
}
export function priceOf(model: string): { input: number; output: number } {
  return PRICES[model] ?? { input: 3, output: 15 };
}
export function costUsd(model: string, usage: AnthropicUsage): number {
  const p = priceOf(model);
  return (usage.input_tokens * p.input + usage.output_tokens * p.output) / 1_000_000;
}

export async function callAnthropic(
  t: ProseTemplate,
  inputData: unknown,
  extraInstruction?: string,
): Promise<{ output: unknown; usage: AnthropicUsage }> {
  const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
  if (!apiKey) {
    throw new Error("ANTHROPIC_API_KEY chưa được set trong Edge Function secrets");
  }
  const messages = buildMessages(t, inputData);
  if (extraInstruction) {
    messages[messages.length - 1] = {
      role: "user",
      content: `${messages[messages.length - 1].content}\n\nYÊU CẦU BỔ SUNG (từ người duyệt / gate tự động):\n${extraInstruction}`,
    };
  }

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: t.model,
      max_tokens: t.max_tokens,
      ...(supportsTemperature(t.model) ? { temperature: t.temperature } : {}),
      system: t.system_prompt,
      messages,
      tools: [
        {
          name: TOOL_NAME,
          description: "Trả về prose đã viết, đúng schema.",
          input_schema: stripForStrict(t.output_schema),
          strict: true,
        },
      ],
      tool_choice: { type: "tool", name: TOOL_NAME },
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Anthropic ${res.status}: ${body.slice(0, 400)}`);
  }
  const json = await res.json() as {
    content: Array<{ type: string; name?: string; input?: unknown }>;
    usage: AnthropicUsage;
  };
  const toolUse = json.content.find((c) => c.type === "tool_use" && c.name === TOOL_NAME);
  if (!toolUse?.input) throw new Error("Model không trả tool_use output");
  return { output: toolUse.input, usage: json.usage };
}

/** Token count via the free count_tokens endpoint (estimate step). */
export async function countTokens(t: ProseTemplate, inputData: unknown): Promise<number> {
  const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY chưa được set trong Edge Function secrets");
  const res = await fetch("https://api.anthropic.com/v1/messages/count_tokens", {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: t.model,
      system: t.system_prompt,
      messages: buildMessages(t, inputData),
      tools: [
        {
          name: TOOL_NAME,
          description: "Trả về prose đã viết.",
          input_schema: stripForStrict(t.output_schema),
          strict: true,
        },
      ],
    }),
  });
  if (!res.ok) throw new Error(`count_tokens ${res.status}: ${(await res.text()).slice(0, 300)}`);
  return ((await res.json()) as { input_tokens: number }).input_tokens;
}
