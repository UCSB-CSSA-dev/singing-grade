import Pitchfinder from "pitchfinder"
import { translate, type Locale } from "@/lib/i18n"
import type {
  AnalysisResult,
  DimensionScore,
  NoteLevel,
  PitchFrame,
  ScoreSeries,
} from "@/lib/audio/types"

const ANALYSIS_RATE = 22050
const FRAME = 2048
const HOP = 512
const MIN_HZ = 70
const MAX_HZ = 1100
const SILENCE_DB = -50
const MIN_VOICED_SECONDS = 0.6

const MAJOR_PROFILE = [
  6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88,
]
const MINOR_PROFILE = [
  6.33, 2.68, 3.52, 5.38, 2.6, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17,
]
const MAJOR_DEGREES = [0, 2, 4, 5, 7, 9, 11]
const MINOR_DEGREES = [0, 2, 3, 5, 7, 8, 10]
const NOTE_NAMES = [
  "C",
  "C#",
  "D",
  "Eb",
  "E",
  "F",
  "F#",
  "G",
  "Ab",
  "A",
  "Bb",
  "B",
]

const WEIGHTS = {
  intonation: 0.3,
  stability: 0.2,
  tone: 0.2,
  dynamics: 0.15,
  phrasing: 0.15,
} as const

type FrameFeature = {
  time: number
  hz: number | null
  confidence: number
  rmsDb: number
  hnrDb: number | null
  flatness: number | null
}

type KeyEstimate = {
  tonic: number
  mode: "major" | "minor"
  label: string
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

function roundScore(value: number): number {
  return Math.round(clamp(value, 0, 100))
}

function liftScore(score: number): number {
  return roundScore(10 * Math.sqrt(Math.max(0, score)))
}

function median(values: number[]): number {
  if (values.length === 0) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  if (sorted.length % 2 === 0) {
    return (sorted[mid - 1]! + sorted[mid]!) / 2
  }
  return sorted[mid]!
}

function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const index = (sorted.length - 1) * p
  const low = Math.floor(index)
  const high = Math.ceil(index)
  if (low === high) return sorted[low]!
  const weight = index - low
  return sorted[low]! * (1 - weight) + sorted[high]! * weight
}

function hzToMidi(hz: number): number {
  return 69 + 12 * Math.log2(hz / 440)
}

function midiToHz(midi: number): number {
  return 440 * 2 ** ((midi - 69) / 12)
}

function noteName(midi: number): string {
  const rounded = Math.round(midi)
  const pitchClass = ((rounded % 12) + 12) % 12
  const octave = Math.floor(rounded / 12) - 1
  return `${NOTE_NAMES[pitchClass] ?? "C"}${octave}`
}

function resample(
  input: Float32Array,
  fromRate: number,
  toRate: number,
): Float32Array {
  if (fromRate === toRate) return input
  const ratio = fromRate / toRate
  const length = Math.max(1, Math.floor(input.length / ratio))
  const output = new Float32Array(length)
  const last = input.length - 1
  for (let i = 0; i < length; i++) {
    const position = i * ratio
    const left = Math.floor(position)
    const right = Math.min(left + 1, last)
    const mix = position - left
    output[i] = input[left]! * (1 - mix) + input[right]! * mix
  }
  return output
}

function rmsDb(frame: Float32Array): number {
  let energy = 0
  for (let i = 0; i < frame.length; i++) {
    const sample = frame[i]!
    energy += sample * sample
  }
  const rms = Math.sqrt(energy / frame.length)
  return 20 * Math.log10(Math.max(rms, 1e-8))
}

function autocorrelationAt(frame: Float32Array, lag: number): number {
  if (lag < 1 || lag >= frame.length) return 0
  let power = 0
  let correlation = 0
  const length = frame.length - lag
  for (let i = 0; i < length; i++) {
    const sample = frame[i]!
    power += sample * sample
    correlation += sample * frame[i + lag]!
  }
  if (power <= 1e-8) return 0
  return correlation / power
}

