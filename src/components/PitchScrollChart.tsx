import { useEffect, useRef, useState } from "react"
import { usePreferences } from "@/lib/preferences"
import type { NoteLevel, PitchFrame } from "@/lib/audio/types"

const NOTE_NAMES = ["C", "C#", "D", "Eb", "E", "F", "F#", "G", "Ab", "A", "Bb", "B"]
const SEMITONE = 22
const PIXELS_PER_SECOND = 260
const AXIS_WIDTH = 46

type PitchScrollChartProps = {
  contour: PitchFrame[]
  notes: NoteLevel[]
  duration: number
}

export function PitchScrollChart({ contour, notes, duration }: PitchScrollChartProps) {
  const { locale, t } = usePreferences()
  const scrollerRef = useRef<HTMLDivElement>(null)
  const axisRef = useRef<HTMLCanvasElement>(null)
  const plotRef = useRef<HTMLCanvasElement>(null)
  const [viewWidth, setViewWidth] = useState(0)

  useEffect(() => {
    const scroller = scrollerRef.current
    if (!scroller) return
    const measure = () => setViewWidth(scroller.clientWidth)
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(scroller)
    return () => observer.disconnect()
  }, [])

  const range = pitchRange(contour, notes)
  const plotHeight = Math.max(1, range.maxMidi - range.minMidi) * SEMITONE
  const height = plotHeight + 40
  const chartWidth = Math.max(viewWidth, duration * PIXELS_PER_SECOND)

  useEffect(() => {
    const axis = axisRef.current
    const plot = plotRef.current
    if (!axis || !plot || viewWidth < 2) return
    const axisContext = axis.getContext("2d")
    const plotContext = plot.getContext("2d")
    if (!axisContext || !plotContext) return
    paintCanvas(axis, axisContext, AXIS_WIDTH, height)
    paintCanvas(plot, plotContext, chartWidth, height)
    drawAxis(axisContext, height, range)
    drawPlot(plotContext, chartWidth, height, range, contour, notes, duration, t("emptyPitch"))
  }, [chartWidth, contour, duration, height, locale, notes, range, t, viewWidth])

  return (
    <div className="flex overflow-hidden rounded-xl border border-white/10">
      <canvas ref={axisRef} className="shrink-0" style={{ width: AXIS_WIDTH, height }} />
      <div ref={scrollerRef} className="min-w-0 flex-1 overflow-x-auto">
        <canvas
          ref={plotRef}
          role="img"
          aria-label={t("pitchScrollAria")}
          style={{ width: chartWidth, height }}
        />
      </div>
    </div>
  )
}

function hzToMidi(hz: number): number {
  return 69 + 12 * Math.log2(hz / 440)
}

function noteName(midi: number): string {
  const rounded = Math.round(midi)
  const pitchClass = ((rounded % 12) + 12) % 12
  const octave = Math.floor(rounded / 12) - 1
  return `${NOTE_NAMES[pitchClass] ?? "C"}${octave}`
}

function pitchRange(contour: PitchFrame[], notes: NoteLevel[]): { minMidi: number; maxMidi: number } {
  const midis = [
    ...contour.flatMap((frame) => (frame.hz == null ? [] : [hzToMidi(frame.hz)])),
    ...notes.map((note) => hzToMidi(note.targetHz)),
  ]
  if (midis.length === 0) return { minMidi: 55, maxMidi: 67 }
  let minMidi = Math.floor(Math.min(...midis)) - 2
  let maxMidi = Math.ceil(Math.max(...midis)) + 2
  if (maxMidi - minMidi < 12) {
    const center = (minMidi + maxMidi) / 2
    minMidi = Math.floor(center - 6)
    maxMidi = minMidi + 12
  }
  return { minMidi, maxMidi }
}

