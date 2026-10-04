import { createContext, useContext, useEffect, useState, type ReactNode } from "react"
import { translate, type Locale, type MessageKey } from "@/lib/i18n"

const STORAGE_KEY = "singing-grade:settings"
export const MIC_GAIN_MIN = 1
export const MIC_GAIN_MAX = 12
export const MIC_GAIN_DEFAULT = 4

type Settings = {
  locale: Locale
  micGain: number
}

type Preferences = Settings & {
  setLocale: (locale: Locale) => void
  setMicGain: (micGain: number) => void
  t: (key: MessageKey, vars?: Record<string, string | number>) => string
}

const DEFAULTS: Settings = {
  locale: "en",
  micGain: MIC_GAIN_DEFAULT,
}

const PreferencesContext = createContext<Preferences | null>(null)

function clampGain(value: number): number {
  if (!Number.isFinite(value)) return MIC_GAIN_DEFAULT
  return Math.min(MIC_GAIN_MAX, Math.max(MIC_GAIN_MIN, value))
}

function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return DEFAULTS
    const parsed: unknown = JSON.parse(raw)
    if (typeof parsed !== "object" || parsed == null) return DEFAULTS
    const record = parsed as { locale?: unknown; micGain?: unknown }
    const locale = record.locale === "zh" ? "zh" : "en"
    const micGain = typeof record.micGain === "number" ? clampGain(record.micGain) : MIC_GAIN_DEFAULT
    return { locale, micGain }
  } catch {
    return DEFAULTS
  }
}

function saveSettings(settings: Settings) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(settings))
}

export function PreferencesProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<Settings>(loadSettings)

  useEffect(() => {
    document.documentElement.lang = settings.locale === "zh" ? "zh-Hans" : "en"
  }, [settings.locale])

  const value: Preferences = {
    ...settings,
    setLocale: (locale) => {
      setSettings((current) => {
        const next = { ...current, locale }
        saveSettings(next)
        return next
      })
    },
    setMicGain: (micGain) => {
      setSettings((current) => {
        const next = { ...current, micGain: clampGain(micGain) }
        saveSettings(next)
        return next
      })
    },
    t: (key, vars) => translate(settings.locale, key, vars),
  }

  return <PreferencesContext.Provider value={value}>{children}</PreferencesContext.Provider>
}

export function usePreferences(): Preferences {
  const value = useContext(PreferencesContext)
  if (!value) throw new Error("Preferences are unavailable")
  return value
}
