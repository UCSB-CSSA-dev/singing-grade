import { describe, expect, it } from "vitest"
import { normalizeSamples, peakOf, trimLeadingSilence } from "@/lib/audio/level"

describe("normalizeSamples", () => {
  it("raises a quiet tone to a listenable peak", () => {
    const samples = new Float32Array(1000)
    for (let i = 0; i < samples.length; i++) {
      samples[i] = 0.04 * Math.sin((2 * Math.PI * i) / 50)
    }
    const boosted = normalizeSamples(samples)
    expect(peakOf(boosted)).toBeGreaterThan(0.85)
    expect(peakOf(boosted)).toBeLessThanOrEqual(0.91)
  })

  it("drops a digital-silence prefix and keeps the tone", () => {
    const samples = new Float32Array(400)
    for (let i = 256; i < samples.length; i++) samples[i] = 0.2
    const trimmed = trimLeadingSilence(samples)
    expect(trimmed.length).toBe(400 - 256)
    expect(trimmed[0]).toBeCloseTo(0.2)
  })

  it("does not amplify silence", () => {
    const samples = new Float32Array(100)
    expect(normalizeSamples(samples)).toBe(samples)
  })
})
