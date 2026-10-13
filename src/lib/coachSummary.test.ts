import { afterEach, describe, expect, it, vi } from "vitest"
import { CoachSummaryError, coachMessages, coachReply, fetchCoachSummary, type ScoredResult } from "@/lib/coachSummary"

const result: ScoredResult = {
  status: "scored",
  overall: 86,
  keyLabel: "A major",
  duration: 12.4,
  voicedSeconds: 8.2,
  contour: [],
  notes: [],
  series: {
    intonation: [],
    stability: [],
    tone: [],
    dynamics: [],
    phrases: [],
    notes: [],
  },
  dimensions: [
    { id: "intonation", label: "Intonation", score: 92, detail: "92% of pitched frames sit within 30 cents." },
    { id: "stability", label: "Stability", score: 88, detail: "Pitch spread on held notes is 18 cents." },
    { id: "tone", label: "Tone", score: 84, detail: "Harmonic-to-noise ratio is 14 dB." },
    { id: "dynamics", label: "Dynamics", score: 80, detail: "The voiced range is 9.0 dB." },
    { id: "phrasing", label: "Phrasing", score: 71, detail: "Median phrase length is 2.4 seconds." },
  ],
}

describe("coachMessages", () => {
  it("asks for praise first and a small suggestion last, in English", () => {
    const [system, user] = coachMessages(result, "en")
    expect(system.role).toBe("system")
    expect(system.content).toContain("commends the singing")
    expect(system.content).toContain("minor suggestions")
    expect(system.content).toContain("English")
    expect(user.content).toContain("Overall: 86/100")
    expect(user.content).toContain("Intonation: 92/100")
    expect(user.content).toContain("Phrasing: 71/100")
    expect(user.content).toContain("Strongest criterion: Intonation")
    expect(user.content).toContain("Softest criterion: Phrasing")
    expect(user.content.indexOf("Intonation: 92")).toBeLessThan(user.content.indexOf("Phrasing: 71"))
  })

  it("asks for Simplified Chinese when that is the chosen language", () => {
    const [system, user] = coachMessages(
      {
        ...result,
        dimensions: result.dimensions.map((dimension) =>
          dimension.id === "intonation" ? { ...dimension, label: "音准" } : dimension,
        ),
      },
      "zh",
    )
    expect(system.content).toContain("Simplified Chinese")
    expect(user.content).toContain("Write the note in Simplified Chinese only.")
    expect(user.content).toContain("音准: 92/100")
  })
})

function reply(note: string, status = 200): Response {
  return new Response(JSON.stringify({ choices: [{ message: { content: note } }] }), {
    status,
    headers: { "Content-Type": "application/json" },
  })
}

function mockFetch(body: string) {
  return vi.fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>(async () => reply(body))
}

function requestBody(fetchMock: ReturnType<typeof mockFetch>): { messages: Array<{ content: string }> } {
  const init = fetchMock.mock.calls[0]?.[1]
  expect(init).toBeDefined()
  return JSON.parse(String(init?.body)) as { messages: Array<{ content: string }> }
}

describe("fetchCoachSummary", () => {
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
  })

  it("sends an English praise-first prompt and returns the note", async () => {
    vi.stubEnv("VITE_LSIT_API_KEY", "test-key")
    const fetchMock = mockFetch("The tone stayed clear. Try a slightly longer line next.")
    vi.stubGlobal("fetch", fetchMock)

    const note = await fetchCoachSummary({ ...result, overall: 81 }, "en")

    expect(note).toBe("The tone stayed clear. Try a slightly longer line next.")
    expect(fetchMock.mock.calls[0]?.[0]).toBe("https://api.ai.college.ucsb.edu/v1/chat/completions")
    const init = fetchMock.mock.calls[0]?.[1]
    expect(init?.method).toBe("POST")
    expect(new Headers(init?.headers).get("Authorization")).toBe("Bearer test-key")
    const body = requestBody(fetchMock)
    expect(body.messages[0]?.content).toContain("English")
    expect(body.messages[0]?.content).toContain("commends the singing")
    expect(body.messages[1]?.content).toContain("Overall: 81/100")
  })

  it("sends a Simplified Chinese prompt and returns the note", async () => {
    vi.stubEnv("VITE_LSIT_API_KEY", "test-key")
    const fetchMock = mockFetch("乐句很清楚。最后可以把持续音再稳住一点。")
    vi.stubGlobal("fetch", fetchMock)

    const note = await fetchCoachSummary(
      {
        ...result,
        overall: 82,
        dimensions: result.dimensions.map((dimension) =>
          dimension.id === "intonation" ? { ...dimension, label: "音准" } : dimension,
        ),
      },
      "zh",
    )

    expect(note).toBe("乐句很清楚。最后可以把持续音再稳住一点。")
    const body = requestBody(fetchMock)
    expect(body.messages[0]?.content).toContain("Simplified Chinese")
    expect(body.messages[1]?.content).toContain("Write the note in Simplified Chinese only.")
    expect(body.messages[1]?.content).toContain("音准: 92/100")
  })

  it("reports a missing key without calling the API", async () => {
    vi.stubEnv("VITE_LSIT_API_KEY", "")
    const fetchMock = vi.fn()
    vi.stubGlobal("fetch", fetchMock)

    await expect(fetchCoachSummary({ ...result, overall: 11 }, "en")).rejects.toBeInstanceOf(CoachSummaryError)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it("reports a failed request", async () => {
    vi.stubEnv("VITE_LSIT_API_KEY", "test-key")
    vi.stubGlobal("fetch", vi.fn(async () => new Response("nope", { status: 503 })))

    await expect(fetchCoachSummary({ ...result, overall: 12 }, "zh")).rejects.toMatchObject({ code: "failed" })
  })
})

describe("coachReply", () => {
  it("reads the assistant text", () => {
    expect(
      coachReply({
        choices: [{ message: { content: "  The tone stayed clear.  " } }],
      }),
    ).toBe("The tone stayed clear.")
  })

  it("rejects an empty reply", () => {
    expect(coachReply({ choices: [{ message: { content: "   " } }] })).toBeNull()
    expect(coachReply({})).toBeNull()
  })
})
