import type { RefObject } from "react"
import { Mic, Square, AudioWaveform, Play } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
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
}: RecorderPanelProps) {
  const { t } = usePreferences()
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
    <Card className="border-white/10 bg-card/80 shadow-[0_0_0_1px_rgba(103,232,249,0.08),0_24px_80px_rgba(0,0,0,0.35)] backdrop-blur-sm">
      <CardHeader>
        <div className="flex items-start justify-between gap-4">
          <div>
            <CardTitle className="text-lg">{t("capture")}</CardTitle>
            <CardDescription>{t("captureHint")}</CardDescription>
          </div>
          <div className="text-right">
            <p className="font-mono text-[10px] tracking-[0.16em] whitespace-nowrap text-cyan-200/80 uppercase">
              {playing && !recording ? t("statusPlaying") : status}
            </p>
            <p className="font-mono text-2xl text-foreground tabular-nums">
              {counting && countdown != null ? countdown : formatTime(shownTime)}
            </p>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="relative">
          <LiveVisualizer
            analyser={analyser}
            active={recording}
            playing={playing}
            playheadRef={playheadRef}
            samples={samples}
          />
          {counting && countdown != null ? (
            <div className="pointer-events-none absolute inset-x-0 top-0 grid h-40 place-items-center">
              <p
                className="font-mono text-7xl leading-none text-cyan-200 tabular-nums drop-shadow-[0_0_24px_rgba(103,232,249,0.45)]"
                aria-live="assertive"
              >
                {countdown}
              </p>
            </div>
          ) : null}
        </div>
        <div className="flex flex-wrap gap-3">
          <Button
            size="lg"
            className="h-11 min-w-36 px-5"
            onClick={onStart}
            disabled={recording || counting || analyzing}
          >
            <Mic />
            {t("startRecording")}
          </Button>
          <Button
            size="lg"
            variant="outline"
            className="h-11 min-w-36 px-5"
            onClick={onStop}
            disabled={!recording && !counting}
          >
            <Square />
            {t("stopRecording")}
          </Button>
          <Button
            size="lg"
            variant="outline"
            className="h-11 min-w-36 px-5"
            onClick={onPlay}
            disabled={!canPlay}
            aria-pressed={playing}
          >
            {playing ? <Square /> : <Play />}
            {playing ? t("stopPlay") : t("play")}
          </Button>
          <Button
            size="lg"
            variant="secondary"
            className="h-11 min-w-36 px-5"
            onClick={onAnalyze}
            disabled={!canAnalyze}
          >
            <AudioWaveform />
            {analyzing ? t("analyzing") : t("analyze")}
          </Button>
        </div>
        {error ? (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        ) : null}
        {shortTake ? (
          <p className="text-sm text-muted-foreground">{t("shortTake")}</p>
        ) : null}
        {analyzing ? (
          <p className="font-mono text-xs tracking-wide text-cyan-200/80">
            {t("analyzingHint")}
          </p>
        ) : null}
      </CardContent>
    </Card>
  )
}
