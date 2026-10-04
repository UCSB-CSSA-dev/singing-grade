import { describe, expect, it } from "vitest"
import { pcmToSamples, samplesToPcm } from "@/lib/audio/takeStore"

describe("take storage codec", () => {
  it("round-trips a tone within one quantization step", () => {
    const samples = new Float32Array(1000)
    for (let i = 0; i < samples.length; i++) {
      samples[i] = 0.4 * Math.sin((2 * Math.PI * 440 * i) / 44100)
    }
    const restored = pcmToSamples(samplesToPcm(samples))
    for (let i = 0; i < samples.length; i++) {
      expect(Math.abs((restored[i] ?? 0) - (samples[i] ?? 0))).toBeLessThan(1 / 32767)
    }
  })
})
