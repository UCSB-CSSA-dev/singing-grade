import { useEffect, useRef, useState, type ReactNode } from "react"
import { X } from "lucide-react"
import { CoachSummary } from "@/components/CoachSummary"
import { NoteLevelChart } from "@/components/NoteLevelChart"
import { PitchScrollChart } from "@/components/PitchScrollChart"
import { ScoreDetail } from "@/components/ScoreDetail"
import { Button } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"
import type { AnalysisResult, DimensionId, DimensionScore, PitchFrame } from "@/lib/audio/types"
import { usePreferences } from "@/lib/preferences"

type ScoreReportProps = {
  result: AnalysisResult
  open: boolean
  onClose: () => void
}

type OpenChart = DimensionId | "pitch" | null

const popupClosers: Array<() => void> = []

export function ScoreReport({ result, open, onClose }: ScoreReportProps) {
  const { t } = usePreferences()
  const [chart, setChart] = useState<OpenChart>(null)

  useEffect(() => {
    setChart(null)
  }, [result])

  if (!open) return null

  if (result.status === "insufficient") {
    return (
      <ChartPopup title={t("notEnoughTitle")} onClose={onClose}>
        <p className="text-sm text-muted-foreground">{result.message}</p>
      </ChartPopup>
    )
  }

  const selected =
    chart != null && chart !== "pitch"
      ? (result.dimensions.find((dimension) => dimension.id === chart) ?? null)
      : null

  return (
    <ChartPopup title={t("reportTitle")} onClose={onClose}>
      <p className="-mt-2 text-sm text-muted-foreground">
        {result.keyLabel} · {result.duration.toFixed(1)}s {t("recorded")} · {result.voicedSeconds.toFixed(1)}s{" "}
        {t("pitched")}
      </p>
      <div className="mt-6 space-y-8">
        <div className="flex flex-col gap-8 md:flex-row md:items-center">
          <ScoreRing score={result.overall} />
          <div className="flex-1 space-y-2">
            <p className="px-2 text-xs text-muted-foreground">{t("chartHint")}</p>
            <Button
              type="button"
              variant="outline"
              className="mb-1 w-full"
              aria-haspopup="dialog"
              aria-expanded={chart === "pitch"}
              onClick={() => setChart(chart === "pitch" ? null : "pitch")}
            >
              {t("openPitchCharts")}
            </Button>
            {result.dimensions.map((dimension) => {
              const expanded = chart === dimension.id
              return (
                <button
                  key={dimension.id}
                  type="button"
                  className={`w-full rounded-lg px-2 py-2 text-left transition-colors hover:bg-white/5 ${expanded ? "bg-white/5 ring-1 ring-cyan-300/30" : ""}`}
                  aria-haspopup="dialog"
                  aria-expanded={expanded}
                  onClick={() => setChart(expanded ? null : dimension.id)}
                >
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="text-sm">{dimension.label}</span>
                    <span className="flex items-baseline gap-3">
                      <span className="font-mono text-[10px] tracking-[0.14em] text-cyan-200/70 uppercase">
                        {t("openChart")}
                      </span>
                      <span className="font-mono text-sm tabular-nums text-cyan-100">
                        {dimension.score}
                      </span>
                    </span>
                  </div>
                  <Progress value={dimension.score} className="mt-1.5 h-1.5" />
                  <p className="mt-1.5 text-xs text-muted-foreground">{dimension.detail}</p>
                </button>
              )
            })}
          </div>
        </div>
        <CoachSummary result={result} />
        <div className="space-y-3">
          <h3 className="text-sm font-medium">{t("coachNotes")}</h3>
          <ul className="space-y-2 border-l border-cyan-300/40 pl-4">
            {result.notes.map((note) => (
              <li key={note} className="text-sm text-foreground/90">
                {note}
              </li>
            ))}
          </ul>
        </div>
      </div>
      {chart === "pitch" ? (
        <ChartPopup title={t("openPitchCharts")} onClose={() => setChart(null)} layer="front">
          <div className="space-y-5">
            <div className="space-y-2">
              <h3 className="text-sm font-medium">{t("pitchContour")}</h3>
              <PitchChart contour={result.contour} duration={result.duration} />
            </div>
            <div className="space-y-2">
              <h3 className="text-sm font-medium">{t("pitchScroll")}</h3>
              <p className="text-xs leading-5 text-muted-foreground">{t("pitchScrollHint")}</p>
              <PitchScrollChart
                contour={result.contour}
                notes={result.series.notes}
                duration={result.duration}
              />
            </div>
            <div className="space-y-2">
              <h3 className="text-sm font-medium">{t("noteCompare")}</h3>
              <p className="text-xs leading-5 text-muted-foreground">{t("noteCompareHint")}</p>
              <NoteLevelChart notes={result.series.notes} />
            </div>
          </div>
        </ChartPopup>
      ) : null}
      {selected ? (
        <CriterionDialog
          dimension={selected}
          result={result}
          onClose={() => setChart(null)}
        />
      ) : null}
    </ChartPopup>
  )
}

