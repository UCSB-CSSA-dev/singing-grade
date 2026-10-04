import { describe, expect, it } from "vitest"
import { mixToMono } from "@/lib/audio/decode"

describe("mixToMono", () => {
  it("averages stereo channels into one", () => {
    const left = new Float32Array([0.2, -0.4])
    const right = new Float32Array([0.6, 0.2])
    const mono = mixToMono([left, right])
    expect(mono[0]).toBeCloseTo(0.4)
    expect(mono[1]).toBeCloseTo(-0.1)
  })

  it("returns an empty buffer when there are no channels", () => {
    expect(mixToMono([])).toHaveLength(0)
  })
})
