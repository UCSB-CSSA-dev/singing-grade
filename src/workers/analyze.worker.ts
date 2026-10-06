import { analyzeSinging } from "@/lib/audio/analyze"
import type { Locale } from "@/lib/i18n"
import type { AnalysisResult, ReferenceAudio } from "@/lib/audio/types"

type Request = {
  id: number
  samples: Float32Array
  sampleRate: number
  locale: Locale
  reference?: ReferenceAudio
}

type Response = {
  id: number
  result: AnalysisResult
}

const scope = self as unknown as {
  onmessage: ((event: MessageEvent<Request>) => void) | null
  postMessage: (message: Response) => void
}

scope.onmessage = (event) => {
  const { id, samples, sampleRate, locale, reference } = event.data
  scope.postMessage({
    id,
    result: analyzeSinging(samples, sampleRate, locale, reference),
  })
}
