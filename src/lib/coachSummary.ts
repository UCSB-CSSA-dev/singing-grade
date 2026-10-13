import type { AnalysisResult } from "@/lib/audio/types"
import type { Locale } from "@/lib/i18n"

const ENDPOINT = "https://api.ai.college.ucsb.edu/v1/chat/completions"
const MODEL = "gemma-4-26b-a4b-it"

export type ScoredResult = Extract<AnalysisResult, { status: "scored" }>

type ChatMessage = {
  role: "system" | "user"
  content: string
}

const LANGUAGE: Record<Locale, string> = {
  en: "English",
  zh: "Simplified Chinese",
}

export function coachMessages(result: ScoredResult, locale: Locale): ChatMessage[] {
  const language = LANGUAGE[locale]
  const ranked = [...result.dimensions].sort((a, b) => b.score - a.score)
  const strongest = ranked[0]
  const softest = ranked[ranked.length - 1]
  const lines = ranked.map((dimension) => `- ${dimension.label}: ${dimension.score}/100. ${dimension.detail}`)

  return [
    {
      role: "system",
      content: [
        "You write a short note from a vocal coach to a singer who just received a technique score.",
        "You did not hear the recording. Use only the measurements in the user message.",
        "How to write:",
        "- Most of the note commends the singing. Open with what went well, and stay with praise for at least two sentences.",
        "- Be specific. Tie the praise to the stronger criteria and their detail text, so the note could only fit this take.",
        "- End with one or two minor suggestions, and only about the softer criteria. Offer each as a small next thing to try, in a warm tone.",
        "- If the softer scores are still high, suggest keeping that ease rather than inventing a problem.",
        "- Never scold. Do not use these words: bad, poor, weak, failed, wrong, unfortunately, disappointing.",
        "- Do not mention that you are an AI, a model, or that you lacked the audio.",
        "- Do not add a title, bullets, numbering, or markdown.",
        "- Write 3 to 5 sentences of plain prose.",
        `- Write only in ${language}. Do not mix in any other language.`,
      ].join("\n"),
    },
    {
      role: "user",
      content: [
        `Write the note in ${language} only.`,
        "Scores run from 0 to 100. Higher is better. 85 and above is excellent. 65 to 84 is solid. Below 65 is the only place for a gentle suggestion.",
        `Overall: ${result.overall}/100`,
        `Key: ${result.keyLabel}`,
        `Take length: ${result.duration.toFixed(1)} seconds. Pitched singing: ${result.voicedSeconds.toFixed(1)} seconds.`,
        "Criteria, strongest first:",
        ...lines,
        strongest ? `Strongest criterion: ${strongest.label} (${strongest.score})` : "",
        softest ? `Softest criterion: ${softest.label} (${softest.score})` : "",
        "Praise first. Put any suggestion in the final sentence or two.",
      ]
        .filter(Boolean)
        .join("\n"),
    },
  ]
}

export function coachReply(body: unknown): string | null {
  if (typeof body !== "object" || body === null || !("choices" in body)) return null
  const choices = body.choices
  if (!Array.isArray(choices) || choices.length === 0) return null
  const first: unknown = choices[0]
  if (typeof first !== "object" || first === null || !("message" in first)) return null
  const message = first.message
  if (typeof message !== "object" || message === null || !("content" in message)) return null
  const content = message.content
  if (typeof content !== "string") return null
  const text = content.trim()
  return text.length > 0 ? text : null
}

export class CoachSummaryError extends Error {
  readonly code: "missing-key" | "failed"

  constructor(code: "missing-key" | "failed") {
    super(code)
    this.name = "CoachSummaryError"
    this.code = code
  }
}

const cache = new Map<string, string>()

function cacheKey(result: ScoredResult, locale: Locale): string {
  const scores = result.dimensions.map((dimension) => `${dimension.id}:${dimension.score}`).join(",")
  return `${locale}:${result.overall}:${result.keyLabel}:${scores}`
}

export async function fetchCoachSummary(
  result: ScoredResult,
  locale: Locale,
  signal?: AbortSignal,
): Promise<string> {
  const key = cacheKey(result, locale)
  const cached = cache.get(key)
  if (cached) return cached

  const apiKey = import.meta.env.VITE_LSIT_API_KEY?.trim()
  if (!apiKey) throw new CoachSummaryError("missing-key")

  const response = await fetch(ENDPOINT, {
    method: "POST",
    signal,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: MODEL,
      temperature: 0.6,
      max_tokens: 400,
      messages: coachMessages(result, locale),
    }),
  })

  if (!response.ok) throw new CoachSummaryError("failed")
  const text = coachReply(await response.json())
  if (!text) throw new CoachSummaryError("failed")
  cache.set(key, text)
  return text
}
