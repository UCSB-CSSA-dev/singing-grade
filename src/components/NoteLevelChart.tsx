import { useEffect, useRef, useState } from "react"
import { usePreferences } from "@/lib/preferences"
import type { NoteLevel } from "@/lib/audio/types"

export function NoteLevelChart({ notes }: { notes: NoteLevel[] }) {
  const { locale, t } = usePreferences()
  const wrapRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [width, setWidth] = useState(0)

  useEffect(() => {
    const wrap = wrapRef.current
    if (!wrap) return
    const measure = () => setWidth(wrap.clientWidth)
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(wrap)
    return () => observer.disconnect()
  }, [])

  const chartWidth = Math.max(width, notes.length * 56)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || width < 2) return
    const context = canvas.getContext("2d")
    if (!context) return
    const height = canvas.clientHeight
    const ratio = window.devicePixelRatio || 1
    const nextWidth = Math.floor(chartWidth * ratio)
    const nextHeight = Math.floor(height * ratio)
    if (canvas.width !== nextWidth || canvas.height !== nextHeight) {
      canvas.width = nextWidth
      canvas.height = nextHeight
    }
    context.setTransform(ratio, 0, 0, ratio, 0, 0)
    drawNotes(context, chartWidth, height, notes, t("correct"), t("emptyNotes"))
  }, [chartWidth, locale, notes, t, width])

  return (
    <div ref={wrapRef} className="overflow-x-auto rounded-xl border border-white/10">
      <canvas
        ref={canvasRef}
        className="h-56"
        style={{ width: chartWidth }}
        role="img"
        aria-label={t("noteChartAria")}
      />
    </div>
  )
}

function drawNotes(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  notes: NoteLevel[],
  correct: string,
  empty: string,
) {
  context.clearRect(0, 0, width, height)
  context.fillStyle = "rgba(4, 8, 16, 0.72)"
  context.fillRect(0, 0, width, height)

  const left = 52
  const right = width - 12
  const top = 16
  const bottom = height - 36
  const plotHeight = bottom - top

  if (notes.length === 0) {
    context.fillStyle = "rgba(148, 163, 184, 0.9)"
    context.font = "11px 'Geist Mono Variable', ui-monospace, monospace"
    context.fillText(empty, left, height / 2)
    return
  }

  const peak = Math.max(50, ...notes.map((note) => Math.abs(note.cents)))
  const limit = Math.min(200, Math.ceil(peak / 10) * 10)
  const yOf = (cents: number) => top + ((limit - cents) / (limit * 2)) * plotHeight
  const column = (right - left) / notes.length

  context.fillStyle = "rgba(103, 232, 249, 0.12)"
  context.fillRect(left, yOf(30), right - left, yOf(-30) - yOf(30))

  context.strokeStyle = "rgba(255,255,255,0.35)"
  context.lineWidth = 1
  context.beginPath()
  context.moveTo(left, yOf(0))
  context.lineTo(right, yOf(0))
  context.stroke()

  context.fillStyle = "rgba(148, 163, 184, 0.9)"
  context.font = "11px 'Geist Mono Variable', ui-monospace, monospace"
  context.fillText(`+${limit}`, 4, yOf(limit) + 4)
  context.fillText(correct, 4, yOf(0) + 4)
  context.fillText(`-${limit}`, 4, yOf(-limit) + 4)

  notes.forEach((note, index) => {
    const cents = Math.max(-limit, Math.min(limit, note.cents))
    const x = left + index * column + column * 0.22
    const barWidth = Math.max(8, column * 0.56)
    const y = yOf(cents)
    const zero = yOf(0)
    const inTune = Math.abs(note.cents) <= 30
    context.fillStyle = inTune ? "#67e8f9" : "rgba(253, 230, 138, 0.92)"
    context.fillRect(x, Math.min(y, zero), barWidth, Math.max(2, Math.abs(zero - y)))

    context.font = "11px 'Geist Mono Variable', ui-monospace, monospace"
    const label = `${note.cents > 0 ? "+" : ""}${note.cents.toFixed(0)}`
    if (note.cents < -8) {
      context.fillStyle = "#082028"
      context.fillText(label, x + 4, Math.max(zero + 16, Math.min(y - 8, bottom - 8)))
    } else {
      context.fillStyle = "rgba(226, 232, 240, 0.92)"
      context.fillText(label, x, Math.max(top + 12, (cents >= 0 ? y : zero) - 10))
    }
    context.fillStyle = "rgba(226, 232, 240, 0.92)"
    context.fillText(note.name, x, bottom + 18)
  })
}
