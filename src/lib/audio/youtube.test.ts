import { describe, expect, it } from "vitest"
import { youtubeVideoId } from "@/lib/audio/youtube"

describe("youtubeVideoId", () => {
  it("reads the id from common YouTube links", () => {
    expect(youtubeVideoId("https://www.youtube.com/watch?v=dQw4w9WgXcQ")).toBe("dQw4w9WgXcQ")
    expect(youtubeVideoId("https://youtu.be/dQw4w9WgXcQ?t=42")).toBe("dQw4w9WgXcQ")
    expect(youtubeVideoId("https://www.youtube.com/shorts/dQw4w9WgXcQ")).toBe("dQw4w9WgXcQ")
    expect(youtubeVideoId("https://music.youtube.com/watch?v=dQw4w9WgXcQ")).toBe("dQw4w9WgXcQ")
    expect(youtubeVideoId("dQw4w9WgXcQ")).toBe("dQw4w9WgXcQ")
  })

  it("rejects other links", () => {
    expect(youtubeVideoId("https://example.com/watch?v=dQw4w9WgXcQ")).toBeNull()
    expect(youtubeVideoId("not a link")).toBeNull()
    expect(youtubeVideoId("")).toBeNull()
  })
})
