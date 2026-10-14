import { expect, test, type Page } from "@playwright/test"
import pkg from "../../package.json" with { type: "json" }
import { SERVER, type SeedInput } from "../utils/app"
import { openHeldStart } from "../utils/direction"
import { expectAppVisible } from "../utils/waits"
import { mockWorkspace } from "../utils/workspace"

// The web app's version, which What's New compares with the version last seen.
const current = pkg.version

const SEEN = "opencode.global.dat:extension.updater.seen"

const RELEASE_NOTES = "opencode.global.dat:extension.updater.releaseNotes"

const cors = { "access-control-allow-origin": "*" }

// Published Kito history includes records outside the installed-version range. Six unseen releases cap at five.
const history = {
  data: {
    appId: "kito",
    channel: "stable",
    items: [
      { version: "99.0.0", notes: ["Not installed yet."] },
      { version: current, notes: ["Work side by side."] },
      { version: "1.9.6", notes: ["Talk to the agent."] },
      { version: "1.9.5", notes: ["Opens in half the time."] },
      { version: "1.9.4", notes: ["Pick a theme."] },
      { version: "1.9.3", notes: ["Keep sessions open."] },
      { version: "1.9.2", notes: ["Past the limit."] },
      { version: "1.9.1", notes: ["Shown at 1.9.1."] },
    ],
  },
}

const emptyNotes = { ...history, data: { ...history.data, items: [{ version: current, notes: [] }] } }

const historyURL = "https://updates.ktyun.cc/api/v1/apps/kito/releases/history?*"

// A user who last saw 1.9.1, stored where the app kept it before the updater extension owned What's New.
const upgraded = { storage: { "highlights.v1": { version: "1.9.1" } } }

test("What's New shows the highlights since the version seen, pages to Get started, and is seen once shown", async ({
  page,
}) => {
  const requests = await serveHistory(page)
  await start(page, upgraded)
  const dialog = page.getByRole("dialog")
  const title = dialog.getByRole("heading", { level: 1 })
  const next = dialog.getByRole("button", { name: "Next", exact: true })
  await expect(title).toHaveText(`Kito ${current}`)
  await expect(dialog.getByText("Work side by side.", { exact: true })).toBeVisible()
  // Seen as soon as it shows, so however it closes, the next start shows nothing.
  await expect.poll(() => stored(page, SEEN)).toEqual({ version: current })

  await next.click()
  await expect(title).toHaveText("Kito 1.9.6")
  await expect(dialog.getByText("Talk to the agent.", { exact: true })).toBeVisible()
  await page.keyboard.press("ArrowLeft")
  await expect(title).toHaveText(`Kito ${current}`)
  await page.keyboard.press("ArrowRight")
  await expect(title).toHaveText("Kito 1.9.6")

  await next.click()
  await expect(title).toHaveText("Kito 1.9.5")
  await next.click()
  await expect(title).toHaveText("Kito 1.9.4")
  await next.click()
  await expect(title).toHaveText("Kito 1.9.3")
  await expect(next).toHaveCount(0)
  await dialog.getByRole("button", { name: "Get started", exact: true }).click()
  await expect(dialog).toBeHidden()
  expect(requests).toHaveLength(1)
  const url = new URL(requests[0]!)
  expect(url.searchParams.get("channel")).toBe("stable")
  expect(url.searchParams.get("locale")).toMatch(/^en(?:-|$)/)
})

test("Don't show these in the future turns release notes off and closes What's New", async ({ page }) => {
  await serveHistory(page)
  await start(page, upgraded)
  const dialog = page.getByRole("dialog")
  await expect(dialog.getByRole("heading", { level: 1 })).toHaveText(`Kito ${current}`)
  await dialog.getByRole("button", { name: "Don't show these in the future", exact: true }).click()
  await expect(dialog).toBeHidden()
  await expect.poll(() => stored(page, RELEASE_NOTES)).toEqual({ enabled: false })
})

test("a rejected update check shows one failure title without repeating it as a description", async ({ page }) => {
  await mockWorkspace(page, { name: "UpdateCheck", sessions: [] })
  await page.goto(
    `/e2e/utils/settings-wsl.html?${new URLSearchParams({ server: SERVER, mode: "stopped", updater: "" })}`,
  )
  const settings = page.getByTestId("settings-screen")
  const check = settings.getByRole("button", { name: "Check now", exact: true })
  await expect(check).toBeEnabled()
  await check.click()
  await expect(page.getByText("Request failed", { exact: true })).toBeVisible()
  await expect(page.getByText("Request failed", { exact: true })).toHaveCount(1)
  await expect(page.getByText("You're up to date", { exact: true })).toHaveCount(0)
})

