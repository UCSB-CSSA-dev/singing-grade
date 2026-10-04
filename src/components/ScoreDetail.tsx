import { useEffect, useRef } from "react"
import type { DimensionScore, ScoreSeries } from "@/lib/audio/types"
import { usePreferences } from "@/lib/preferences"

type ScoreDetailProps = {
  dimension: DimensionScore
  series: ScoreSeries
  duration: number
  keyLabel: string
}

export function ScoreDetail({ dimension, series, duration, keyLabel }: ScoreDetailProps) {
  const { t } = usePreferences()
  return (
    <div className="space-y-3 rounded-xl border border-cyan-300/20 bg-black/25 p-3">
      <p className="text-xs leading-5 text-muted-foreground">{copyFor(dimension.id, keyLabel, t)}</p>
      <DetailChart dimension={dimension} series={series} duration={duration} />
      <Stats dimension={dimension} series={series} />
    </div>
  )
}

function copyFor(
  id: DimensionScore["id"],
  keyLabel: string,
  t: ReturnType<typeof usePreferences>["t"],
): string {
  switch (id) {
    case "intonation":
      return t("intonationCopy", { key: keyLabel })
    case "stability":
      return t("stabilityCopy")
    case "tone":
      return t("toneCopy")
    case "dynamics":
      return t("dynamicsCopy")
    case "phrasing":
      return t("phrasingCopy")
  }
}

function DetailChart({
  dimension,
  series,
  duration,
}: Omit<ScoreDetailProps, "keyLabel">) {
  const { t } = usePreferences()
  if (dimension.id === "intonation") {
    return (
      <ChartCanvas
        label={t("chartIntonation")}
        draw={(context, width, height) =>
          drawIntonation(context, width, height, series.intonation, duration, t("emptyPitch"))
        }
      />
    )
  }
  if (dimension.id === "stability") {
    return (
      <ChartCanvas
        label={t("chartStability")}
        draw={(context, width, height) =>
          drawStability(context, width, height, series.stability, t("emptyNotes"))
        }
      />
    )
  }
  if (dimension.id === "tone") {
    return (
      <ChartCanvas
        label={t("chartTone")}
        draw={(context, width, height) =>
          drawTone(context, width, height, series.tone, duration, t("emptyTone"))
        }
      />
    )
  }
  if (dimension.id === "dynamics") {
    return (
      <ChartCanvas
        label={t("chartDynamics")}
        draw={(context, width, height) =>
          drawDynamics(context, width, height, series.dynamics, duration, t("emptyDynamics"))
        }
      />
    )
  }
  return (
    <ChartCanvas
      label={t("chartPhrases")}
      draw={(context, width, height) =>
        drawPhrases(context, width, height, series.phrases, duration, t("emptyPhrases"))
      }
    />
  )
}

function Stats({ dimension, series }: { dimension: DimensionScore; series: ScoreSeries }) {
  const { t } = usePreferences()
  const items = statsFor(dimension.id, series, t)
  return (
    <dl className="grid grid-cols-3 gap-2">
      {items.map((item) => (
        <div key={item.label} className="rounded-lg bg-white/5 px-2 py-1.5">
          <dt className="font-mono text-[10px] tracking-[0.14em] text-cyan-200/70 uppercase">{item.label}</dt>
          <dd className="font-mono text-sm tabular-nums">{item.value}</dd>
        </div>
      ))}
    </dl>
  )
}