function fftMagnitudes(frame: Float32Array): Float32Array {
  const n = frame.length
  const re = new Float32Array(n)
  const im = new Float32Array(n)
  re.set(frame)

  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1
    for (; (j & bit) !== 0; bit >>= 1) j ^= bit
    j ^= bit
    if (i < j) {
      const real = re[i]!
      re[i] = re[j]!
      re[j] = real
      const imag = im[i]!
      im[i] = im[j]!
      im[j] = imag
    }
  }

  for (let length = 2; length <= n; length <<= 1) {
    const angle = (-2 * Math.PI) / length
    const wlenRe = Math.cos(angle)
    const wlenIm = Math.sin(angle)
    for (let start = 0; start < n; start += length) {
      let wRe = 1
      let wIm = 0
      const half = length >> 1
      for (let j = 0; j < half; j++) {
        const evenRe = re[start + j]!
        const evenIm = im[start + j]!
        const oddIndex = start + j + half
        const oddRe = re[oddIndex]! * wRe - im[oddIndex]! * wIm
        const oddIm = re[oddIndex]! * wIm + im[oddIndex]! * wRe
        re[start + j] = evenRe + oddRe
        im[start + j] = evenIm + oddIm
        re[oddIndex] = evenRe - oddRe
        im[oddIndex] = evenIm - oddIm
        const nextRe = wRe * wlenRe - wIm * wlenIm
        wIm = wRe * wlenIm + wIm * wlenRe
        wRe = nextRe
      }
    }
  }

  const magnitudes = new Float32Array(n >> 1)
  for (let i = 0; i < magnitudes.length; i++) {
    magnitudes[i] = Math.hypot(re[i]!, im[i]!)
  }
  return magnitudes
}

function spectralFlatness(magnitudes: Float32Array): number {
  let logSum = 0
  let sum = 0
  let count = 0
  for (let i = 1; i < magnitudes.length; i++) {
    const value = Math.max(magnitudes[i]!, 1e-12)
    logSum += Math.log(value)
    sum += value
    count += 1
  }
  if (count === 0 || sum <= 0) return 1
  return Math.exp(logSum / count) / (sum / count)
}

function pearson(left: number[], right: number[]): number {
  const length = left.length
  let meanLeft = 0
  let meanRight = 0
  for (let i = 0; i < length; i++) {
    meanLeft += left[i]!
    meanRight += right[i]!
  }
  meanLeft /= length
  meanRight /= length
  let numerator = 0
  let leftPower = 0
  let rightPower = 0
  for (let i = 0; i < length; i++) {
    const a = left[i]! - meanLeft
    const b = right[i]! - meanRight
    numerator += a * b
    leftPower += a * a
    rightPower += b * b
  }
  if (leftPower === 0 || rightPower === 0) return 0
  return numerator / Math.sqrt(leftPower * rightPower)
}

function rotateProfile(profile: number[], tonic: number): number[] {
  const rotated = new Array<number>(12).fill(0)
  for (let i = 0; i < 12; i++) {
    rotated[(i + tonic) % 12] = profile[i]!
  }
  return rotated
}

function estimateKey(frames: FrameFeature[], locale: Locale): KeyEstimate {
  const histogram = new Array<number>(12).fill(0)
  for (const frame of frames) {
    if (frame.hz == null) continue
    const pitchClass = ((Math.round(hzToMidi(frame.hz)) % 12) + 12) % 12
    histogram[pitchClass] = (histogram[pitchClass] ?? 0) + Math.max(frame.confidence, 0.2)
  }

  let bestScore = -Infinity
  let tonic = 0
  let mode: "major" | "minor" = "major"
  for (let candidate = 0; candidate < 12; candidate++) {
    const major = pearson(histogram, rotateProfile(MAJOR_PROFILE, candidate))
    const minor = pearson(histogram, rotateProfile(MINOR_PROFILE, candidate))
    if (major > bestScore) {
      bestScore = major
      tonic = candidate
      mode = "major"
    }
    if (minor > bestScore) {
      bestScore = minor
      tonic = candidate
      mode = "minor"
    }
  }

  const name = NOTE_NAMES[tonic] ?? "C"
  return {
    tonic,
    mode,
    label: translate(locale, mode === "major" ? "keyMajor" : "keyMinor", { name }),
  }
}

