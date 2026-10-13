/** @vitest-environment jsdom */

import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { ScoreReport } from "@/components/ScoreReport"
import type { ScoredResult } from "@/lib/coachSummary"
import type { AnalysisResult } from "@/lib/audio/types"
import { PreferencesProvider } from "@/lib/preferences"

const scored: ScoredResult = {
  status: "scored",
  overall: 90,
  keyLabel: "A major",
  duration: 3,
  voicedSeconds: 2.8,
  contour: [],
  notes: ["Intonation sits close to the key.", "Held notes stay steady."],
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
    { id: "dynamics", label: "Dynamics", score: 80, detail: "Voiced loudness spans 9.0 dB." },
    { id: "phrasing", label: "Phrasing", score: 96, detail: "1 phrases, median length 3.0s." },
  ],
}

function chineseResult(): ScoredResult {
  return {
    ...scored,
    overall: 91,
    keyLabel: "A 大调",
    notes: ["音准贴近调性。", "持续音很稳。"],
    dimensions: [
      { id: "intonation", label: "音准", score: 92, detail: "有音高的片段里，92% 落在 A 大调的 30 音分以内。" },
      { id: "stability", label: "稳定", score: 88, detail: "持续音的音高波动为 18 音分，共 1 个音。" },
      { id: "tone", label: "音色", score: 84, detail: "谐波噪声比为 14 分贝。" },
      { id: "dynamics", label: "力度", score: 80, detail: "有声部分的响度跨度为 9.0 分贝。" },
      { id: "phrasing", label: "乐句", score: 96, detail: "1 个乐句，中位长度 3.0 秒。" },
    ],
  }
}

function useLocale(locale: "en" | "zh") {
  localStorage.clear()
  if (locale === "zh") {
    localStorage.setItem(
      "singing-grade:settings",
      JSON.stringify({ locale: "zh", micGain: 4, liveMode: false }),
    )
  }
}

function mockCoach(note: string, status = 200) {
  vi.stubEnv("VITE_LSIT_API_KEY", status === 401 ? "" : "test-key")
  vi.stubGlobal(
    "fetch",
    vi.fn(async () =>
      status === 200
        ? new Response(JSON.stringify({ choices: [{ message: { content: note } }] }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          })
        : new Response("nope", { status }),
    ),
  )
}

function renderReport(result: AnalysisResult) {
  return render(
    <PreferencesProvider>
      <ScoreReport result={result} open onClose={() => undefined} />
    </PreferencesProvider>,
  )
}

describe("ScoreReport", () => {
  afterEach(() => {
    cleanup()
    localStorage.clear()
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
  })

  it("shows the English score, coach notes, and AI note", async () => {
    useLocale("en")
    mockCoach("The phrasing was lovely. Next time, let the held note rest a little longer.")
    renderReport(scored)

    expect(screen.getByRole("dialog", { name: "Performance report" })).toBeTruthy()
    expect(screen.getByLabelText("Overall score 90")).toBeTruthy()
    expect(screen.getByText("Excellent")).toBeTruthy()
    expect(screen.getByText("Intonation")).toBeTruthy()
    expect(screen.getByText("92% of pitched frames sit within 30 cents.")).toBeTruthy()
    expect(screen.getByText("Intonation sits close to the key.")).toBeTruthy()
    expect(screen.getByText("Coach notes")).toBeTruthy()
    expect(await screen.findByText("The phrasing was lovely. Next time, let the held note rest a little longer.")).toBeTruthy()
    expect(screen.getByText("A note for you")).toBeTruthy()
  })

  it("shows the Chinese score, coach notes, and AI note", async () => {
    useLocale("zh")
    mockCoach("乐句很清楚。最后可以把持续音再稳住一点。")
    renderReport(chineseResult())

    expect(screen.getByRole("dialog", { name: "演唱报告" })).toBeTruthy()
    expect(screen.getByLabelText("总分 91")).toBeTruthy()
    expect(screen.getByText("优秀")).toBeTruthy()
    expect(screen.getByText("音准")).toBeTruthy()
    expect(screen.getByText("有音高的片段里，92% 落在 A 大调的 30 音分以内。")).toBeTruthy()
    expect(screen.getByText("音准贴近调性。")).toBeTruthy()
    expect(screen.getByText("指导")).toBeTruthy()
    expect(await screen.findByText("乐句很清楚。最后可以把持续音再稳住一点。")).toBeTruthy()
    expect(screen.getByText("给你的话")).toBeTruthy()
    expect(document.documentElement.lang).toBe("zh-Hans")
  })

  it("explains a missing key in both languages", async () => {
    useLocale("en")
    mockCoach("", 401)
    renderReport({ ...scored, overall: 13 })
    expect(await screen.findByText("A short coach note appears here once an API key is set.")).toBeTruthy()

    cleanup()
    useLocale("zh")
    mockCoach("", 401)
    renderReport({ ...chineseResult(), overall: 14 })
    expect(await screen.findByText("设置 API 密钥后，这里会显示一段简短的指导。")).toBeTruthy()
  })

  it("explains a failed note in both languages", async () => {
    useLocale("en")
    mockCoach("", 503)
    renderReport({ ...scored, overall: 15 })
    expect(await screen.findByText("The note could not be written just now.")).toBeTruthy()

    cleanup()
    useLocale("zh")
    mockCoach("", 503)
    renderReport({ ...chineseResult(), overall: 16 })
    expect(await screen.findByText("这段话暂时没能写出来。")).toBeTruthy()
  })

  it("shows the not-enough message in English and Chinese", () => {
    useLocale("en")
    renderReport({
      status: "insufficient",
      message: "Not enough singing in this take. Hold a few clear notes for at least a second, then analyze again.",
      contour: [],
      duration: 3,
    })
    expect(screen.getByRole("dialog", { name: "Not enough singing" })).toBeTruthy()
    expect(screen.getByText("Not enough singing in this take. Hold a few clear notes for at least a second, then analyze again.")).toBeTruthy()

    cleanup()
    useLocale("zh")
    renderReport({
      status: "insufficient",
      message: "这段里唱得不够。请把几个音清楚地持续至少一秒，然后再分析。",
      contour: [],
      duration: 3,
    })
    expect(screen.getByRole("dialog", { name: "唱得不够" })).toBeTruthy()
    expect(screen.getByText("这段里唱得不够。请把几个音清楚地持续至少一秒，然后再分析。")).toBeTruthy()
  })
})
