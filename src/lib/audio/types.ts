export type PitchFrame = {
  time: number
  hz: number | null
  confidence: number
}

export type DimensionId =
  | "intonation"
  | "stability"
  | "tone"
  | "dynamics"
  | "phrasing"

export type DimensionScore = {
  id: DimensionId
  label: string
  score: number
  detail: string
}

export type IntonationPoint = { time: number; cents: number }
export type StabilityNote = { start: number; end: number; spread: number }
export type TonePoint = { time: number; hnrDb: number }
export type DynamicsPoint = { time: number; db: number }
export type PhraseSpan = { start: number; end: number }

export type NoteLevel = {
  start: number
  end: number
  name: string
  cents: number
  sungHz: number
  targetHz: number
}

export type ScoreSeries = {
  intonation: IntonationPoint[]
  stability: StabilityNote[]
  tone: TonePoint[]
  dynamics: DynamicsPoint[]
  phrases: PhraseSpan[]
  notes: NoteLevel[]
}

export type AnalysisResult =
  | {
      status: "insufficient"
      message: string
      contour: PitchFrame[]
      duration: number
    }
  | {
      status: "scored"
      overall: number
      dimensions: DimensionScore[]
      contour: PitchFrame[]
      duration: number
      notes: string[]
      keyLabel: string
      voicedSeconds: number
      series: ScoreSeries
    }

export type Take = {
  samples: Float32Array
  sampleRate: number
}