function nearestDegreeMidi(midi: number, key: KeyEstimate): number {
  const degrees = key.mode === "major" ? MAJOR_DEGREES : MINOR_DEGREES
  const base = Math.round(midi)
  let best = base
  let bestDistance = Infinity
  for (let candidate = base - 6; candidate <= base + 6; candidate++) {
    const pitchClass = ((candidate % 12) + 12) % 12
    const relative = (pitchClass - key.tonic + 12) % 12
    if (!degrees.includes(relative)) continue
    const distance = Math.abs(midi - candidate)
    if (distance < bestDistance) {
      bestDistance = distance
      best = candidate
    }
  }
  return best
}

function compareNotes(notes: HeldNote[], key: KeyEstimate): NoteLevel[] {
  return notes.map((note) => {
    const sungMidi = median(note.hzs.map(hzToMidi))
    const target = nearestDegreeMidi(sungMidi, key)
    return {
      start: note.start,
      end: note.end,
      name: noteName(target),
      cents: (sungMidi - target) * 100,
      sungHz: midiToHz(sungMidi),
      targetHz: midiToHz(target),
    }
  })
}

function centsToScale(hz: number, key: KeyEstimate): number {
  const midi = hzToMidi(hz)
  let relative = (midi - key.tonic) % 12
  if (relative < 0) relative += 12
  const cents = relative * 100
  const degrees = key.mode === "major" ? MAJOR_DEGREES : MINOR_DEGREES
  let best = 0
  let bestDistance = 1200
  for (const degree of degrees) {
    const base = degree * 100
    for (const target of [base - 1200, base, base + 1200]) {
      const delta = cents - target
      const distance = Math.abs(delta)
      if (distance < bestDistance) {
        bestDistance = distance
        best = delta
      }
    }
  }
  return best
}

function clipRatio(samples: Float32Array): number {
  if (samples.length === 0) return 0
  let clipped = 0
  for (let i = 0; i < samples.length; i++) {
    if (Math.abs(samples[i]!) >= 0.98) clipped += 1
  }
  return clipped / samples.length
}

type HeldNote = {
  start: number
  end: number
  hzs: number[]
}

function heldNotes(frames: FrameFeature[], frameSeconds: number): HeldNote[] {
  const notes: HeldNote[] = []
  let current: HeldNote | null = null

  const close = () => {
    if (!current) return
    const duration = current.end - current.start + frameSeconds
    if (duration >= 0.15 && current.hzs.length >= 4) notes.push(current)
    current = null
  }

  for (const frame of frames) {
    if (frame.hz == null) {
      close()
      continue
    }
    if (!current) {
      current = { start: frame.time, end: frame.time, hzs: [frame.hz] }
      continue
    }
    const cents = Math.abs(1200 * Math.log2(frame.hz / median(current.hzs)))
    const gap = frame.time - current.end
    if (cents <= 80 && gap < 0.08) {
      current.hzs.push(frame.hz)
      current.end = frame.time
    } else {
      close()
      current = { start: frame.time, end: frame.time, hzs: [frame.hz] }
    }
  }
  close()
  return notes
}

type Phrase = { start: number; end: number }

function phrasesOf(frames: FrameFeature[], frameSeconds: number): Phrase[] {
  const phrases: Phrase[] = []
  let current: Phrase | null = null
  let lastVoiced = -Infinity

  const close = () => {
    if (!current) return
    phrases.push(current)
    current = null
  }

  for (const frame of frames) {
    if (frame.hz == null) continue
    if (!current || frame.time - lastVoiced > 0.3) {
      close()
      current = { start: frame.time, end: frame.time }
    } else {
      current.end = frame.time
    }
    lastVoiced = frame.time
  }
  close()
  return phrases.map((phrase) => ({
    start: phrase.start,
    end: phrase.end + frameSeconds,
  }))
}

