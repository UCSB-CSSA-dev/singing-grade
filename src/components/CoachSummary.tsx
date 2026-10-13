import { useEffect, useState } from "react"
import { CoachSummaryError, fetchCoachSummary, type ScoredResult } from "@/lib/coachSummary"
import { usePreferences } from "@/lib/preferences"

type CoachSummaryProps = {
  result: ScoredResult
}

export function CoachSummary({ result }: CoachSummaryProps) {
  const { locale, t } = usePreferences()
  const [text, setText] = useState<string | null>(null)
  const [status, setStatus] = useState<"loading" | "ready" | "missing" | "failed">("loading")

  useEffect(() => {
    const controller = new AbortController()
    setStatus("loading")
    setText(null)
    void fetchCoachSummary(result, locale, controller.signal)
      .then((summary) => {
        if (controller.signal.aborted) return
        setText(summary)
        setStatus("ready")
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return
        if (error instanceof CoachSummaryError && error.code === "missing-key") {
          setStatus("missing")
          return
        }
        setStatus("failed")
      })
    return () => controller.abort()
  }, [locale, result])

  return (
    <div className="space-y-2">
      <h3 className="text-sm font-medium">{t("aiSummary")}</h3>
      {status === "ready" && text ? (
        <p className="text-sm leading-6 whitespace-pre-wrap text-foreground/90">{text}</p>
      ) : (
        <p className="text-sm text-muted-foreground">
          {status === "loading"
            ? t("aiSummaryLoading")
            : status === "missing"
              ? t("aiSummaryMissing")
              : t("aiSummaryFailed")}
        </p>
      )}
    </div>
  )
}
