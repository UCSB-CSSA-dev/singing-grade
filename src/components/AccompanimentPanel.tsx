import { forwardRef, useEffect, useImperativeHandle, useLayoutEffect, useRef, useState } from "react"
import { createPortal } from "react-dom"
import { X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { youtubeVideoId } from "@/lib/audio/youtube"
import { usePreferences } from "@/lib/preferences"

export type AccompanimentPlayer = {
  play: () => void
  pause: () => void
  arm: () => void
  currentTime: () => number
  active: () => boolean
}

type AccompanimentPanelProps = {
  audioName: string | null
  offsetSeconds: number
  onAudio: (file: File) => void
  onClearAudio: () => void
  onAlign: (seconds: number) => void
  onClose?: () => void
  liveMode?: boolean
}

function sendPlayer(frame: HTMLIFrameElement | null, func: string, args: Array<string | number | boolean> = []) {
  if (!frame?.contentWindow) return
  frame.contentWindow.postMessage(
    JSON.stringify({ event: "command", func, args, id: frame.id, channel: "widget" }),
    "*",
  )
}

function listenToPlayer(frame: HTMLIFrameElement | null) {
  if (!frame) return
  frame.contentWindow?.postMessage(
    JSON.stringify({ event: "listening", id: frame.id, channel: "widget" }),
    "*",
  )
}

function messagePayload(data: unknown): { event?: unknown; info?: unknown } | null {
  let payload = data
  if (typeof data === "string") {
    try {
      payload = JSON.parse(data) as unknown
    } catch {
      return null
    }
  }
  if (typeof payload !== "object" || payload === null) return null
  return payload as { event?: unknown; info?: unknown }
}

function currentTimeFrom(data: unknown): number | null {
  const payload = messagePayload(data)
  if (!payload || !("info" in payload)) return null
  const info = payload.info
  if (typeof info !== "object" || info === null || !("currentTime" in info)) return null
  return typeof info.currentTime === "number" ? info.currentTime : null
}

function playerStateFrom(data: unknown): number | null {
  const payload = messagePayload(data)
  if (!payload) return null
  if (payload.event === "onStateChange" && typeof payload.info === "number") return payload.info
  const info = payload.info
  if (typeof info === "object" && info !== null && "playerState" in info) {
    const state = info.playerState
    return typeof state === "number" ? state : null
  }
  return null
}

function formatClock(seconds: number): string {
  const whole = Math.max(0, Math.floor(seconds))
  const minutes = Math.floor(whole / 60)
  const remain = whole % 60
  return `${minutes}:${remain.toString().padStart(2, "0")}`
}

export const AccompanimentPanel = forwardRef<AccompanimentPlayer, AccompanimentPanelProps>(
  function AccompanimentPanel(
    {
      audioName,
      offsetSeconds,
      onAudio,
      onClearAudio,
      onAlign,
      onClose,
      liveMode = false,
    },
    ref,
  ) {
    const { t } = usePreferences()
    const [draft, setDraft] = useState("")
    const [videoId, setVideoId] = useState<string | null>(null)
    const [invalid, setInvalid] = useState(false)
    const frameRef = useRef<HTMLIFrameElement>(null)
    const fileRef = useRef<HTMLInputElement>(null)
    const timeRef = useRef(0)
    const cueRef = useRef(0)
    const holdRef = useRef(false)
    const holdTimer = useRef<number | null>(null)
    const [frameSlot, setFrameSlot] = useState<{ top: number; height: number; width: number; videoHeight: number } | null>(null)

    const cancelHold = () => {
      holdRef.current = false
      if (holdTimer.current == null) return
      window.clearTimeout(holdTimer.current)
      holdTimer.current = null
    }

    const releaseHold = () => {
      if (!holdRef.current) {
        cancelHold()
        return
      }
      cancelHold()
      const cue = cueRef.current
      timeRef.current = cue
      sendPlayer(frameRef.current, "pauseVideo")
      sendPlayer(frameRef.current, "seekTo", [cue, true])
    }

    useImperativeHandle(
      ref,
      () => ({
        play: () => {
          cancelHold()
          const cue = cueRef.current
          const frame = frameRef.current
          listenToPlayer(frame)
          sendPlayer(frame, "seekTo", [cue, true])
          sendPlayer(frame, "unMute")
          sendPlayer(frame, "playVideo")
        },
        pause: () => {
          cancelHold()
          sendPlayer(frameRef.current, "pauseVideo")
        },
        arm: () => {
          const frame = frameRef.current
          const cue = timeRef.current
          cueRef.current = cue
          cancelHold()
          holdRef.current = true
          listenToPlayer(frame)
          sendPlayer(frame, "mute")
          sendPlayer(frame, "seekTo", [cue, true])
          sendPlayer(frame, "playVideo")
          holdTimer.current = window.setTimeout(releaseHold, 1200)
        },
        currentTime: () => timeRef.current,
        active: () => videoId != null,
      }),
      [videoId],
    )

    const framed = videoId != null

    useLayoutEffect(() => {
      if (!framed) {
        setFrameSlot(null)
        return
      }
      const place = () => {
        const header = document.querySelector("header")
        const footer = document.querySelector("footer")
        if (!header || !footer) return
        const gap = 20
        const top = Math.ceil(header.getBoundingClientRect().bottom + gap)
        const limit = Math.floor(footer.getBoundingClientRect().top - gap)
        const available = Math.max(120, limit - top)
        const maxWidth = Math.min(768, window.innerWidth - 32)
        let width = maxWidth
        let videoHeight = (width * 9) / 16
        if (videoHeight > available) {
          videoHeight = available
          width = (videoHeight * 16) / 9
        }
        setFrameSlot({
          top,
          height: available,
          width: Math.floor(width),
          videoHeight: Math.floor(videoHeight),
        })
      }
      place()
      window.addEventListener("resize", place)
      return () => window.removeEventListener("resize", place)
    }, [framed])

    useEffect(() => {
      if (!videoId) return
      const onMessage = (event: MessageEvent) => {
        if (event.origin !== "https://www.youtube.com" && event.origin !== "https://www.youtube-nocookie.com") {
          return
        }
        const time = currentTimeFrom(event.data)
        if (time != null && !holdRef.current) timeRef.current = time
        if (playerStateFrom(event.data) === 1) releaseHold()
      }
      window.addEventListener("message", onMessage)
      return () => window.removeEventListener("message", onMessage)
    }, [videoId])

    const load = () => {
      const id = youtubeVideoId(draft)
      setInvalid(id == null)
      if (!id) return
      setVideoId(id)
    }

    const urlRow = (
      <div className="flex gap-2">
        <input
          value={draft}
          aria-label={t("accompanimentUrl")}
          placeholder="https://www.youtube.com/watch?v=…"
          className="h-11 min-w-0 flex-1 rounded-lg border border-white/10 bg-black/25 px-3 text-sm outline-none focus-visible:border-cyan-300/50"
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") load()
          }}
        />
        <Button type="button" variant="outline" className="h-11 shrink-0" onClick={load}>
          {t("accompanimentLoad")}
        </Button>
      </div>
    )

    const audioRow = (
      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" variant="outline" className="h-9" onClick={() => fileRef.current?.click()}>
          {t("accompanimentAudio")}
        </Button>
        <input
          ref={fileRef}
          type="file"
          accept="audio/*,.mp3,.wav,.m4a,.aac,.ogg,.flac,.webm"
          className="sr-only"
          tabIndex={-1}
          onChange={(event) => {
            const file = event.target.files?.[0]
            event.target.value = ""
            if (file) onAudio(file)
          }}
        />
        {audioName ? (
          <>
            <span className="min-w-0 truncate text-xs text-muted-foreground">{audioName}</span>
            <Button type="button" variant="ghost" className="h-9" onClick={onClearAudio}>
              {t("accompanimentRemove")}
            </Button>
          </>
        ) : null}
        {videoId ? (
          <Button type="button" variant="ghost" className="h-9" onClick={() => onAlign(timeRef.current)}>
            {t("accompanimentAlign")}
          </Button>
        ) : null}
      </div>
    )

    const frame =
      videoId && typeof document !== "undefined"
        ? createPortal(
            <div
              className={
                framed
                  ? "pointer-events-none fixed inset-x-0 z-40 flex items-center justify-center px-4"
                  : "pointer-events-none fixed top-0 left-0 -z-10 w-[min(48rem,calc(100vw-2rem))] opacity-0"
              }
              style={framed && frameSlot ? { top: frameSlot.top, height: frameSlot.height } : undefined}
            >
              <div
                className={framed ? "pointer-events-auto relative" : "pointer-events-auto relative w-full"}
                style={framed && frameSlot ? { width: frameSlot.width, height: frameSlot.videoHeight } : undefined}
              >
                <iframe
                  key={videoId}
                  id={`accompaniment-${videoId}`}
                  ref={frameRef}
                  title={t("accompaniment")}
                  data-embed="player"
                  className={
                    framed
                      ? `h-full w-full rounded-lg border border-white/10 bg-black${liveMode ? " pointer-events-none" : ""}`
                      : "aspect-video w-full rounded-lg border border-white/10 bg-black"
                  }
                  src={`https://www.youtube-nocookie.com/embed/${videoId}?enablejsapi=1&rel=0&playsinline=1${liveMode ? "&controls=0" : ""}`}
                  referrerPolicy="strict-origin-when-cross-origin"
                  onLoad={() => listenToPlayer(frameRef.current)}
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                  allowFullScreen
                />
              </div>
            </div>,
            document.body,
          )
        : null

    return (
      <>
        <Card className="border-white/10 bg-card/80">
          <CardHeader>
            <div className="flex items-start justify-between gap-3">
              <div>
                <CardTitle id="accompaniment-title" className="text-lg">
                  {t("accompaniment")}
                </CardTitle>
                <CardDescription>{t("accompanimentHint")}</CardDescription>
              </div>
              {onClose ? (
                <Button type="button" variant="ghost" size="icon" aria-label={t("close")} onClick={onClose}>
                  <X />
                </Button>
              ) : null}
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {urlRow}
            {invalid ? (
              <p role="alert" className="text-sm text-destructive">
                {t("accompanimentInvalid")}
              </p>
            ) : null}
            {audioRow}
            {audioName ? (
              <p className="text-xs text-muted-foreground">
                {t("accompanimentAudioLoaded")} {t("accompanimentAt", { time: formatClock(offsetSeconds) })}
              </p>
            ) : null}
          </CardContent>
        </Card>
        {frame}
      </>
    )
  },
)
