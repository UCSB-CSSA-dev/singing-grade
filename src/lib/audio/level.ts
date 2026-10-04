const TARGET_PEAK = 0.9
const MAX_GAIN = 24

export function peakOf(samples: Float32Array): number {
  let peak = 0
  for (let i = 0; i < samples.length; i++) {
    const amplitude = Math.abs(samples[i] ?? 0)
    if (amplitude > peak) peak = amplitude
  }
  return peak
}

export function trimLeadingSilence(samples: Float32Array): Float32Array {
  const threshold = 1e-4
  const run = 128
  let start = 0
  while (start + run < samples.length) {
    let audible = false
    for (let i = 0; i < run; i++) {
      if (Math.abs(samples[start + i] ?? 0) > threshold) {
        audible = true
        break
      }
    }
    if (audible) break
    start += run
  }
  if (start === 0 || start + run >= samples.length) return samples
  return samples.subarray(start)
}

export function normalizeSamples(samples: Float32Array): Float32Array {
  const peak = peakOf(samples)
  if (peak < 1e-5) return samples
  const gain = Math.min(MAX_GAIN, TARGET_PEAK / peak)
  if (gain < 1.05 && gain > 0.95) return samples
  const boosted = new Float32Array(samples.length)
  for (let i = 0; i < samples.length; i++) {
    const sample = (samples[i] ?? 0) * gain
    boosted[i] = Math.max(-1, Math.min(1, sample))
  }
  return boosted
}