function statsFor(
  id: DimensionScore["id"],
  series: ScoreSeries,
  t: ReturnType<typeof usePreferences>["t"],
): { label: string; value: string }[] {
  if (id === "intonation") {
    const errors = series.intonation.map((point) => Math.abs(point.cents))
    const inTune = errors.filter((error) => error <= 30).length
    const sharp = series.intonation.filter((point) => point.cents > 10).length
    return [
      { label: t("statInTune"), value: percent(inTune, errors.length) },
      { label: t("statMedian"), value: t("cents", { n: median(errors).toFixed(0) }) },
      { label: t("statSharp"), value: percent(sharp, series.intonation.length) },
    ]
  }
  if (id === "stability") {
    const spreads = series.stability.map((note) => note.spread)
    const lengths = series.stability.map((note) => note.end - note.start)
    return [
      { label: t("statNotes"), value: String(series.stability.length) },
      { label: t("statMedianSpread"), value: t("cents", { n: median(spreads).toFixed(0) }) },
      { label: t("statLongest"), value: t("seconds", { n: Math.max(0, ...lengths).toFixed(1) }) },
    ]
  }
  if (id === "tone") {
    const levels = series.tone.map((point) => point.hnrDb)
    if (levels.length === 0) {
      return [
        { label: t("statMedian"), value: "—" },
        { label: t("statQuiet"), value: "—" },
        { label: t("statLoud"), value: "—" },
      ]
    }
    return [
      { label: t("statMedian"), value: t("db", { n: median(levels).toFixed(0) }) },
      { label: t("statQuiet"), value: t("db", { n: Math.min(...levels).toFixed(0) }) },
      { label: t("statLoud"), value: t("db", { n: Math.max(...levels).toFixed(0) }) },
    ]
  }
  if (id === "dynamics") {
    const levels = series.dynamics.map((point) => point.db)
    if (levels.length === 0) {
      return [
        { label: t("statRange"), value: "—" },
        { label: t("statQuiet"), value: "—" },
        { label: t("statLoud"), value: "—" },
      ]
    }
    const quiet = percentile(levels, 0.05)
    const loud = percentile(levels, 0.95)
    return [
      { label: t("statRange"), value: t("db", { n: (loud - quiet).toFixed(1) }) },
      { label: t("statQuiet"), value: t("db", { n: quiet.toFixed(0) }) },
      { label: t("statLoud"), value: t("db", { n: loud.toFixed(0) }) },
    ]
  }
  const lengths = series.phrases.map((phrase) => phrase.end - phrase.start)
  return [
    { label: t("statPhrases"), value: String(series.phrases.length) },
    { label: t("statMedian"), value: t("seconds", { n: median(lengths).toFixed(1) }) },
    { label: t("statLongest"), value: t("seconds", { n: Math.max(0, ...lengths).toFixed(1) }) },
  ]
}

function ChartCanvas({
  label,
  draw,
}: {
  label: string
  draw: (context: CanvasRenderingContext2D, width: number, height: number) => void
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const drawRef = useRef(draw)
  drawRef.current = draw

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const context = canvas.getContext("2d")
    if (!context) return
    const paint = () => {
      const width = canvas.clientWidth
      const height = canvas.clientHeight
      if (width < 2 || height < 2) return
      const ratio = window.devicePixelRatio || 1
      const nextWidth = Math.floor(width * ratio)
      const nextHeight = Math.floor(height * ratio)
      if (canvas.width !== nextWidth || canvas.height !== nextHeight) {
        canvas.width = nextWidth
        canvas.height = nextHeight
      }
      context.setTransform(ratio, 0, 0, ratio, 0, 0)
      drawRef.current(context, width, height)
    }
    paint()
    const observer = new ResizeObserver(paint)
    observer.observe(canvas)
    return () => observer.disconnect()
  }, [draw])

  return (
    <canvas
      ref={canvasRef}
      className="h-48 w-full rounded-xl border border-white/10"
      role="img"
      aria-label={label}
    />
  )
}

function paintFrame(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
): { left: number; right: number; top: number; bottom: number; plotWidth: number; plotHeight: number } {
  context.clearRect(0, 0, width, height)
  context.fillStyle = "rgba(4, 8, 16, 0.72)"
  context.fillRect(0, 0, width, height)
  return {
    left: 42,
    right: width - 12,
    top: 14,
    bottom: height - 22,
    plotWidth: width - 54,
    plotHeight: height - 36,
  }
}

function labelAxis(context: CanvasRenderingContext2D, text: string, x: number, y: number) {
  context.fillStyle = "rgba(148, 163, 184, 0.9)"
  context.font = "11px 'Geist Mono Variable', ui-monospace, monospace"
  context.fillText(text, x, y)
}

