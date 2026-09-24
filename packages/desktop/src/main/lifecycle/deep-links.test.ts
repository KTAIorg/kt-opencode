import { describe, expect, test } from "bun:test"
import { createDeepLinkOutbox, deepLinksFromArgv, isDeepLink } from "./deep-links"

describe("desktop deep links", () => {
  test("recognises only the Kito and legacy opencode schemes", () => {
    expect(isDeepLink("ktai://new-session?directory=/a")).toBe(true)
    expect(isDeepLink("opencode://open-project?directory=/a")).toBe(true)
    expect(isDeepLink("https://ktai.cc")).toBe(false)
    expect(isDeepLink("--ktai://flag")).toBe(false)
    expect(isDeepLink("")).toBe(false)
  })

  test("collects deep link URLs from launch argv", () => {
    expect(
      deepLinksFromArgv([
        "/Applications/Kito.app/Contents/MacOS/Kito",
        "ktai://new-session?directory=/a&prompt=hi",
        "--inspect",
        "opencode://open-project?directory=/b",
      ]),
    ).toEqual(["ktai://new-session?directory=/a&prompt=hi", "opencode://open-project?directory=/b"])
  })

  test("queues links until a window can receive them", () => {
    const outbox = createDeepLinkOutbox()
    const sent: string[][] = []

    outbox.emit(["ktai://open-project?directory=/a"])
    expect(sent).toEqual([])

    outbox.emit(["ktai://open-project?directory=/b"], (urls) => sent.push(urls))
    expect(sent).toEqual([["ktai://open-project?directory=/a", "ktai://open-project?directory=/b"]])
    expect(outbox.consume()).toEqual([])
  })

  test("consumes buffered links once", () => {
    const outbox = createDeepLinkOutbox()
    outbox.emit(["ktai://open-project?directory=/a"])
    expect(outbox.consume()).toEqual(["ktai://open-project?directory=/a"])
    expect(outbox.consume()).toEqual([])
  })

  test("never delivers the same URL through both channels", () => {
    const outbox = createDeepLinkOutbox()
    const sent: string[][] = []
    const send = (urls: string[]) => sent.push(urls)

    outbox.emit(["ktai://open-project?directory=/a"])
    outbox.emit(["ktai://open-project?directory=/a"], send)
    expect(sent).toEqual([["ktai://open-project?directory=/a"]])
    expect(outbox.consume()).toEqual([])
  })
})
