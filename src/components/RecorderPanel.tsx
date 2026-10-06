import { useRef, type RefObject } from "react"
import { Mic, Square, AudioWaveform, Play, Upload } from "lucide-react"
import { Button } from "@/components/ui/button"
import { LiveVisualizer } from "@/components/LiveVisualizer"
import { usePreferences } from "@/lib/preferences"

type RecorderPanelProps = {
  phase: "idle" | "countdown" | "recording" | "ready" | "analyzing" | "report"
  countdown: number | null
  elapsed: number
  playbackSeconds: number
  takeSeconds: number | null
  error: string | null
  analyser: AnalyserNode | null
  samples: Float32Array | null
  canAnalyze: boolean
  canPlay: boolean
  playing: boolean
  playheadRef: RefObject<number | null>
  onStart: () => void
  onStop: () => void
  onPlay: () => void
  onAnalyze: () => void
  onUpload: (file: File) => void
  score: number | null
}

function formatTime(seconds: number): string {
  const whole = Math.max(0, Math.floor(seconds))
  const minutes = Math.floor(whole / 60)
  const remain = whole % 60
  return `${minutes}:${remain.toString().padStart(2, "0")}`
}

export function RecorderPanel({
  phase,
  countdown,
  elapsed,
  playbackSeconds,
  takeSeconds,
  error,
  analyser,
  samples,
  canAnalyze,
  canPlay,
  playing,
  playheadRef,
  onStart,
  onStop,
  onPlay,
  onAnalyze,
  onUpload,
  score,
}: RecorderPanelProps) {
  const { t } = usePreferences()
  const fileRef = useRef<HTMLInputElement>(null)
  const status = {
    idle: t("statusReady"),
    countdown: t("statusGetReady"),
    recording: t("statusRecording"),
    ready: t("statusCaptured"),
    analyzing: t("statusAnalyzing"),
    report: t("statusReport"),
  }[phase]
  const recording = phase === "recording"
  const counting = phase === "countdown"
  const analyzing = phase === "analyzing"
  const shownTime = recording ? elapsed : playing ? playbackSeconds : (takeSeconds ?? 0)
  const shortTake = takeSeconds != null && takeSeconds < 3 && !recording && !counting

  return (
    <footer className="fixed inset-x-0 bottom-0 z-30 border-t border-white/10 bg-background/85 backdrop-blur-md">
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-2 px-5 py-3">
        <div className="flex items-center justify-between gap-3">
          <p className="font-mono text-[10px] tracking-[0.16em] text-cyan-200/80 uppercase">
            {playing && !recording ? t("statusPlaying") : status}
          </p>
          <p className="font-mono text-lg text-foreground tabular-nums">
            {counting && countdown != null ? countdown : formatTime(shownTime)}
          </p>
        </div>
        <div className="relative">
          <LiveVisualizer
            analyser={analyser}
            active={recording}
            playing={playing}
            playheadRef={playheadRef}
            samples={samples}
            compact
          />
          {counting && countdown != null ? (
            <div className="pointer-events-none absolute inset-x-0 top-0 grid h-12 place-items-center">
              <p
                className="font-mono text-3xl leading-none text-cyan-200 tabular-nums"
                aria-live="assertive"
              >
                {countdown}
              </p>
            </div>
          ) : null}
        </div>
        {error ? (
          <p role="alert" className="text-xs text-destructive">
            {error}
          </p>
        ) : null}
        {shortTake ? <p className="text-xs text-muted-foreground">{t("shortTake")}</p> : null}
        {analyzing ? (
          <p className="font-mono text-[10px] tracking-wide text-cyan-200/80">{t("analyzingHint")}</p>
        ) : null}
        <div className="flex flex-nowrap items-center gap-2">
          <Button
            size="lg"
            className="h-10 min-w-0 flex-1 px-3"
            aria-label={t("startRecording")}
            onClick={onStart}
            disabled={recording || counting || analyzing}
          >
            <Mic />
            <span className="hidden sm:inline">{t("startRecording")}</span>
          </Button>
          <Button
            size="lg"
            variant="outline"
            className="h-10 min-w-0 flex-1 px-3"
            aria-label={t("stopRecording")}
            onClick={onStop}
            disabled={!recording && !counting}
          >
            <Square />
            <span className="hidden sm:inline">{t("stopRecording")}</span>
          </Button>
          <Button
            size="lg"
            variant="outline"
            className="h-10 min-w-0 flex-1 px-3"
            aria-label={playing ? t("stopPlay") : t("play")}
            onClick={onPlay}
            disabled={!canPlay}
            aria-pressed={playing}
          >
            {playing ? <Square /> : <Play />}
            <span className="hidden sm:inline">{playing ? t("stopPlay") : t("play")}</span>
          </Button>
          <Button
            size="lg"
            variant="secondary"
            className="h-10 min-w-0 flex-1 px-3"
            onClick={onAnalyze}
            disabled={score == null && !canAnalyze}
            aria-label={score != null ? t("overallScore", { score }) : analyzing ? t("analyzing") : t("analyze")}
          >
            {score != null ? (
              <span className="font-mono text-base tabular-nums">{score}</span>
            ) : (
              <>
                <AudioWaveform />
                <span className="hidden sm:inline">{analyzing ? t("analyzing") : t("analyze")}</span>
              </>
            )}
          </Button>
          <Button
            size="lg"
            variant="outline"
            className="size-10 shrink-0 px-0"
            aria-label={t("upload")}
            title={t("upload")}
            disabled={recording || counting || analyzing}
            onClick={() => fileRef.current?.click()}
          >
            <Upload />
          </Button>
          <input
            ref={fileRef}
            type="file"
            accept="audio/*,.mp3,.wav,.m4a,.aac,.ogg,.flac,.webm"
            className="sr-only"
            aria-hidden="true"
            tabIndex={-1}
            onChange={(event) => {
              const file = event.target.files?.[0]
              event.target.value = ""
              if (file) onUpload(file)
            }}
          />
        </div>
      </div>
    </footer>
  )
}
