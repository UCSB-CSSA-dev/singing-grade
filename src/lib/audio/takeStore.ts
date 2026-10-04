import { normalizeSamples } from "@/lib/audio/level"
import type { Take } from "@/lib/audio/types"

const STORAGE_KEY = "singing-grade:last-take"
const MAX_PCM_BYTES = 3_200_000

type StoredTake = {
  sampleRate: number
  pcm: string
}

export function samplesToPcm(samples: Float32Array): Int16Array {
  const pcm = new Int16Array(samples.length)
  for (let i = 0; i < samples.length; i++) {
    const sample = Math.max(-1, Math.min(1, samples[i] ?? 0))
    pcm[i] = sample < 0 ? Math.round(sample * 0x8000) : Math.round(sample * 0x7fff)
  }
  return pcm
}

export function pcmToSamples(pcm: Int16Array): Float32Array {
  const samples = new Float32Array(pcm.length)
  for (let i = 0; i < pcm.length; i++) {
    const value = pcm[i] ?? 0
    samples[i] = value < 0 ? value / 0x8000 : value / 0x7fff
  }
  return samples
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = ""
  const chunkSize = 0x8000
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    const slice = bytes.subarray(offset, offset + chunkSize)
    binary += String.fromCharCode(...slice)
  }
  return btoa(binary)
}

function base64ToBytes(value: string): Uint8Array {
  const binary = atob(value)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i)
  }
  return bytes
}

export function saveTake(take: Take): void {
  if (typeof localStorage === "undefined") return
  const pcm = samplesToPcm(take.samples)
  const bytes = new Uint8Array(pcm.buffer, pcm.byteOffset, pcm.byteLength)
  if (bytes.byteLength === 0 || bytes.byteLength > MAX_PCM_BYTES) {
    localStorage.removeItem(STORAGE_KEY)
    return
  }
  const payload: StoredTake = {
    sampleRate: take.sampleRate,
    pcm: bytesToBase64(bytes),
  }
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload))
  } catch {
    // The browser quota is full. Playback still works for this session.
  }
}

export function loadTake(): Take | null {
  if (typeof localStorage === "undefined") return null
  const raw = localStorage.getItem(STORAGE_KEY)
  if (!raw) return null
  try {
    const stored = JSON.parse(raw) as StoredTake
    if (
      typeof stored.sampleRate !== "number" ||
      !Number.isFinite(stored.sampleRate) ||
      stored.sampleRate <= 0 ||
      typeof stored.pcm !== "string" ||
      stored.pcm.length === 0
    ) {
      return null
    }
    const bytes = base64ToBytes(stored.pcm)
    if (bytes.byteLength < 2 || bytes.byteLength % 2 !== 0) return null
    const pcm = new Int16Array(bytes.buffer, bytes.byteOffset, bytes.byteLength / 2)
    const samples = normalizeSamples(pcmToSamples(pcm))
    if (samples.length === 0) return null
    return { samples, sampleRate: stored.sampleRate }
  } catch {
    return null
  }
}
