import { useEffect, useRef, useState } from "react"
import { Music2, Settings } from "lucide-react"
import { AccompanimentPanel, type AccompanimentPlayer } from "@/components/AccompanimentPanel"
import { RecorderPanel } from "@/components/RecorderPanel"
import { ScoreReport } from "@/components/ScoreReport"
import { SettingsDialog } from "@/components/SettingsDialog"
import { Button } from "@/components/ui/button"
import { decodeAudioFile } from "@/lib/audio/decode"
import { playTake, type PlaybackHandle } from "@/lib/audio/playback"
import { isMicDenied, startRecorder, type RecorderHandle } from "@/lib/audio/recorder"
import { loadTake, saveTake } from "@/lib/audio/takeStore"
import type { AnalysisResult, ReferenceAudio, Take } from "@/lib/audio/types"
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
  const { locale, micGain, liveMode, t } = usePreferences()
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [accompanimentOpen, setAccompanimentOpen] = useState(false)
  const [reportOpen, setReportOpen] = useState(false)
  const [phase, setPhase] = useState<Phase>(() => (loadTake() ? "ready" : "idle"))
  const [countdown, setCountdown] = useState<number | null>(null)
  const [elapsed, setElapsed] = useState(0)
  const [playbackSeconds, setPlaybackSeconds] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [errorKey, setErrorKey] = useState<MessageKey | null>(null)
  const [take, setTake] = useState<Take | null>(() => loadTake())
  const [referenceTake, setReferenceTake] = useState<Take | null>(null)
  const [referenceName, setReferenceName] = useState<string | null>(null)
  const [referenceOffset, setReferenceOffset] = useState(0)
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
  const accompanimentRef = useRef<AccompanimentPlayer>(null)
  const liveModeRef = useRef(liveMode)
  liveModeRef.current = liveMode
  const referenceTakeRef = useRef<Take | null>(null)
  const referenceOffsetRef = useRef(0)
  referenceTakeRef.current = referenceTake
  referenceOffsetRef.current = referenceOffset
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
    const player = accompanimentRef.current
    if (player?.active()) {
      setReferenceOffset(player.currentTime())
      if (liveModeRef.current) player.play()
    }
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
    setAccompanimentOpen(false)
    if (liveModeRef.current) accompanimentRef.current?.arm()
    const generation = startGeneration.current + 1
    startGeneration.current = generation
    countdownDone.current = false
    setErrorKey(null)
    setResult(null)
    setReportOpen(false)
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
      accompanimentRef.current?.pause()
      setPhase(take ? "ready" : "idle")
      setErrorKey(isMicDenied(caught) ? "micDenied" : "micFailed")
    }
  }

  const onStop = () => {
    accompanimentRef.current?.pause()
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
      setReportOpen(true)
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
    const reference = referenceTakeRef.current
    const message: {
      id: number
      samples: Float32Array
      sampleRate: number
      locale: typeof locale
      reference?: ReferenceAudio
    } = {
      id,
      samples: take.samples,
      sampleRate: take.sampleRate,
      locale,
    }
    if (reference) {
      message.reference = {
        samples: reference.samples,
        sampleRate: reference.sampleRate,
        offsetSeconds: referenceOffsetRef.current,
      }
    }
    worker.postMessage(message)
  }

  const onReferenceAudio = async (file: File) => {
    try {
      const next = await decodeAudioFile(file, false)
      const player = accompanimentRef.current
      if (player?.active()) setReferenceOffset(player.currentTime())
      setReferenceTake(next)
      setReferenceName(file.name)
      setErrorKey(null)
    } catch {
      setErrorKey("uploadFailed")
    }
  }

  const onUpload = async (file: File) => {
    stopPlayback()
    setErrorKey(null)
    setResult(null)
    setReportOpen(false)
    requestRef.current += 1
    try {
      const nextTake = await decodeAudioFile(file)
      const player = accompanimentRef.current
      if (player?.active()) setReferenceOffset(player.currentTime())
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
    if (!accompanimentOpen) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setAccompanimentOpen(false)
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [accompanimentOpen])

  useEffect(() => {
    if (localeRef.current === locale) return
    localeRef.current = locale
    if (!hasResult.current || phaseRef.current === "recording" || phaseRef.current === "countdown") return
    analyzeRef.current(true)
  }, [locale])

  return (
    <div className="relative min-h-svh">
      <div className="lab-grid pointer-events-none absolute inset-0" />
      <main className="relative mx-auto flex w-full max-w-3xl flex-col gap-8 px-5 pt-12 pb-56">
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
          <div className="flex shrink-0 items-center gap-2">
            <Button
              variant="outline"
              size="icon"
              aria-label={t("accompaniment")}
              aria-haspopup="dialog"
              aria-expanded={accompanimentOpen}
              aria-controls="accompaniment-popup"
              onClick={() => setAccompanimentOpen((open) => !open)}
            >
              <Music2 />
            </Button>
            <Button
              variant="outline"
              size="icon"
              aria-label={t("settings")}
              onClick={() => setSettingsOpen(true)}
            >
              <Settings />
            </Button>
          </div>
        </header>
        <div className="relative h-0">
          <div
            id="accompaniment-popup"
            className={
              accompanimentOpen
                ? "absolute top-2 right-0 z-50 w-[min(24rem,calc(100vw-2.5rem))] shadow-[0_24px_80px_rgba(0,0,0,0.45)]"
                : "pointer-events-none fixed top-0 left-0 -z-10 w-[min(24rem,calc(100vw-2.5rem))] opacity-0"
            }
            inert={accompanimentOpen ? undefined : true}
            aria-hidden={accompanimentOpen ? undefined : true}
          >
            <div
              role={accompanimentOpen ? "dialog" : undefined}
              aria-modal={accompanimentOpen ? true : undefined}
              aria-labelledby="accompaniment-title"
            >
              <AccompanimentPanel
                ref={accompanimentRef}
                audioName={referenceName}
                offsetSeconds={referenceOffset}
                onAudio={(file) => {
                  void onReferenceAudio(file)
                }}
                onClearAudio={() => {
                  setReferenceTake(null)
                  setReferenceName(null)
                  setReferenceOffset(0)
                }}
                onAlign={setReferenceOffset}
                onClose={() => setAccompanimentOpen(false)}
                liveMode={liveMode}
              />
            </div>
          </div>
        </div>
        {result ? (
          <ScoreReport result={result} open={reportOpen} onClose={() => setReportOpen(false)} />
        ) : null}
        <SettingsDialog
          open={settingsOpen}
          busy={phase === "countdown" || phase === "recording" || phase === "analyzing"}
          onClose={() => setSettingsOpen(false)}
        />
      </main>
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
        score={phase === "report" && result?.status === "scored" ? result.overall : null}
        onAnalyze={
          phase === "report" && result?.status === "scored" ? () => setReportOpen(true) : onAnalyze
        }
        onUpload={(file) => {
          void onUpload(file)
        }}
      />
    </div>
  )
}
