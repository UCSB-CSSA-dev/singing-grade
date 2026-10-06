const VIDEO_ID = /^[\w-]{11}$/

export function youtubeVideoId(input: string): string | null {
  const trimmed = input.trim()
  if (VIDEO_ID.test(trimmed)) return trimmed
  let url: URL
  try {
    url = new URL(trimmed)
  } catch {
    return null
  }
  const host = url.hostname.replace(/^www\./, "").replace(/^m\./, "")
  if (host === "youtu.be") return idFromPath(url.pathname, 0)
  if (host !== "youtube.com" && host !== "music.youtube.com" && host !== "youtube-nocookie.com") {
    return null
  }
  if (url.pathname === "/watch") return validId(url.searchParams.get("v"))
  const parts = url.pathname.split("/").filter(Boolean)
  if (parts[0] === "embed" || parts[0] === "shorts" || parts[0] === "live") {
    return validId(parts[1])
  }
  return null
}

function idFromPath(pathname: string, index: number): string | null {
  return validId(pathname.split("/").filter(Boolean)[index])
}

function validId(value: string | null | undefined): string | null {
  return value && VIDEO_ID.test(value) ? value : null
}