function scoreIntonation(
  frames: FrameFeature[],
  key: KeyEstimate,
  locale: Locale,
): DimensionScore {
  const errors: number[] = []
  for (const frame of frames) {
    if (frame.hz != null) errors.push(Math.abs(centsToScale(frame.hz, key)))
  }
  const inTune =
    errors.length === 0
      ? 0
      : errors.filter((error) => error <= 30).length / errors.length
  const medianError = median(errors)
  const score = roundScore(inTune * 60 + clamp(100 - medianError * 1.6, 0, 100) * 0.4)
  return {
    id: "intonation",
    label: translate(locale, "labelIntonation"),
    score,
    detail: translate(locale, "intonationDetail", {
      pct: Math.round(inTune * 100),
      key: key.label,
      cents: medianError.toFixed(0),
    }),
  }
}

function scoreStability(
  notes: HeldNote[],
  frameSeconds: number,
  locale: Locale,
): DimensionScore {
  if (notes.length === 0) {
    return {
      id: "stability",
      label: translate(locale, "labelStability"),
      score: 35,
      detail: translate(locale, "stabilityNone"),
    }
  }

  const spreads = notes.map(noteSpread)
  const weights = notes.map((note) => note.end - note.start + frameSeconds)

  const weightSum = weights.reduce((sum, weight) => sum + weight, 0)
  const spread = spreads.reduce(
    (sum, value, index) => sum + value * (weights[index] ?? 0),
    0,
  ) / weightSum
  return {
    id: "stability",
    label: translate(locale, "labelStability"),
    score: roundScore(clamp(100 - spread * 2.2, 0, 100)),
    detail: translate(locale, "stabilityDetail", {
      spread: spread.toFixed(0),
      count: notes.length,
    }),
  }
}

function scoreTone(
  frames: FrameFeature[],
  clipped: number,
  locale: Locale,
): DimensionScore {
  const hnrs: number[] = []
  const flats: number[] = []
  for (const frame of frames) {
    if (frame.hnrDb != null) hnrs.push(frame.hnrDb)
    if (frame.flatness != null) flats.push(frame.flatness)
  }
  const medianHnr = median(hnrs)
  const medianFlat = median(flats.length > 0 ? flats : [1])
  const hnrScore = clamp(((medianHnr + 5) / 25) * 100, 0, 100)
  const flatScore = clamp((1 - medianFlat) * 100, 0, 100)
  let score = hnrScore * 0.7 + flatScore * 0.3
  if (clipped > 0.01) score *= 0.7
  return {
    id: "tone",
    label: translate(locale, "labelTone"),
    score: roundScore(score),
    detail: translate(locale, clipped > 0.01 ? "toneClip" : "toneClear", {
      db: medianHnr.toFixed(0),
    }),
  }
}

function scoreDynamics(
  frames: FrameFeature[],
  clipped: number,
  locale: Locale,
): { score: DimensionScore; range: number } {
  const levels: number[] = []
  for (const frame of frames) {
    if (frame.hz != null) levels.push(frame.rmsDb)
  }
  const range =
    levels.length < 2 ? 0 : percentile(levels, 0.95) - percentile(levels, 0.05)
  let score = clamp(100 - Math.abs(range - 12) * 4, 25, 100)
  if (range < 2) score = Math.min(score, 45)
  if (clipped > 0.01) score = Math.min(score, 40)
  return {
    range,
    score: {
      id: "dynamics",
      label: translate(locale, "labelDynamics"),
      score: roundScore(score),
      detail: translate(locale, "dynamicsDetail", { range: range.toFixed(1) }),
    },
  }
}