function paintCanvas(
  canvas: HTMLCanvasElement,
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
) {
  const ratio = window.devicePixelRatio || 1
  const nextWidth = Math.floor(width * ratio)
  const nextHeight = Math.floor(height * ratio)
  if (canvas.width !== nextWidth || canvas.height !== nextHeight) {
    canvas.width = nextWidth
    canvas.height = nextHeight
  }
  context.setTransform(ratio, 0, 0, ratio, 0, 0)
  context.clearRect(0, 0, width, height)
  context.fillStyle = "rgba(4, 8, 16, 0.72)"
  context.fillRect(0, 0, width, height)
}

function yOf(midi: number, range: { minMidi: number; maxMidi: number }, height: number): number {
  const top = 12
  const plotHeight = height - 40
  const span = Math.max(range.maxMidi - range.minMidi, 1)
  return top + ((range.maxMidi - midi) / span) * plotHeight
}

function drawAxis(
  context: CanvasRenderingContext2D,
  height: number,
  range: { minMidi: number; maxMidi: number },
) {
  context.fillStyle = "rgba(148, 163, 184, 0.9)"
  context.font = "11px 'Geist Mono Variable', ui-monospace, monospace"
  for (let midi = range.minMidi; midi <= range.maxMidi; midi++) {
    context.fillText(noteName(midi), 4, yOf(midi, range, height) + 4)
  }
}

function drawPlot(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  range: { minMidi: number; maxMidi: number },
  contour: PitchFrame[],
  notes: NoteLevel[],
  duration: number,
  empty: string,
) {
  const left = 8
  const right = width - 12
  const span = Math.max(duration, 0.001)
  const xOf = (time: number) => left + (time / span) * (right - left)
  const pitched = contour.some((frame) => frame.hz != null)

  context.strokeStyle = "rgba(103, 232, 249, 0.14)"
  context.lineWidth = 1
  for (let midi = range.minMidi; midi <= range.maxMidi; midi++) {
    const y = yOf(midi, range, height)
    context.beginPath()
    context.moveTo(left, y)
    context.lineTo(right, y)
    context.stroke()
  }

  if (!pitched) {
    context.fillStyle = "rgba(148, 163, 184, 0.9)"
    context.font = "11px 'Geist Mono Variable', ui-monospace, monospace"
    context.fillText(empty, left, height / 2)
    return
  }

  for (const note of notes) {
    const target = hzToMidi(note.targetHz)
    const y = yOf(target, range, height)
    const band = yOf(target - 0.3, range, height) - yOf(target + 0.3, range, height)
    context.fillStyle = "rgba(253, 230, 138, 0.16)"
    context.fillRect(xOf(note.start), yOf(target + 0.3, range, height), Math.max(2, xOf(note.end) - xOf(note.start)), band)
    context.strokeStyle = "rgba(253, 230, 138, 0.95)"
    context.lineWidth = 2
    context.beginPath()
    context.moveTo(xOf(note.start), y)
    context.lineTo(xOf(note.end), y)
    context.stroke()
  }

  context.strokeStyle = "#67e8f9"
  context.lineWidth = 1.8
  context.beginPath()
  let drawing = false
  for (let i = 0; i < contour.length; i++) {
    const frame = contour[i]
    const previous = contour[i - 1]
    if (!frame || frame.hz == null) {
      drawing = false
      continue
    }
    const broken = !previous || previous.hz == null || frame.time - previous.time > 0.08
    const x = xOf(frame.time)
    const y = yOf(hzToMidi(frame.hz), range, height)
    if (!drawing || broken) {
      context.moveTo(x, y)
      drawing = true
    } else {
      context.lineTo(x, y)
    }
  }
  context.stroke()

  context.fillStyle = "rgba(148, 163, 184, 0.9)"
  context.font = "11px 'Geist Mono Variable', ui-monospace, monospace"
  const seconds = Math.ceil(duration)
  for (let second = 0; second <= seconds; second++) {
    context.fillText(`${second}s`, xOf(second), height - 8)
  }
}
