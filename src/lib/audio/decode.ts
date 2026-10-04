import { normalizeSamples, trimLeadingSilence } from "@/lib/audio/level"
import type { Take } from "@/lib/audio/types"

export function mixToMono(channels: Float32Array[]): Float32Array {
  const length = channels[0]?.length ?? 0
  const mono = new Float32Array(length)
  if (channels.length === 0 || length === 0) return mono
  const scale = 1 / channels.length
  for (const channel of channels) {
    for (let i = 0; i < length; i++) {
      mono[i] = (mono[i] ?? 0) + (channel[i] ?? 0) * scale
    }
  }
  return mono
}

export async function decodeAudioFile(file: File): Promise<Take> {
  const bytes = await file.arrayBuffer()
  if (bytes.byteLength === 0) throw new Error("Empty audio file")
  const context = new AudioContext()
  try {
    const buffer = await context.decodeAudioData(bytes)
    const channels = Array.from({ length: buffer.numberOfChannels }, (_, index) =>
      buffer.getChannelData(index),
    )
    const mixed = mixToMono(channels)
    return {
      samples: normalizeSamples(trimLeadingSilence(mixed)),
      sampleRate: buffer.sampleRate,
    }
  } finally {
    await context.close()
  }
}
