import { useEffect, useRef, useState } from "react"
import { X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { playRaw, type PlaybackHandle } from "@/lib/audio/playback"
import { isMicDenied, startMicTest, type MicTestHandle } from "@/lib/audio/recorder"
import { MIC_GAIN_MAX, MIC_GAIN_MIN, usePreferences } from "@/lib/preferences"

type SettingsDialogProps = {
  open: boolean
  busy: boolean
  onClose: () => void
}

export function SettingsDialog({ open, busy, onClose }: SettingsDialogProps) {
  const { locale, micGain, liveMode, setLocale, setMicGain, setLiveMode, t } = usePreferences()
  const [testing, setTesting] = useState(false)
  const [level, setLevel] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const testRef = useRef<MicTestHandle | null>(null)
  const playbackRef = useRef<PlaybackHandle | null>(null)
  const panelRef = useRef<HTMLDivElement>(null)

  const releaseTest = () => {
    testRef.current?.close()
    testRef.current = null
    setTesting(false)
    setLevel(0)
  }

  useEffect(() => {
    if (!open) return
    panelRef.current?.focus()
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [onClose, open])

  useEffect(() => {
    return () => {
      playbackRef.current?.stop()
      testRef.current?.close()
    }
  }, [])

  useEffect(() => {
    testRef.current?.setGain(micGain)
  }, [micGain])

  useEffect(() => {
    if (open) return
    testRef.current?.close()
    testRef.current = null
    setTesting(false)
    setLevel(0)
  }, [open])

  useEffect(() => {
    if (!testing) return
    const timer = window.setTimeout(() => {
      const handle = testRef.current
      if (!handle) return
      testRef.current = null
      setTesting(false)
      setLevel(0)
      const clip = handle.stop()
      if (clip.samples.length / clip.sampleRate < 0.25) return
      void playRaw(clip, () => {
        playbackRef.current = null
      }).then((playback) => {
        playbackRef.current = playback
      })
    }, 8000)
    return () => window.clearTimeout(timer)
  }, [testing])

  useEffect(() => {
    if (!testing) return
    const analyser = testRef.current?.analyser
    if (!analyser) return
    const data = new Float32Array(analyser.fftSize)
    let frame = 0
    const tick = () => {
      analyser.getFloatTimeDomainData(data)
      let peak = 0
      for (let i = 0; i < data.length; i++) {
        const value = Math.abs(data[i] ?? 0)
        if (value > peak) peak = value
      }
      setLevel(Math.min(1, peak))
      frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [testing])

  if (!open) return null

  const finishTest = async () => {
    const handle = testRef.current
    testRef.current = null
    setTesting(false)
    setLevel(0)
    if (!handle) return
    const clip = handle.stop()
    if (clip.samples.length / clip.sampleRate < 0.25) return
    playbackRef.current?.stop()
    playbackRef.current = await playRaw(clip, () => {
      playbackRef.current = null
    })
  }

  const onTest = async () => {
    setError(null)
    if (testing) {
      await finishTest()
      return
    }
    playbackRef.current?.stop()
    try {
      testRef.current = await startMicTest(micGain)
      setTesting(true)
    } catch (caught) {
      setError(isMicDenied(caught) ? t("micDenied") : t("micFailed"))
    }
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center px-4">
      <button
        type="button"
        className="absolute inset-0 bg-black/60"
        aria-label={t("close")}
        onClick={() => {
          releaseTest()
          onClose()
        }}
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="settings-title"
        tabIndex={-1}
        className="relative z-10 w-full max-w-md rounded-xl border border-white/10 bg-card p-5 shadow-[0_24px_80px_rgba(0,0,0,0.45)] outline-none"
      >
        <div className="flex items-start justify-between gap-3">
          <h2 id="settings-title" className="text-lg font-semibold">
            {t("settings")}
          </h2>
          <Button
            variant="ghost"
            size="icon"
            aria-label={t("close")}
            onClick={() => {
              releaseTest()
              onClose()
            }}
          >
            <X />
          </Button>
        </div>

        <div className="mt-5 flex items-start justify-between gap-4">
          <div className="space-y-1">
            <p className="text-sm font-medium">{t("liveMode")}</p>
            <p className="text-xs leading-5 text-muted-foreground">{t("liveModeHint")}</p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={liveMode}
            aria-label={t("liveMode")}
            className={`relative mt-0.5 h-6 w-11 shrink-0 rounded-full border transition-colors ${liveMode ? "border-cyan-300 bg-cyan-300" : "border-white/25 bg-white/10"}`}
            onClick={() => setLiveMode(!liveMode)}
          >
            <span
              className={`absolute top-0.5 left-0.5 size-5 rounded-full bg-white shadow-sm transition-transform ${liveMode ? "translate-x-5" : "translate-x-0"}`}
            />
          </button>
        </div>

        <div className="mt-6 space-y-2">
          <p className="text-sm font-medium">{t("language")}</p>
          <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label={t("language")}>
            <Button
              type="button"
              role="radio"
              aria-checked={locale === "en"}
              variant={locale === "en" ? "default" : "outline"}
              onClick={() => setLocale("en")}
            >
              English
            </Button>
            <Button
              type="button"
              role="radio"
              aria-checked={locale === "zh"}
              variant={locale === "zh" ? "default" : "outline"}
              onClick={() => setLocale("zh")}
            >
              中文
            </Button>
          </div>
        </div>

        <div className="mt-6 space-y-3">
          <div className="flex items-baseline justify-between gap-3">
            <p className="text-sm font-medium">{t("micLevel")}</p>
            <p className="font-mono text-sm tabular-nums text-cyan-100">{micGain.toFixed(1)}×</p>
          </div>
          <input
            type="range"
            min={MIC_GAIN_MIN}
            max={MIC_GAIN_MAX}
            step={0.5}
            value={micGain}
            aria-label={t("micLevel")}
            aria-valuetext={`${micGain.toFixed(1)}×`}
            className="h-2 w-full cursor-pointer accent-cyan-300"
            onChange={(event) => setMicGain(Number(event.target.value))}
          />
          <p className="text-xs leading-5 text-muted-foreground">{t("micLevelHint")}</p>
          <div className="flex items-center gap-3">
            <Button type="button" variant="outline" disabled={busy} onClick={() => void onTest()}>
              {testing ? t("stopTest") : t("testMic")}
            </Button>
            <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/10">
              <div
                className="h-full rounded-full bg-cyan-300"
                style={{ width: `${Math.round(level * 100)}%` }}
              />
            </div>
            <span className="w-10 text-right font-mono text-xs tabular-nums">
              {testing ? Math.round(level * 100) : ""}
            </span>
          </div>
          {testing ? <p className="font-mono text-xs text-cyan-200/80">{t("listening")}</p> : null}
          {testing && level > 0.98 ? (
            <p className="text-sm text-destructive">{t("clipping")}</p>
          ) : null}
          {busy ? <p className="text-sm text-muted-foreground">{t("testDisabled")}</p> : null}
          {error ? (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          ) : null}
        </div>
      </div>
    </div>
  )
}
