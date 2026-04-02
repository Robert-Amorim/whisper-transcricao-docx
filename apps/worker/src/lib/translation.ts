type TranslationSegmentInput = {
  segmentIndex: number;
  text: string;
};

type OpenAiTranslationOptions = {
  apiKey: string | null;
  baseUrl: string;
  model: string;
  targetLanguage: string;
  segments: TranslationSegmentInput[];
  timeoutMs: number;
  simulationMode: boolean;
};

function buildSimulationTranslation(
  targetLanguage: string,
  segments: TranslationSegmentInput[]
) {
  return segments.map((segment) => ({
    segmentIndex: segment.segmentIndex,
    text:
      targetLanguage.toLowerCase() === "pt-br"
        ? segment.text
        : `[${targetLanguage}] ${segment.text}`
  }));
}

function extractJsonObject(raw: string) {
  const trimmed = raw.trim();
  if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
    return trimmed;
  }

  const first = trimmed.indexOf("{");
  const last = trimmed.lastIndexOf("}");
  if (first >= 0 && last > first) {
    return trimmed.slice(first, last + 1);
  }

  throw new Error("OpenAI translation response did not contain a JSON object.");
}

export async function translateSegments(options: OpenAiTranslationOptions) {
  if (options.simulationMode || !options.apiKey) {
    return buildSimulationTranslation(options.targetLanguage, options.segments);
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeoutMs);

  try {
    const response = await fetch(`${options.baseUrl.replace(/\/+$/, "")}/chat/completions`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${options.apiKey}`
      },
      body: JSON.stringify({
        model: options.model,
        temperature: 0,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content:
              "You translate transcript segments. Return only JSON in the shape {\"translations\":[{\"segmentIndex\":number,\"text\":string}]}. Keep the same number of items, preserve meaning, preserve punctuation, and do not include explanations."
          },
          {
            role: "user",
            content: JSON.stringify({
              targetLanguage: options.targetLanguage,
              translations: options.segments
            })
          }
        ]
      }),
      signal: controller.signal
    });

    if (!response.ok) {
      throw new Error(`OpenAI translation request failed with status ${response.status}.`);
    }

    const payload = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const rawContent = payload.choices?.[0]?.message?.content;
    if (!rawContent) {
      throw new Error("OpenAI translation response was empty.");
    }

    const parsed = JSON.parse(extractJsonObject(rawContent)) as {
      translations?: Array<{ segmentIndex?: number; text?: string }>;
    };
    if (!Array.isArray(parsed.translations)) {
      throw new Error("OpenAI translation response did not include translations.");
    }

    const translated = parsed.translations
      .map((item) => ({
        segmentIndex: typeof item.segmentIndex === "number" ? item.segmentIndex : -1,
        text: typeof item.text === "string" ? item.text.trim() : ""
      }))
      .filter((item) => item.segmentIndex >= 0 && item.text.length > 0)
      .sort((a, b) => a.segmentIndex - b.segmentIndex);

    if (translated.length !== options.segments.length) {
      throw new Error("OpenAI translation response did not preserve the expected segment count.");
    }

    return translated;
  } finally {
    clearTimeout(timer);
  }
}