function drawIntonation(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  points: ScoreSeries["intonation"],
  duration: number,
  empty: string,
) {
  const frame = paintFrame(context, width, height)
  if (points.length === 0) {
    labelAxis(context, empty, frame.left, height / 2)
    return
  }
  const peak = Math.max(40, ...points.map((point) => Math.abs(point.cents)))
  const limit = Math.min(120, Math.ceil(peak / 10) * 10)
  const yOf = (cents: number) => frame.top + ((limit - cents) / (limit * 2)) * frame.plotHeight
  const xOf = (time: number) => frame.left + (time / Math.max(duration, 0.001)) * frame.plotWidth
  context.fillStyle = "rgba(103, 232, 249, 0.14)"
  context.fillRect(frame.left, yOf(30), frame.plotWidth, yOf(-30) - yOf(30))
  context.strokeStyle = "rgba(255,255,255,0.28)"
  context.beginPath()
  context.moveTo(frame.left, yOf(0))
  context.lineTo(frame.right, yOf(0))
  context.stroke()
  for (const tick of [limit, 0, -limit]) {
    labelAxis(context, tick > 0 ? `+${tick}` : String(tick), 4, yOf(tick) + 4)
  }
  context.strokeStyle = "#67e8f9"
  context.lineWidth = 1.6
  context.beginPath()
  points.forEach((point, index) => {
    const x = xOf(point.time)
    const y = yOf(Math.max(-limit, Math.min(limit, point.cents)))
    if (index === 0) context.moveTo(x, y)
    else context.lineTo(x, y)
  })
  context.stroke()
}

function drawStability(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  notes: ScoreSeries["stability"],
  empty: string,
) {
  const frame = paintFrame(context, width, height)
  if (notes.length === 0) {
    labelAxis(context, empty, frame.left, height / 2)
    return
  }
  const peak = Math.max(20, ...notes.map((note) => note.spread))
  const limit = Math.ceil(peak / 5) * 5
  const yOf = (spread: number) => frame.bottom - (spread / limit) * frame.plotHeight
  const gap = frame.plotWidth / notes.length
  context.strokeStyle = "rgba(255,255,255,0.28)"
  context.setLineDash([3, 3])
  context.beginPath()
  context.moveTo(frame.left, yOf(15))
  context.lineTo(frame.right, yOf(15))
  context.stroke()
  context.setLineDash([])
  labelAxis(context, "15", 8, yOf(15) + 4)
  labelAxis(context, String(limit), 4, yOf(limit) + 4)
  notes.forEach((note, index) => {
    const x = frame.left + index * gap + gap * 0.15
    const barWidth = Math.max(1, gap * 0.7)
    const y = yOf(note.spread)
    context.fillStyle = note.spread <= 15 ? "#67e8f9" : "rgba(103, 232, 249, 0.45)"
    context.fillRect(x, y, barWidth, frame.bottom - y)
  })
}

function drawTone(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  points: ScoreSeries["tone"],
  duration: number,
  empty: string,
) {
  const frame = paintFrame(context, width, height)
  if (points.length === 0) {
    labelAxis(context, empty, frame.left, height / 2)
    return
  }
  const low = Math.min(0, ...points.map((point) => point.hnrDb))
  const high = Math.max(20, ...points.map((point) => point.hnrDb))
  const yOf = (value: number) => frame.bottom - ((value - low) / (high - low)) * frame.plotHeight
  const xOf = (time: number) => frame.left + (time / Math.max(duration, 0.001)) * frame.plotWidth
  context.strokeStyle = "rgba(255,255,255,0.28)"
  context.setLineDash([3, 3])
  context.beginPath()
  context.moveTo(frame.left, yOf(12))
  context.lineTo(frame.right, yOf(12))
  context.stroke()
  context.setLineDash([])
  labelAxis(context, `${Math.round(high)}`, 4, yOf(high) + 10)
  labelAxis(context, "12", 8, yOf(12) + 4)
  context.strokeStyle = "#67e8f9"
  context.lineWidth = 1.6
  context.beginPath()
  points.forEach((point, index) => {
    const x = xOf(point.time)
    const y = yOf(point.hnrDb)
    if (index === 0) context.moveTo(x, y)
    else context.lineTo(x, y)
  })
  context.stroke()
}

