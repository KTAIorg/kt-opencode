import { Show, createEffect, createMemo, createSignal, on, onMount } from "solid-js"
import { Portal } from "solid-js/web"
import { TitlebarAccountButton } from "./titlebar-account-button"
import { useLanguage } from "@/runtime/i18n/language"
import { useGlobal } from "@/runtime/server/runtime"
import { ServerProvider } from "@/runtime/server/current"
import { preferredTitlebarServer } from "@/runtime/server/registry"

/** Keeps the Kito account button mounted outside the titlebar's registration slot so it never yields to other right-side content. */
function useKitoRightMount() {
  const language = useLanguage()
  const [mount, setMount] = createSignal<HTMLElement | null>(null)
  const sync = () => setMount(document.getElementById("opencode-titlebar-right"))
  onMount(sync)
  createEffect(on(language.direction, sync, { defer: true }))
  return mount
}

export function KitoTitlebar() {
  const rightMount = useKitoRightMount()
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
