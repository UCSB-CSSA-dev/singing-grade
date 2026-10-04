import { describe, expect, it } from "vitest"
import { analyzeSinging } from "@/lib/audio/analyze"

function sine(frequency: number, seconds: number, sampleRate: number): Float32Array {
  const length = Math.floor(seconds * sampleRate)
  const samples = new Float32Array(length)
  for (let i = 0; i < length; i++) {
    samples[i] = 0.4 * Math.sin((2 * Math.PI * frequency * i) / sampleRate)
  }
  return samples
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  if (sorted.length % 2 === 0) return (sorted[mid - 1]! + sorted[mid]!) / 2
  return sorted[mid]!
}

describe("analyzeSinging", () => {
  it("scores a steady 440 Hz tone near A4 with high intonation and stability", () => {
    const result = analyzeSinging(sine(440, 3, 44100), 44100)
    expect(result.status).toBe("scored")
    if (result.status !== "scored") return

    const pitches = result.contour.flatMap((frame) =>
      frame.hz == null ? [] : [frame.hz],
    )
    expect(pitches.length).toBeGreaterThan(20)
    const center = median(pitches)
    expect(center).toBeGreaterThan(430)
    expect(center).toBeLessThan(450)
    expect(result.keyLabel.startsWith("A ")).toBe(true)

    const intonation = result.dimensions.find((dimension) => dimension.id === "intonation")
    const stability = result.dimensions.find((dimension) => dimension.id === "stability")
    expect(intonation?.score).toBeGreaterThanOrEqual(85)
    expect(stability?.score).toBeGreaterThanOrEqual(85)
    expect(result.notes.length).toBeGreaterThan(0)
    expect(result.series.intonation.length).toBeGreaterThan(20)
    expect(Math.abs(median(result.series.intonation.map((point) => point.cents)))).toBeLessThan(15)
    expect(result.series.stability.length).toBeGreaterThan(0)
    expect(result.series.tone.length).toBeGreaterThan(0)
    expect(result.series.dynamics.length).toBeGreaterThan(0)
    expect(result.series.phrases.length).toBeGreaterThan(0)
    expect(result.series.notes.length).toBeGreaterThan(0)
    const note = result.series.notes[0]
    expect(note?.name.startsWith("A")).toBe(true)
    expect(Math.abs(note?.cents ?? 100)).toBeLessThan(20)
  })

  it("does not invent a score for silence", () => {
    const result = analyzeSinging(new Float32Array(44100 * 3), 44100)
    expect(result.status).toBe("insufficient")
    if (result.status !== "insufficient") return
    expect(result.message.toLowerCase()).toContain("not enough singing")
  })

  it("writes the insufficient message in Chinese", () => {
    const result = analyzeSinging(new Float32Array(44100 * 3), 44100, "zh")
    expect(result.status).toBe("insufficient")
    if (result.status !== "insufficient") return
    expect(result.message).toContain("唱得不够")
  })
})