function noteSpread(note: HeldNote): number {
  const midis = note.hzs.map(hzToMidi)
  const center = median(midis)
  let power = 0
  for (const midi of midis) {
    const delta = (midi - center) * 100
    power += delta * delta
  }
  return Math.sqrt(power / midis.length)
}

function phraseLengthScore(duration: number): number {
  if (duration < 0.4) return 25
  if (duration < 0.8) return 40 + ((duration - 0.4) / 0.4) * 40
  if (duration <= 8) return 92
  return Math.max(40, 92 - (duration - 8) * 6)
}

function scorePhrasing(phrases: Phrase[], locale: Locale): DimensionScore {
  if (phrases.length === 0) {
    return {
      id: "phrasing",
      label: translate(locale, "labelPhrasing"),
      score: 20,
      detail: translate(locale, "phrasingNone"),
    }
  }
  const lengths = phrases.map((phrase) => phrase.end - phrase.start)
  const average =
    lengths.reduce((sum, length) => sum + phraseLengthScore(length), 0) /
    lengths.length
  const medianLength = median(lengths)
  return {
    id: "phrasing",
    label: translate(locale, "labelPhrasing"),
    score: roundScore(average),
    detail: translate(locale, "phrasingDetail", {
      count: phrases.length,
      length: medianLength.toFixed(1),
    }),
  }
}

function coachNotes(
  dimensions: DimensionScore[],
  clipped: number,
  range: number,
  medianPhrase: number,
  locale: Locale,
): string[] {
  const byId = Object.fromEntries(
    dimensions.map((dimension) => [dimension.id, dimension.score]),
  ) as Record<DimensionScore["id"], number>
  const notes: string[] = []

  if (byId.intonation >= 85) {
    notes.push(translate(locale, "coachIntonationHigh"))
  } else if (byId.intonation >= 65) {
    notes.push(translate(locale, "coachIntonationMid"))
  } else {
    notes.push(translate(locale, "coachIntonationLow"))
  }

  if (byId.stability >= 85) {
    notes.push(translate(locale, "coachStabilityHigh"))
  } else if (byId.stability >= 65) {
    notes.push(translate(locale, "coachStabilityMid"))
  } else {
    notes.push(translate(locale, "coachStabilityLow"))
  }

  if (clipped > 0.01) {
    notes.push(translate(locale, "coachClip"))
  } else if (byId.tone >= 85) {
    notes.push(translate(locale, "coachToneHigh"))
  } else if (byId.tone < 60) {
    notes.push(translate(locale, "coachToneLow"))
  }

  if (byId.dynamics >= 80) {
    notes.push(translate(locale, "coachDynamicsHigh"))
  } else if (range < 3) {
    notes.push(translate(locale, "coachDynamicsFlat"))
  } else if (byId.dynamics < 55) {
    notes.push(translate(locale, "coachDynamicsJump"))
  }

  if (byId.phrasing >= 80) {
    notes.push(translate(locale, "coachPhrasingHigh"))
  } else if (medianPhrase > 8) {
    notes.push(translate(locale, "coachPhrasingLong"))
  } else {
    notes.push(translate(locale, "coachPhrasingShort"))
  }

  return notes
}

function extractFrames(samples: Float32Array, sampleRate: number): FrameFeature[] {
  const detectPitch = Pitchfinder.YIN({
    sampleRate,
    threshold: 0.15,
    probabilityThreshold: 0.15,
  })
  const frames: FrameFeature[] = []
  const hopSeconds = HOP / sampleRate

  for (let offset = 0; offset + FRAME <= samples.length; offset += HOP) {
    const frame = samples.subarray(offset, offset + FRAME)
    const level = rmsDb(frame)
    let hz: number | null = null
    let confidence = 0
    let hnrDb: number | null = null
    let flatness: number | null = null

    if (level >= SILENCE_DB) {
      const detected = detectPitch(frame)
      if (
        typeof detected === "number" &&
        Number.isFinite(detected) &&
        detected >= MIN_HZ &&
        detected <= MAX_HZ
      ) {
        const lag = Math.round(sampleRate / detected)
        const periodicity = autocorrelationAt(frame, lag)
        if (periodicity >= 0.35) {
          hz = detected
          confidence = clamp(periodicity, 0, 1)
          const ratio = clamp(periodicity, 0, 0.999)
          hnrDb = 10 * Math.log10(ratio / (1 - ratio))
          flatness = spectralFlatness(fftMagnitudes(frame))
        }
      }
    }

    frames.push({
      time: (offset / HOP) * hopSeconds,
      hz,
      confidence,
      rmsDb: level,
      hnrDb,
      flatness,
    })
  }

  return frames
}

