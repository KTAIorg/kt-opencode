import { Show } from "solid-js"
import { PromptInputV2Composer, usePromptInputV2Controller } from "@/components/prompt-input-v2"
import { CommentsProvider } from "@/context/comments"
import { FileProvider } from "@/context/file"
import { useGlobal } from "@/context/global"
import { LocationProvider } from "@/context/location"
import { useLocal } from "@/context/local"
import { ModelsProvider } from "@/context/models"
import { PromptProvider } from "@/context/prompt"
import { ServerProvider } from "@/context/server"
import { ServerConnection } from "@/context/servers"
import { SessionUIProvider } from "@/pages/directory-layout"
import { createPromptInputController } from "@/pages/session/composer"
import { createPromptModelSelection } from "@/pages/session/composer/prompt-model-selection"
import { useSessionKey } from "@/pages/session/session-layout"
import { useComposerCommands } from "@/pages/session/use-composer-commands"

/** Home submits through the canonical prompt path, which creates the session for a route without an id. */
export function HomeComposer(props: { conn: ServerConnection.Any; directory: string }) {
  return (
    <ServerProvider conn={props.conn}>
      <ModelsProvider directory={props.directory}>
        <LocationProvider directory={props.directory}>
          <SessionUIProvider directory={props.directory} server={ServerConnection.key(props.conn)}>
            <FileProvider>
              <PromptProvider>
                <CommentsProvider>
                  <Show when={props.directory} keyed>
                    {(directory) => <HomeComposerInput conn={props.conn} directory={directory} />}
                  </Show>
                </CommentsProvider>
              </PromptProvider>
            </FileProvider>
          </SessionUIProvider>
        </LocationProvider>
      </ModelsProvider>
    </ServerProvider>
  )
}

function HomeComposerInput(props: { conn: ServerConnection.Any; directory: string }) {
  const global = useGlobal()
  const local = useLocal()
  const route = useSessionKey()
  const model = createPromptModelSelection({ agent: () => local.agent.current() })

  useComposerCommands({ model })

  const controls = createPromptInputController({
    sessionKey: route.sessionKey,
    sessionID: () => route.params.id,
    model,
  })
  const input = usePromptInputV2Controller({
    get controls() {
      return controls()
    },
    onSubmit: () => {
      const ctx = global.ensureServerCtx(props.conn)
      ctx.projects.open(props.directory)
      ctx.projects.touch(props.directory)
    },
  })

  return <PromptInputV2Composer controller={input} borderUnderlay />
}
