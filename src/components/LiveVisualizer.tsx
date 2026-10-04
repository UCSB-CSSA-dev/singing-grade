import { useEffect, useRef, type RefObject } from "react"
import { usePreferences } from "@/lib/preferences"

type LiveVisualizerProps = {
  analyser: AnalyserNode | null
  active: boolean
  playing: boolean
  playheadRef: RefObject<number | null>
  samples: Float32Array | null
}

const BAR_WIDTH = 3
const BAR_GAP = 2
const BAR_STEP = BAR_WIDTH + BAR_GAP
const PLAYED = "#67e8f9"
const UPCOMING = "rgba(103, 232, 249, 0.32)"

export function LiveVisualizer({
  analyser,
  active,
  playing,
  playheadRef,
  samples,
}: LiveVisualizerProps) {
  const { t } = usePreferences()
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const levelRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const context = canvas.getContext("2d")
    if (!context) return

    let frame = 0
    const timeDomain = analyser ? new Uint8Array(analyser.fftSize) : null
    const livePeaks: number[] = []
    let lastPeakAt = 0
    let fitted: number[] = []
    let fittedKey = ""

    const draw = () => {
      const width = canvas.clientWidth
      const height = canvas.clientHeight
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
      context.strokeStyle = "rgba(255,255,255,0.08)"
      context.beginPath()
      context.moveTo(0, height / 2)
      context.lineTo(width, height / 2)
      context.stroke()

      if (active && analyser && timeDomain) {
        analyser.getByteTimeDomainData(timeDomain)
        let energy = 0
        let peak = 0
        for (let i = 0; i < timeDomain.length; i++) {
          const sample = Math.abs(((timeDomain[i] ?? 128) - 128) / 128)
          energy += sample * sample
          if (sample > peak) peak = sample
        }
        const now = performance.now()
        if (lastPeakAt === 0 || now - lastPeakAt >= 48) {
          livePeaks.push(peak)
          lastPeakAt = now
        }
        drawBars(context, width, height, livePeaks, null, false)
        if (levelRef.current) {
          levelRef.current.style.width = `${Math.min(100, Math.sqrt(energy / timeDomain.length) * 220)}%`
        }
      } else if (samples && samples.length > 1) {
        const barCount = Math.max(1, Math.floor(width / BAR_STEP))
        const key = `${samples.length}:${barCount}`
        if (fittedKey !== key) {
          fittedKey = key
          fitted = peaksFromSamples(samples, barCount)
        }
        drawBars(context, width, height, fitted, playing ? playheadRef.current : null, true)
        if (levelRef.current) levelRef.current.style.width = "0%"
      } else if (levelRef.current) {
        levelRef.current.style.width = "0%"
      }

      if (active || playing) frame = requestAnimationFrame(draw)
    }

    draw()
    return () => cancelAnimationFrame(frame)
  }, [active, analyser, playing, playheadRef, samples])

  return (
    <div className="space-y-3">
      <canvas
        ref={canvasRef}
        className="h-40 w-full rounded-xl border border-white/10"
        role="img"
        aria-label={active ? t("recordingWave") : playing ? t("playingWave") : t("recordedWave")}
      />
      <div className="flex items-center gap-3">
        <span className="min-w-12 font-mono text-[10px] tracking-[0.16em] text-cyan-200/70">
          {t("level")}
        </span>
        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/10">
          <div ref={levelRef} className="h-full w-0 rounded-full bg-cyan-300" />
        </div>
        <span className="font-mono text-[10px] tracking-[0.16em] text-muted-foreground">
          {active ? t("live") : playing ? t("playMark") : samples ? t("takeMark") : t("idle")}
        </span>
      </div>
    </div>
  )
}

function peaksFromSamples(samples: Float32Array, barCount: number): number[] {
  const peaks = new Array<number>(barCount)
  for (let bar = 0; bar < barCount; bar++) {
    const start = Math.floor((bar / barCount) * samples.length)
    const end = Math.max(start + 1, Math.floor(((bar + 1) / barCount) * samples.length))
    let peak = 0
    for (let index = start; index < end; index++) {
      const sample = Math.abs(samples[index] ?? 0)
      if (sample > peak) peak = sample
    }
    peaks[bar] = peak
  }
  return peaks
}

function drawBars(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  peaks: number[],
  progress: number | null,
  fit: boolean,
) {
  if (peaks.length === 0) return
  const visible = Math.max(1, Math.floor(width / BAR_STEP))
  const slice = fit ? peaks : peaks.slice(Math.max(0, peaks.length - visible))
  const slot = fit ? width / slice.length : BAR_STEP
  const barWidth = fit ? Math.max(2, slot - BAR_GAP) : BAR_WIDTH
  const mid = height / 2
  const maxHeight = height * 0.84

  slice.forEach((peak, index) => {
    const x = fit ? index * slot : index * BAR_STEP
    const amplitude = Math.max(0.045, Math.min(1, peak))
    const barHeight = Math.max(2, amplitude * maxHeight)
    const center = x + barWidth / 2
    const played = progress == null || center / width <= progress
    context.fillStyle = played ? PLAYED : UPCOMING
    context.beginPath()
    context.roundRect(x, mid - barHeight / 2, barWidth, barHeight, 1.5)
    context.fill()
  })

  if (progress == null || !fit) return
  const playhead = Math.max(0, Math.min(1, progress)) * width
  context.strokeStyle = "#ffffff"
  context.lineWidth = 1.5
  context.beginPath()
  context.moveTo(playhead, 8)
  context.lineTo(playhead, height - 8)
  context.stroke()
}
