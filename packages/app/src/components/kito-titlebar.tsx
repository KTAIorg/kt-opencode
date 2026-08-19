import { Show } from "solid-js"
import { Portal } from "solid-js/web"
import { TitlebarAccountButton } from "@/components/titlebar-account-button"
import { useTitlebarRightMount } from "@/components/titlebar"

export function KitoTitlebar() {
  const rightMount = useTitlebarRightMount()
  return (
    <Show when={rightMount()} keyed>
      {(mount) => (
        <Portal mount={mount}>
          <TitlebarAccountButton />
        </Portal>
      )}
    </Show>
  )
}
