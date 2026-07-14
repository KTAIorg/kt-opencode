import type { Service } from "@opencode-ai/client/effect"
import { createSignal, onCleanup, Show } from "solid-js"
import { Keymap } from "../context/keymap"
import { useTheme } from "../context/theme"
import { errorMessage } from "../util/error"
import { Spinner } from "./spinner"

const restartCommand = "service.restart"

export function Reconnecting(props: { status?: Service.Status; restart?: (signal?: AbortSignal) => Promise<void> }) {
  const theme = useTheme().theme
  const shortcuts = Keymap.useShortcuts()
  const [restarting, setRestarting] = createSignal(false)
  const [failure, setFailure] = createSignal<string>()
  let controller: AbortController | undefined
  const copy = () =>
    restarting()
      ? { loading: true, message: "Restarting background service..." }
      : reconnectingCopy(props.status, shortcuts.get(restartCommand))

  Keymap.createLayer(() => ({
    mode: "global",
    priority: 1000,
    commands: [
      {
        id: restartCommand,
        bind: "r",
        title: "Restart service",
        enabled: props.status?.type === "unresponsive" && !!props.restart,
        run: () => {
          if (!props.restart || restarting()) return
          controller = new AbortController()
          setFailure(undefined)
          setRestarting(true)
          void props
            .restart(controller.signal)
            .then(
              () => setFailure(undefined),
              (error) => {
                setFailure(errorMessage(error))
                setRestarting(false)
              },
            )
        },
      },
    ],
  }))

  onCleanup(() => controller?.abort())

  return (
    <box
      position="absolute"
      zIndex={10_000}
      top={0}
      right={0}
      bottom={0}
      left={0}
      backgroundColor={theme.background}
      alignItems="center"
      justifyContent="center"
    >
      <box width={62} maxWidth="90%" flexDirection="column" alignItems="center" gap={1}>
        <Show when={!copy().loading} fallback={<Spinner color={theme.textMuted}>{copy().message}</Spinner>}>
          <text fg={theme.error}>{copy().message}</text>
          <Show when={copy().detail}>
            {(detail) => (
              <text fg={theme.textMuted} wrapMode="word">
                {detail()}
              </text>
            )}
          </Show>
          <Show when={copy().action}>
            {(action) => (
              <text fg={theme.text} wrapMode="word">
                {action()}
              </text>
            )}
          </Show>
        </Show>
        <Show when={failure()}>
          {(message) => (
            <text fg={theme.error} wrapMode="word">
              {message()}
            </text>
          )}
        </Show>
      </box>
    </box>
  )
}

export function reconnectingCopy(status?: Service.Status, restart = "r") {
  if (status?.type === "starting")
    return {
      loading: true,
      message: status.version ? `Starting OpenCode ${status.version}...` : "Starting background service...",
    }
  if (status?.type === "stopping")
    return {
      loading: true,
      message: status.targetVersion ? `Updating to ${status.targetVersion}...` : "Restarting background service...",
    }
  if (status?.type === "failed")
    return { loading: false, message: "Background service failed", detail: status.message, action: status.action }
  if (status?.type === "unresponsive")
    return {
      loading: false,
      message: "Background service is not responding",
      action: `[${restart}] Restart service`,
    }
  return { loading: true, message: "Waiting for background service..." }
}