function drawDynamics(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  points: ScoreSeries["dynamics"],
  duration: number,
  empty: string,
) {
  const frame = paintFrame(context, width, height)
  if (points.length === 0) {
    labelAxis(context, empty, frame.left, height / 2)
    return
  }
  const levels = points.map((point) => point.db)
  const quiet = percentile(levels, 0.05)
  const loud = percentile(levels, 0.95)
  const low = Math.min(...levels) - 2
  const high = Math.max(...levels) + 2
  const yOf = (value: number) => frame.bottom - ((value - low) / (high - low)) * frame.plotHeight
  const xOf = (time: number) => frame.left + (time / Math.max(duration, 0.001)) * frame.plotWidth
  context.strokeStyle = "rgba(255,255,255,0.28)"
  context.setLineDash([3, 3])
  for (const guide of [quiet, loud]) {
    context.beginPath()
    context.moveTo(frame.left, yOf(guide))
    context.lineTo(frame.right, yOf(guide))
    context.stroke()
    labelAxis(context, `${guide.toFixed(0)}`, 4, yOf(guide) + 4)
  }
  context.setLineDash([])
  context.strokeStyle = "#67e8f9"
  context.lineWidth = 1.6
  context.beginPath()
  points.forEach((point, index) => {
    const x = xOf(point.time)
    const y = yOf(point.db)
    if (index === 0) context.moveTo(x, y)
    else context.lineTo(x, y)
  })
  context.stroke()
}

function drawPhrases(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  phrases: ScoreSeries["phrases"],
  duration: number,
  empty: string,
) {
  const frame = paintFrame(context, width, height)
  if (phrases.length === 0) {
    labelAxis(context, empty, frame.left, height / 2)
    return
  }
  const span = Math.max(duration, 0.001)
  const xOf = (time: number) => frame.left + (time / span) * frame.plotWidth
  const barTop = frame.top + frame.plotHeight * 0.28
  const barHeight = frame.plotHeight * 0.44
  context.strokeStyle = "rgba(103, 232, 249, 0.2)"
  context.beginPath()
  context.moveTo(frame.left, barTop + barHeight / 2)
  context.lineTo(frame.right, barTop + barHeight / 2)
  context.stroke()
  for (const phrase of phrases) {
    const length = phrase.end - phrase.start
    const useful = length >= 0.8 && length <= 8
    const x = xOf(phrase.start)
    const barWidth = Math.max(2, xOf(phrase.end) - x)
    context.fillStyle = useful ? "#67e8f9" : "rgba(103, 232, 249, 0.35)"
    context.fillRect(x, barTop, barWidth, barHeight)
    if (barWidth > 36) {
      context.fillStyle = useful ? "#082028" : "rgba(226, 232, 240, 0.9)"
      context.font = "11px 'Geist Mono Variable', ui-monospace, monospace"
      context.fillText(`${length.toFixed(1)}s`, x + 4, barTop + barHeight / 2 + 4)
    }
  }
  labelAxis(context, "0s", frame.left, frame.bottom + 14)
  labelAxis(context, `${span.toFixed(0)}s`, frame.right - 24, frame.bottom + 14)
}

function median(values: number[]): number {
  if (values.length === 0) return 0
  const sorted = [...values].sort((left, right) => left - right)
  const mid = Math.floor(sorted.length / 2)
  if (sorted.length % 2 === 0) return ((sorted[mid - 1] ?? 0) + (sorted[mid] ?? 0)) / 2
  return sorted[mid] ?? 0
}

function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0
  const sorted = [...values].sort((left, right) => left - right)
  const index = (sorted.length - 1) * p
  const low = Math.floor(index)
  const high = Math.ceil(index)
  if (low === high) return sorted[low] ?? 0
  const weight = index - low
  return (sorted[low] ?? 0) * (1 - weight) + (sorted[high] ?? 0) * weight
}

function percent(count: number, total: number): string {
  if (total === 0) return "0%"
  return `${Math.round((count / total) * 100)}%`
}
