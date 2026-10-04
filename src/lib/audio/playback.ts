import { normalizeSamples } from "@/lib/audio/level"
import type { Take } from "@/lib/audio/types"

export type PlaybackHandle = {
  context: AudioContext
  startedAt: number
  duration: number
  stop: () => void
}

export async function playRaw(take: Take, onEnded: () => void): Promise<PlaybackHandle> {
  return startBuffer(take.samples, take.sampleRate, onEnded, false)
}

export async function playTake(take: Take, onEnded: () => void): Promise<PlaybackHandle> {
  return startBuffer(take.samples, take.sampleRate, onEnded, true)
}

async function startBuffer(
  input: Float32Array,
  sampleRate: number,
  onEnded: () => void,
  normalize: boolean,
): Promise<PlaybackHandle> {
  const context = new AudioContext()
  await context.resume()
  const samples = normalize ? normalizeSamples(input) : input
  const buffer = context.createBuffer(1, Math.max(1, samples.length), sampleRate)
  buffer.getChannelData(0).set(samples)
  const source = context.createBufferSource()
  source.buffer = buffer
  source.connect(context.destination)

  let stopped = false
  const finish = () => {
    if (stopped) return
    stopped = true
    onEnded()
    void context.close()
  }
  source.onended = finish

  const startedAt = context.currentTime
  source.start()

  return {
    context,
    startedAt,
    duration: samples.length / sampleRate,
    stop() {
      source.onended = null
      try {
        source.stop()
      } catch {
        // The source already finished.
      }
      finish()
    },
  }
}
