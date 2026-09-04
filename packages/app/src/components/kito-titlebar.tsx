import { Show, createMemo } from "solid-js"
import { Portal } from "solid-js/web"
import { TitlebarAccountButton } from "@/components/titlebar-account-button"
import { useTitlebarRightMount } from "@/components/titlebar"
import { useGlobal } from "@/context/global"
import { ServerProvider } from "@/context/server"
import { preferredTitlebarServer } from "@/context/servers"

export function KitoTitlebar() {
  const rightMount = useTitlebarRightMount()
  const global = useGlobal()
  const conn = createMemo(() => preferredTitlebarServer(global.servers.list(), global.settings.server.selected()))
  return (
    <Show when={rightMount()} keyed>
      {(mount) => (
        <Portal mount={mount}>
          <Show when={conn()} keyed>
            {(server) => (
              <ServerProvider conn={server}>
                <TitlebarAccountButton />
              </ServerProvider>
            )}
          </Show>
        </Portal>
      )}
    </Show>
  )
}
