import { expect, test } from "@playwright/test"
import { assistantMessage, replayTool, setupTimeline, toolPart, userMessage } from "../utils/timeline"

test("preserves expanded web search links across duplicate completion", async ({ page }) => {
  const searchID = "prt_websearch_mutation"
  const input = { query: "timeline stability" }
  const completed = toolPart(searchID, "websearch", "completed", input, {
    output: "https://example.com/one\nhttps://example.com/two",
  })
  const timeline = await setupTimeline(page, {
    messages: [userMessage(), assistantMessage([completed])],
  })
  const group = page.locator(`[data-timeline-part-ids="${searchID}"]`)
  await group.getByRole("button").first().click()
  const wrapper = page.locator(`[data-timeline-part-id="${searchID}"]`)
  const trigger = wrapper.locator('[data-slot="collapsible-trigger"]')
  await trigger.click()
  await expect(trigger).toHaveAttribute("aria-expanded", "true")
  await timeline.send(replayTool(completed), 300)
  await expect(trigger).toHaveAttribute("aria-expanded", "true")
  await expect(wrapper.locator('a[href="https://example.com/two"]')).toBeVisible()
})

test("preserves an expanded tool error card across duplicate delivery", async ({ page }) => {
  const toolID = "prt_duplicate_error"
  const failed = toolPart(toolID, "shell", "error", { command: "exit 1" }, { error: "Command failed visibly" })
  const timeline = await setupTimeline(page, { messages: [userMessage(), assistantMessage([failed])] })
  const group = page.locator(`[data-timeline-part-ids="${toolID}"]`)
  await group.getByRole("button").first().click()
  const wrapper = page.locator(`[data-timeline-part-id="${toolID}"]`)
  const trigger = wrapper.locator('[data-slot="collapsible-trigger"]')
  await trigger.click()
  await expect(trigger).toHaveAttribute("aria-expanded", "true")
  await timeline.send(replayTool(failed), 150)
  await timeline.send(replayTool(failed), 250)
  await expect(trigger).toHaveAttribute("aria-expanded", "true")
  await expect(wrapper).toContainText("Command failed visibly")
})

test("renders multiple question answers and preserves open state across duplicate completion", async ({ page }) => {
  const questionID = "prt_multi_question"
  const input = {
    questions: [
      { header: "First", question: "First choice?", options: [] },
      { header: "Second", question: "Second choice?", options: [], multiple: true },
    ],
  }
  const timeline = await setupTimeline(page, {
    messages: [
      userMessage(),
      assistantMessage([
        toolPart(questionID, "question", "completed", input, { metadata: { answers: [["A"], ["B", "C"]] } }),
      ]),
    ],
  })
  const wrapper = page.locator(`[data-timeline-part-id="${questionID}"]`)
  const trigger = wrapper.locator('[data-slot="collapsible-trigger"]')
  await expect(trigger).toHaveAttribute("aria-expanded", "true")
  await timeline.send(
    replayTool(toolPart(questionID, "question", "completed", input, { metadata: { answers: [["A"], ["B", "C"]] } })),
    300,
  )
  await expect(trigger).toHaveAttribute("aria-expanded", "true")
  await expect(wrapper).toContainText("A")
  await expect(wrapper).toContainText("B, C")
})