test("What's New opened after the attachment mounts waits for the routes, then keeps focus over restored Settings", async ({
  page,
}) => {
  const held = Promise.withResolvers<void>()
  await serveHistory(page, history, held.promise)
  await mockWorkspace(page, { name: "Whats New", sessions: [], seed: upgraded })
  const app = await openHeldStart(page, "/settings")
  await app.start()
  held.resolve()
  // What's New marks the release seen as it opens: after attachment, while an extension still holds the routes.
  await expect.poll(() => stored(page, SEEN)).toEqual({ version: current })

  const dialog = page.getByRole("dialog")
  const focused = () => dialog.evaluate((element) => element.contains(document.activeElement))
  await expect(dialog).toHaveCount(0)
  await expect(page.getByTestId("settings-screen")).toHaveCount(0)
  await app.finish()
  await expect(page.getByTestId("settings-screen")).toBeAttached()
  await expect(dialog.getByRole("heading", { level: 1 })).toHaveText(`Kito ${current}`)
  await expect.poll(focused).toBe(true)

  for (const key of ["Tab", "Tab", "Tab", "Tab", "Shift+Tab"]) {
    await page.keyboard.press(key)
    await expect.poll(focused).toBe(true)
  }
})

test("a failed history request leaves What's New for the next start", async ({ page }) => {
  const failed = Promise.withResolvers<void>()
  const requests: string[] = []

  await page.route(historyURL, async (route) => {
    requests.push(route.request().url())

    if (requests.length > 1) return route.fulfill({ headers: cors, json: history })

    await route.fulfill({ status: 503, headers: cors })
    failed.resolve()
  })

  await start(page, upgraded)
  await failed.promise
  expect(await stored(page, SEEN)).toEqual({ version: "1.9.1" })
  await page.reload()
  await expect(page.getByRole("dialog").getByRole("heading", { level: 1 })).toHaveText(`Kito ${current}`)
})

// Each start ends with the current version seen and no dialog; only a release in range is worth a history request.
for (const row of [
  { name: "the first run only remembers the version", seed: {}, requests: 0 },
  {
    name: "a version seen before, stored as highlights.v1, shows nothing",
    seed: { storage: { "highlights.v1": { version: current } } },
    requests: 0,
  },
  {
    name: "release notes turned off before, in settings.v3, only remember the version",
    seed: { ...upgraded, settings: { general: { releaseNotes: false } } },
    requests: 0,
  },
  {
    name: "Kito history without notes since the version seen only remembers the version",
    seed: upgraded,
    history: emptyNotes,
    requests: 1,
  },
]) {
  test(`What's New: ${row.name}`, async ({ page }) => {
    const requests = await serveHistory(page, row.history)
    await start(page, row.seed)
    await expect.poll(() => stored(page, SEEN)).toEqual({ version: current })
    expect(requests).toHaveLength(row.requests)
    await expect(page.getByRole("dialog")).toHaveCount(0)
  })
}

/** Serves this history and records each request for it. */
async function serveHistory(page: Page, body: typeof history | typeof emptyNotes = history, held?: Promise<void>) {
  const requests: string[] = []

  await page.route(historyURL, async (route) => {
    requests.push(route.request().url())
    await held

    return route.fulfill({ headers: cors, json: body })
  })

  return requests
}

/** Opens Home over one empty project, with this storage, and waits until the window renders. */
async function start(page: Page, seed: SeedInput) {
  await mockWorkspace(page, { name: "Whats New", sessions: [], seed })
  await page.goto("/")
  // The automatic dialog can already hide the background from the accessibility
  // tree. This only checks the shell mount; each scenario asserts its own dialog.
  await expectAppVisible(
    page.getByRole("button", { name: "Settings", exact: true, includeHidden: true }).filter({ visible: true }),
  )
}

function stored(page: Page, key: string) {
  return page.evaluate((name) => localStorage.getItem(name), key).then((raw) => JSON.parse(raw ?? "null"))
}