function ChartPopup({
  title,
  score,
  onClose,
  layer = "base",
  children,
}: {
  title: string
  score?: number
  onClose: () => void
  layer?: "base" | "front"
  children: ReactNode
}) {
  const { t } = usePreferences()
  const panelRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    panelRef.current?.focus()
    popupClosers.push(onClose)
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || popupClosers[popupClosers.length - 1] !== onClose) return
      onClose()
    }
    window.addEventListener("keydown", onKey)
    return () => {
      const index = popupClosers.lastIndexOf(onClose)
      if (index >= 0) popupClosers.splice(index, 1)
      window.removeEventListener("keydown", onKey)
    }
  }, [onClose])

  return (
    <div
      className={`fixed inset-0 grid place-items-center px-4 py-6 ${layer === "front" ? "z-[60]" : "z-50"}`}
    >
      <button
        type="button"
        className="absolute inset-0 bg-black/60"
        aria-label={t("close")}
        onClick={onClose}
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="chart-popup-title"
        tabIndex={-1}
        className="relative z-10 max-h-[min(85vh,900px)] w-full max-w-3xl overflow-y-auto rounded-xl border border-white/10 bg-card p-5 shadow-[0_24px_80px_rgba(0,0,0,0.45)] outline-none"
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 id="chart-popup-title" className="text-lg font-semibold">
              {title}
            </h2>
            {score != null ? (
              <p className="mt-1 font-mono text-2xl text-cyan-100 tabular-nums">{score}</p>
            ) : null}
          </div>
          <Button variant="ghost" size="icon" aria-label={t("close")} onClick={onClose}>
            <X />
          </Button>
        </div>
        <div className="mt-4">{children}</div>
      </div>
    </div>
  )
}

function CriterionDialog({
  dimension,
  result,
  onClose,
}: {
  dimension: DimensionScore
  result: Extract<AnalysisResult, { status: "scored" }>
  onClose: () => void
}) {
  return (
    <ChartPopup title={dimension.label} score={dimension.score} onClose={onClose} layer="front">
      <ScoreDetail
        dimension={dimension}
        series={result.series}
        duration={result.duration}
        keyLabel={result.keyLabel}
      />
    </ChartPopup>
  )
}

function ScoreRing({ score }: { score: number }) {
  const { t } = usePreferences()
  const tier =
    score >= 90
      ? t("tierExcellent")
      : score >= 75
        ? t("tierStrong")
        : score >= 60
          ? t("tierDeveloping")
          : t("tierRough")
  return (
    <div
      className="grid size-40 shrink-0 place-items-center rounded-full"
      style={{
        background: `conic-gradient(#67e8f9 ${score * 3.6}deg, rgba(255,255,255,0.08) 0deg)`,
      }}
      aria-label={t("overallScore", { score })}
    >
      <div className="grid size-[7.5rem] place-items-center rounded-full bg-card text-center">
        <div>
          <p className="font-mono text-4xl leading-none tabular-nums">{score}</p>
          <p className="mt-1 font-mono text-[10px] tracking-[0.16em] text-cyan-200/80 uppercase">
            {tier}
          </p>
        </div>
      </div>
    </div>
  )
}

function PitchChart({ contour, duration }: { contour: PitchFrame[]; duration: number }) {
  const { t } = usePreferences()
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const context = canvas.getContext("2d")
    if (!context) return

    const width = canvas.clientWidth
    const height = canvas.clientHeight
    const ratio = window.devicePixelRatio || 1
    canvas.width = Math.floor(width * ratio)
    canvas.height = Math.floor(height * ratio)
    context.setTransform(ratio, 0, 0, ratio, 0, 0)
    context.clearRect(0, 0, width, height)
    context.fillStyle = "rgba(4, 8, 16, 0.72)"
    context.fillRect(0, 0, width, height)

    const padLeft = 42
    const padRight = 12
    const padTop = 12
    const padBottom = 24
    const plotWidth = width - padLeft - padRight
    const plotHeight = height - padTop - padBottom
    const minHz = 80
    const maxHz = 1000
    const span = Math.max(duration, 0.001)

    const yOf = (hz: number) => {
      const t = (Math.log(hz) - Math.log(minHz)) / (Math.log(maxHz) - Math.log(minHz))
      return padTop + (1 - t) * plotHeight
    }
    const xOf = (time: number) => padLeft + (time / span) * plotWidth

    context.strokeStyle = "rgba(103, 232, 249, 0.16)"
    context.fillStyle = "rgba(148, 163, 184, 0.85)"
    context.font = "11px 'Geist Mono Variable', ui-monospace, monospace"
    context.lineWidth = 1
    for (const hz of [100, 200, 400, 800]) {
      const y = yOf(hz)
      context.beginPath()
      context.moveTo(padLeft, y)
      context.lineTo(width - padRight, y)
      context.stroke()
      context.fillText(String(hz), 6, y + 4)
    }

    context.strokeStyle = "#67e8f9"
    context.lineWidth = 1.8
    context.beginPath()
    let drawing = false
    for (let i = 0; i < contour.length; i++) {
      const frame = contour[i]
      const previous = contour[i - 1]
      if (!frame || frame.hz == null || frame.hz < minHz || frame.hz > maxHz) {
        drawing = false
        continue
      }
      const broken = !previous || previous.hz == null || frame.time - previous.time > 0.08
      const x = xOf(frame.time)
      const y = yOf(frame.hz)
      if (!drawing || broken) {
        context.moveTo(x, y)
        drawing = true
      } else {
        context.lineTo(x, y)
      }
    }
    context.stroke()
  }, [contour, duration])

  return (
    <canvas
      ref={canvasRef}
      className="h-56 w-full rounded-xl border border-white/10"
      role="img"
      aria-label={t("pitchAria")}
    />
  )
}