export function analyzeSinging(
  samples: Float32Array,
  sampleRate: number,
  locale: Locale = "en",
): AnalysisResult {
  const duration = samples.length / sampleRate
  if (samples.length < FRAME || duration < 0.5) {
    return {
      status: "insufficient",
      message: translate(locale, "insufficient"),
      contour: [],
      duration,
    }
  }

  const audio = resample(samples, sampleRate, ANALYSIS_RATE)
  const frames = extractFrames(audio, ANALYSIS_RATE)
  const frameSeconds = FRAME / ANALYSIS_RATE
  const contour: PitchFrame[] = frames.map((frame) => ({
    time: frame.time,
    hz: frame.hz,
    confidence: frame.confidence,
  }))
  const voiced = frames.filter((frame) => frame.hz != null)
  const voicedSeconds = voiced.length * (HOP / ANALYSIS_RATE)

  if (voicedSeconds < MIN_VOICED_SECONDS) {
    return {
      status: "insufficient",
      message: translate(locale, "insufficient"),
      contour,
      duration,
    }
  }

  const key = estimateKey(frames, locale)
  const clipped = clipRatio(audio)
  const notes = heldNotes(frames, frameSeconds)
  const phrases = phrasesOf(frames, frameSeconds)
  const intonation = scoreIntonation(frames, key, locale)
  const stability = scoreStability(notes, frameSeconds, locale)
  const tone = scoreTone(frames, clipped, locale)
  const dynamics = scoreDynamics(frames, clipped, locale)
  const phrasing = scorePhrasing(phrases, locale)
  const phraseLengths = phrases.map((phrase) => phrase.end - phrase.start)
  const rawDimensions = [intonation, stability, tone, dynamics.score, phrasing]
  const dimensions = rawDimensions.map((dimension) => ({
    ...dimension,
    score: liftScore(dimension.score),
  }))
  const series = buildSeries(frames, key, notes, phrases)
  const overall = roundScore(
    dimensions.reduce((total, dimension) => total + dimension.score * WEIGHTS[dimension.id], 0),
  )

  return {
    status: "scored",
    overall,
    dimensions,
    contour,
    duration,
    notes: coachNotes(rawDimensions, clipped, dynamics.range, median(phraseLengths), locale),
    keyLabel: key.label,
    voicedSeconds,
    series,
  }
}

function buildSeries(
  frames: FrameFeature[],
  key: KeyEstimate,
  notes: HeldNote[],
  phrases: Phrase[],
): ScoreSeries {
  const intonation = []
  const tone = []
  const dynamics = []
  for (const frame of frames) {
    if (frame.hz == null) continue
    intonation.push({ time: frame.time, cents: centsToScale(frame.hz, key) })
    if (frame.hnrDb != null) tone.push({ time: frame.time, hnrDb: frame.hnrDb })
    dynamics.push({ time: frame.time, db: frame.rmsDb })
  }
  return {
    intonation,
    stability: notes.map((note) => ({
      start: note.start,
      end: note.end,
      spread: noteSpread(note),
    })),
    tone,
    dynamics,
    phrases: phrases.map((phrase) => ({ start: phrase.start, end: phrase.end })),
    notes: compareNotes(notes, key),
  }
}
