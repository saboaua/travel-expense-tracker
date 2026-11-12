/**
 * Groq as the backup reader (server only). Used for receipts and grocery receipts when Gemini cannot answer in time
 * (busy, rate limited, retired model, no answer). Groq speaks the OpenAI chat format; a vision model reads the photo
 * and answers in JSON. Needs GROQ_API_KEY. Passports, visas and tickets are never sent to Groq.
 */

/** The vision model Groq lists today. Override with GROQ_MODEL, one name or several separated by commas (tried in order). */
export const GROQ_DEFAULT_MODEL = "qwen/qwen3.8-27b";
const ENDPOINT = "https://api.groq.com/openai/v1/chat/completions";

export const groqConfigured = () => !!process.env.GROQ_API_KEY;

export function groqModels(): string[] {
  const list = (process.env.GROQ_MODEL || "").split(",").map((m) => m.trim()).filter(Boolean);
  return (list.length ? list : [GROQ_DEFAULT_MODEL]).slice(0, 3);
}

/** Reasoning models write their thinking in <think> tags before the answer; only the answer is wanted. */
export function stripThinking(text: string): string {
  return text.replace(/<think>[\s\S]*?<\/think>/gi, "").replace(/^[\s\S]*<\/think>/i, "").trim();
}

export function groqBody(model: string, base64: string, mime: string, prompt: string, maxTokens: number) {
  return {
    model,
    messages: [{ role: "user", content: [{ type: "text", text: prompt }, { type: "image_url", image_url: { url: `data:${mime};base64,${base64}` } }] }],
    response_format: { type: "json_object" },
    temperature: 0,
    max_completion_tokens: Math.min(Math.max(maxTokens, 2048), 8192),
  };
}

type Answer = { choices?: { message?: { content?: string | null }; finish_reason?: string }[] };

export function readGroqAnswer(json: Answer): { text: string; cut: boolean } {
  const c = json.choices?.[0];
  return { text: stripThinking(c?.message?.content || ""), cut: c?.finish_reason === "length" };
}

const RETRY = new Set([400, 404, 413, 429, 500, 502, 503, 504]);

/**
 * Asks Groq to read the photo. Tries each configured model in turn when one is gone, busy or too slow, within `ms` in total.
 * Returns the answer text (the caller parses the JSON) or throws.
 */
export async function askGroq(
  image: { data: Uint8Array | ArrayBuffer; mime: string },
  prompt: string,
  maxTokens: number,
  ms: number,
): Promise<{ text: string; cut: boolean; model: string }> {
  const key = process.env.GROQ_API_KEY;
  if (!key) throw new Error("Groq is not configured");
  const base64 = Buffer.from(image.data instanceof ArrayBuffer ? new Uint8Array(image.data) : image.data).toString("base64");
  const started = Date.now();
  let last = "no answer";
  for (const model of groqModels()) {
    const left = ms - (Date.now() - started);
    if (left < 2500) break;
    let res: Response | null = null;
    try {
      res = await fetch(ENDPOINT, {
        method: "POST",
        headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
        body: JSON.stringify(groqBody(model, base64, image.mime, prompt, maxTokens)),
        signal: AbortSignal.timeout(left),
      });
    } catch (e) {
      last = e instanceof Error ? e.name : "error";
      continue;
    }
    if (res.ok) {
      const out = readGroqAnswer((await res.json().catch(() => ({}))) as Answer);
      if (out.text) return { ...out, model };
      last = "empty answer";
      continue;
    }
    last = `${res.status} ${(await res.text().catch(() => "")).replace(/\s+/g, " ").slice(0, 160)}`;
    if (!RETRY.has(res.status)) break; // a refused key will not get better with another model
  }
  throw new Error(`Groq request failed (${last})`);
}
