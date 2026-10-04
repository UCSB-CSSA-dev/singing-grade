import { analyzeSinging } from "@/lib/audio/analyze"
import type { Locale } from "@/lib/i18n"
import type { AnalysisResult } from "@/lib/audio/types"

type Request = {
  id: number
  samples: Float32Array
  sampleRate: number
  locale: Locale
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
  const { id, samples, sampleRate, locale } = event.data
  scope.postMessage({
    id,
    result: analyzeSinging(samples, sampleRate, locale),
  })
}
