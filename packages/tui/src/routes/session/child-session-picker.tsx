import type { SessionV2Info } from "@opencode-ai/sdk/v2"
import { createSignal, For, onCleanup, onMount } from "solid-js"
import { useRenderer } from "@opentui/solid"
import { selectedForeground, useTheme } from "../../context/theme"
import { useBindings, useOpencodeModeStack } from "../../keymap"
import { SplitBorder } from "../../ui/border"

const mode = "child-session-picker"

export function ChildSessionPicker(props: {
  sessions: SessionV2Info[]
  currentID: string
  child: boolean
  status: (sessionID: string) => "idle" | "running"
  onSelect: (sessionID: string) => void
  onEscape: () => void
}) {
  const renderer = useRenderer()
  const modeStack = useOpencodeModeStack()
  const { theme } = useTheme()
  const [selected, setSelected] = createSignal(
    Math.max(
      0,
      props.sessions.findIndex((item) => item.id === props.currentID),
    ),
  )
  const move = (direction: -1 | 1) =>
    setSelected((selected() + direction + props.sessions.length) % props.sessions.length)

  onMount(() => {
    const popMode = modeStack.push(mode)
    onCleanup(popMode)
  })

  useBindings(() => ({
    mode,
    bindings: [
      { key: "up", desc: "Previous child agent", group: "Child agents", cmd: () => move(-1) },
      { key: "down", desc: "Next child agent", group: "Child agents", cmd: () => move(1) },
      {
        key: "return",
        desc: "Open child agent",
        group: "Child agents",
        cmd: () => props.onSelect(props.sessions[selected()].id),
      },
      {
        key: "escape",
        desc: props.child ? "Return to parent session" : "Close child agents",
        group: "Child agents",
        cmd: props.onEscape,
      },
    ],
  }))

  return (
    <box
      flexShrink={0}
      backgroundColor={theme.backgroundPanel}
      border={["left"]}
      borderColor={theme.accent}
      customBorderChars={SplitBorder.customBorderChars}
      paddingTop={1}
      paddingBottom={1}
      paddingLeft={2}
      paddingRight={2}
      gap={1}
    >
      <text fg={theme.text}>
        <b>Child agents</b>
      </text>
      <text fg={theme.textMuted}>Choose an agent to view its session</text>
      <box>
        <For each={props.sessions}>
          {(session, index) => {
            const active = () => selected() === index()
            const running = () => props.status(session.id) === "running"
            const foreground = () => (active() ? selectedForeground(theme, theme.accent) : theme.text)
            return (
              <box
                flexDirection="row"
                justifyContent="space-between"
                paddingLeft={1}
                paddingRight={1}
                backgroundColor={active() ? theme.accent : theme.backgroundPanel}
                onMouseOver={() => setSelected(index())}
                onMouseUp={() => {
                  if (renderer.getSelection()?.getSelectedText()) return
                  props.onSelect(session.id)
                }}
              >
                <box flexDirection="row" gap={1} minWidth={0}>
                  <text fg={active() ? foreground() : running() ? theme.success : theme.textMuted}>
                    {running() ? "●" : "○"}
                  </text>
                  <text fg={foreground()} wrapMode="none" flexShrink={1}>
                    <b>@{session.agent ?? "agent"}</b>{" "}
                    <span style={{ dim: !active() }}>{session.title.replace(/\s+\(@[^)]+ subagent\)$/, "")}</span>
                  </text>
                </box>
                <text fg={active() ? foreground() : running() ? theme.success : theme.textMuted}>
                  {running() ? "Running" : "Complete"}
                </text>
              </box>
            )
          }}
        </For>
      </box>
      <box flexDirection="row" justifyContent="space-between">
        <text fg={theme.textMuted}>↑↓ navigate · enter open</text>
        <text fg={theme.textMuted}>{props.child ? "esc parent" : "esc close"}</text>
      </box>
    </box>
  )
}
