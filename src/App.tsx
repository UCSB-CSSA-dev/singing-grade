import { useEffect, useRef, useState } from "react"
import { Settings } from "lucide-react"
import { RecorderPanel } from "@/components/RecorderPanel"
import { ScoreReport } from "@/components/ScoreReport"
import { SettingsDialog } from "@/components/SettingsDialog"
import { Button } from "@/components/ui/button"
import { decodeAudioFile } from "@/lib/audio/decode"
import { playTake, type PlaybackHandle } from "@/lib/audio/playback"
import { isMicDenied, startRecorder, type RecorderHandle } from "@/lib/audio/recorder"
import { loadTake, saveTake } from "@/lib/audio/takeStore"
import type { AnalysisResult, Take } from "@/lib/audio/types"
import type { MessageKey } from "@/lib/i18n"
import { usePreferences } from "@/lib/preferences"

type Phase = "idle" | "countdown" | "recording" | "ready" | "analyzing" | "report"

type WorkerResponse = {
  id: number
  result: AnalysisResult
}

function createWorker(): Worker {
  return new Worker(new URL("./workers/analyze.worker.ts", import.meta.url), {
    type: "module",
  })
}

export default function App() {
  const { locale, micGain, t } = usePreferences()
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [phase, setPhase] = useState<Phase>(() => (loadTake() ? "ready" : "idle"))
  const [countdown, setCountdown] = useState<number | null>(null)
  const [elapsed, setElapsed] = useState(0)
  const [playbackSeconds, setPlaybackSeconds] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [errorKey, setErrorKey] = useState<MessageKey | null>(null)
  const [take, setTake] = useState<Take | null>(() => loadTake())
  const [result, setResult] = useState<AnalysisResult | null>(null)
  const [analyser, setAnalyser] = useState<AnalyserNode | null>(null)
  const recorderRef = useRef<RecorderHandle | null>(null)
  const workerRef = useRef<Worker | null>(null)
  const playbackRef = useRef<PlaybackHandle | null>(null)
  const playheadRef = useRef<number | null>(null)
  const playGeneration = useRef(0)
  const requestRef = useRef(0)
  const startedAt = useRef(0)
  const startGeneration = useRef(0)
  const countdownDone = useRef(false)
  const localeRef = useRef(locale)
  const phaseRef = useRef(phase)
  const hasResult = useRef(false)
  phaseRef.current = phase
  hasResult.current = result != null

  const stopPlayback = () => {
    playGeneration.current += 1
    playbackRef.current?.stop()
    playbackRef.current = null
    playheadRef.current = null
    setPlaying(false)
    setPlaybackSeconds(0)
  }

  useEffect(() => {
    return () => {
      playGeneration.current += 1
      playbackRef.current?.stop()
      recorderRef.current?.close()
      workerRef.current?.terminate()
    }
  }, [])

  useEffect(() => {
    if (!playing) return
    const timer = window.setInterval(() => {
      const playback = playbackRef.current
      if (!playback) return
      const position = Math.min(
        playback.duration,
        playback.context.currentTime - playback.startedAt,
      )
      setPlaybackSeconds(position)
      playheadRef.current = playback.duration > 0 ? position / playback.duration : 0
    }, 50)
    return () => window.clearInterval(timer)
  }, [playing])

  useEffect(() => {
    recorderRef.current?.setGain(micGain)
  }, [micGain])

  useEffect(() => {
    if (phase !== "recording") return
    const timer = window.setInterval(() => {
      setElapsed((performance.now() - startedAt.current) / 1000)
    }, 100)
    return () => window.clearInterval(timer)
  }, [phase])

  const takeSeconds = take ? take.samples.length / take.sampleRate : null
  const canAnalyze =
    takeSeconds != null &&
    takeSeconds >= 3 &&
    phase !== "countdown" &&
    phase !== "recording" &&
    phase !== "analyzing"

  const beginRecording = (generation: number) => {
    if (startGeneration.current !== generation) return
    if (!countdownDone.current || !recorderRef.current) return
    if (phaseRef.current !== "countdown") return
    recorderRef.current.discard()
    startedAt.current = performance.now()
    setElapsed(0)
    setCountdown(null)
    setPhase("recording")
  }
  const beginRef = useRef(beginRecording)
  beginRef.current = beginRecording

  useEffect(() => {
    if (phase !== "countdown") return
    countdownDone.current = false
    const generation = startGeneration.current
    const seconds = 5
    setCountdown(seconds)
    const ticks = Array.from({ length: seconds - 1 }, (_, index) =>
      window.setTimeout(() => setCountdown(seconds - 1 - index), (index + 1) * 1000),
    )
    const done = window.setTimeout(() => {
      countdownDone.current = true
      beginRef.current(generation)
    }, seconds * 1000)
    return () => {
      for (const tick of ticks) window.clearTimeout(tick)
      window.clearTimeout(done)
    }
  }, [phase])

  const onStart = async () => {
    stopPlayback()
    const generation = startGeneration.current + 1
    startGeneration.current = generation
    countdownDone.current = false
    setErrorKey(null)
    setResult(null)
    requestRef.current += 1
    setCountdown(5)
    setPhase("countdown")
    try {
      const recorder = await startRecorder(micGain)
      if (startGeneration.current !== generation) {
        recorder.close()
        return
      }
      recorderRef.current = recorder
      setAnalyser(recorder.analyser)
      beginRef.current(generation)
    } catch (caught) {
      if (startGeneration.current !== generation) return
      setAnalyser(null)
      setCountdown(null)
      setPhase(take ? "ready" : "idle")
      setErrorKey(isMicDenied(caught) ? "micDenied" : "micFailed")
    }
  }

  const onStop = () => {
    if (phase === "countdown") {
      startGeneration.current += 1
      countdownDone.current = false
      recorderRef.current?.close()
      recorderRef.current = null
      setAnalyser(null)
      setCountdown(null)
      setPhase(take ? "ready" : "idle")
      return
    }
    const recorder = recorderRef.current
    if (!recorder) return
    const nextTake = recorder.stop()
    recorderRef.current = null
    setAnalyser(null)
    setTake(nextTake)
    setElapsed(nextTake.samples.length / nextTake.sampleRate)
    setPhase("ready")
    void Promise.resolve().then(() => saveTake(nextTake))
  }

  const onPlay = () => {
    if (playbackRef.current) {
      stopPlayback()
      return
    }
    if (!take || take.samples.length === 0 || phase === "recording" || phase === "countdown") return
    const generation = playGeneration.current + 1
    playGeneration.current = generation
    void playTake(take, () => {
      if (playGeneration.current !== generation) return
      playbackRef.current = null
      playheadRef.current = null
      setPlaying(false)
      setPlaybackSeconds(0)
    }).then((handle) => {
      if (playGeneration.current !== generation) {
        handle.stop()
        return
      }
      playbackRef.current = handle
      setPlaying(true)
      setPlaybackSeconds(0)
      playheadRef.current = 0
    }).catch(() => {
      if (playGeneration.current !== generation) return
      playbackRef.current = null
      playheadRef.current = null
      setPlaying(false)
      setErrorKey("playFailed")
    })
  }

  const beginAnalysis = (force: boolean) => {
    const longEnough = takeSeconds != null && takeSeconds >= 3
    if (!take || !longEnough || phase === "recording" || phase === "countdown") return
    if (!force && phase === "analyzing") return
    const worker = workerRef.current ?? createWorker()
    workerRef.current = worker
    const id = requestRef.current + 1
    requestRef.current = id
    setPhase("analyzing")
    setErrorKey(null)

    const onMessage = (event: MessageEvent<WorkerResponse>) => {
      if (event.data.id !== id) return
      worker.removeEventListener("message", onMessage)
      worker.removeEventListener("error", onError)
      setResult(event.data.result)
      setPhase("report")
    }
    const onError = () => {
      worker.removeEventListener("message", onMessage)
      worker.removeEventListener("error", onError)
      if (requestRef.current !== id) return
      setErrorKey("analyzeFailed")
      setPhase("ready")
    }
    worker.addEventListener("message", onMessage)
    worker.addEventListener("error", onError)
    worker.postMessage({
      id,
      samples: take.samples,
      sampleRate: take.sampleRate,
      locale,
    })
  }

  const onUpload = async (file: File) => {
    stopPlayback()
    setErrorKey(null)
    setResult(null)
    requestRef.current += 1
    try {
      const nextTake = await decodeAudioFile(file)
      setTake(nextTake)
      setElapsed(nextTake.samples.length / nextTake.sampleRate)
      setAnalyser(null)
      setPhase("ready")
      void Promise.resolve().then(() => saveTake(nextTake))
    } catch {
      setErrorKey("uploadFailed")
    }
  }

  const onAnalyze = () => beginAnalysis(false)
  const analyzeRef = useRef(beginAnalysis)
  analyzeRef.current = beginAnalysis

  useEffect(() => {
    if (localeRef.current === locale) return
    localeRef.current = locale
    if (!hasResult.current || phaseRef.current === "recording" || phaseRef.current === "countdown") return
    analyzeRef.current(true)
  }, [locale])

  return (
    <div className="relative min-h-svh">
      <div className="lab-grid pointer-events-none absolute inset-0" />
      <main className="relative mx-auto flex w-full max-w-3xl flex-col gap-8 px-5 py-12">
        <header className="flex items-start justify-between gap-4">
          <div className="space-y-3">
            <p className="font-mono text-[11px] tracking-[0.28em] text-cyan-200/80">
              {t("performanceLab")}
            </p>
            <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">{t("title")}</h1>
            <p className="max-w-2xl text-sm leading-6 text-muted-foreground sm:text-base">
              {t("subtitle")}
            </p>
          </div>
          <Button
            variant="outline"
            size="icon"
            aria-label={t("settings")}
            onClick={() => setSettingsOpen(true)}
          >
            <Settings />
          </Button>
        </header>
        <RecorderPanel
          phase={phase}
          elapsed={elapsed}
          playbackSeconds={playbackSeconds}
          takeSeconds={takeSeconds}
          error={errorKey ? t(errorKey) : null}
          analyser={analyser}
          countdown={countdown}
          samples={phase === "countdown" ? null : (take?.samples ?? null)}
          canAnalyze={canAnalyze}
          canPlay={take != null && take.samples.length > 0 && phase !== "recording" && phase !== "countdown"}
          playing={playing}
          playheadRef={playheadRef}
          onStart={() => {
            void onStart()
          }}
          onStop={onStop}
          onPlay={onPlay}
          onAnalyze={onAnalyze}
          onUpload={(file) => {
            void onUpload(file)
          }}
        />
        {result ? <ScoreReport result={result} /> : null}
        <SettingsDialog
          open={settingsOpen}
          busy={phase === "countdown" || phase === "recording" || phase === "analyzing"}
          onClose={() => setSettingsOpen(false)}
        />
      </main>
    </div>
  )
}
