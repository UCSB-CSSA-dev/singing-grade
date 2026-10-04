import { normalizeSamples, trimLeadingSilence } from "@/lib/audio/level"
import type { Take } from "@/lib/audio/types"

export type RecorderHandle = {
  analyser: AnalyserNode
  setGain: (gain: number) => void
  discard: () => void
  stop: () => Take
  close: () => void
}

export type MicTestHandle = {
  analyser: AnalyserNode
  setGain: (gain: number) => void
  stop: () => Take
  close: () => void
}

export function isMicDenied(error: unknown): boolean {
  return (
    error instanceof DOMException &&
    (error.name === "NotAllowedError" ||
      error.name === "PermissionDeniedError" ||
      error.name === "SecurityError")
  )
}

const MIC_CONSTRAINTS: MediaTrackConstraints = {
  echoCancellation: false,
  noiseSuppression: false,
  autoGainControl: false,
  channelCount: { ideal: 1 },
}

async function openMic(gain: number): Promise<{
  audioContext: AudioContext
  inputGain: GainNode
  analyser: AnalyserNode
  chunks: Float32Array[]
  release: () => void
}> {
  const audioContext = new AudioContext({ latencyHint: "interactive" })
  // Chrome inserts silence for however long this clock runs before the mic
  // is connected. Opening the device can take a few seconds, so hold the clock.
  const holdClock = audioContext.suspend()
  let stream: MediaStream
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: MIC_CONSTRAINTS })
    await holdClock
  } catch (error) {
    void holdClock.catch(() => undefined)
    void audioContext.close()
    throw error
  }

  try {
    await audioContext.audioWorklet.addModule(`${import.meta.env.BASE_URL}pcm-processor.js`)
  } catch (error) {
    for (const track of stream.getTracks()) track.stop()
    void audioContext.close()
    throw error
  }

  const source = audioContext.createMediaStreamSource(stream)
  const inputGain = audioContext.createGain()
  inputGain.gain.value = gain
  const analyser = audioContext.createAnalyser()
  analyser.fftSize = 2048
  analyser.smoothingTimeConstant = 0.75

  const worklet = new AudioWorkletNode(audioContext, "pcm-processor")
  const chunks: Float32Array[] = []
  worklet.port.onmessage = (event: MessageEvent<Float32Array>) => {
    chunks.push(new Float32Array(event.data))
  }

  const mute = audioContext.createGain()
  mute.gain.value = 0
  source.connect(inputGain)
  inputGain.connect(analyser)
  inputGain.connect(worklet)
  worklet.connect(mute)
  mute.connect(audioContext.destination)
  try {
    await audioContext.resume()
  } catch (error) {
    for (const track of stream.getTracks()) track.stop()
    void audioContext.close()
    throw error
  }

  let closed = false
  const release = () => {
    if (closed) return
    closed = true
    source.disconnect()
    worklet.disconnect()
    worklet.port.onmessage = null
    for (const track of stream.getTracks()) track.stop()
    void audioContext.close()
  }

  return { audioContext, inputGain, analyser, chunks, release }
}

function takeFrom(chunks: Float32Array[], sampleRate: number, normalize: boolean): Take {
  const length = chunks.reduce((total, chunk) => total + chunk.length, 0)
  const samples = new Float32Array(length)
  let offset = 0
  for (const chunk of chunks) {
    samples.set(chunk, offset)
    offset += chunk.length
  }
  const audible = trimLeadingSilence(samples)
  return { samples: normalize ? normalizeSamples(audible) : audible, sampleRate }
}

export async function startRecorder(gain = 4): Promise<RecorderHandle> {
  const mic = await openMic(gain)
  return {
    analyser: mic.analyser,
    setGain(next) {
      mic.inputGain.gain.value = next
    },
    discard() {
      mic.chunks.length = 0
    },
    stop() {
      const sampleRate = mic.audioContext.sampleRate
      const chunks = mic.chunks
      mic.release()
      return takeFrom(chunks, sampleRate, true)
    },
    close: mic.release,
  }
}

export async function startMicTest(gain: number): Promise<MicTestHandle> {
  const mic = await openMic(gain)
  return {
    analyser: mic.analyser,
    setGain(next) {
      mic.inputGain.gain.value = next
    },
    stop() {
      const sampleRate = mic.audioContext.sampleRate
      const chunks = mic.chunks
      mic.release()
      return takeFrom(chunks, sampleRate, false)
    },
    close: mic.release,
  }
}
