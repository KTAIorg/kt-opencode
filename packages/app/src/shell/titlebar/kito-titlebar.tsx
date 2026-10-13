import { Show, createMemo } from "solid-js"
import { LanguageSelect } from "@/shell/titlebar/language-select"
import { TitlebarAccountButton } from "@/shell/titlebar/titlebar-account-button"
import { TitlebarRight } from "@/shell/titlebar/right-slot"
import { useGlobal } from "@/runtime/server/runtime"
import { ServerProvider } from "@/runtime/server/current"
import { preferredTitlebarServer } from "@/runtime/server/registry"

export function KitoTitlebar() {
  const global = useGlobal()
  const conn = createMemo(() => preferredTitlebarServer(global.servers.list()))
  return (
    <TitlebarRight>
      <div class="flex shrink-0 items-center gap-2">
        <LanguageSelect icon valueClass="!text-[11px]" />
        <Show when={conn()} keyed>
          {(server) => (
            <ServerProvider conn={server}>
              <TitlebarAccountButton />
            </ServerProvider>
          )}
        </Show>
      </div>
    </TitlebarRight>
  )
}
