import { onMount, Show } from "solid-js"
import { makeEventListener } from "@solid-primitives/event-listener"
import { Button } from "@opencode-ai/ui/button"
import { Dialog, DialogFooter, DialogHeader, DialogTitleGroup } from "@opencode-ai/ui/dialog"
import { useDialog } from "@opencode-ai/ui/context/dialog"
import { useGlobal } from "@/context/global"
import { useLanguage } from "@/context/language"
import { ServerConnection } from "@/context/servers"
import { useTabs } from "@/context/tabs"
import {
  createDeepLinkGate,
  deepLinkEvent,
  drainPendingDeepLinks,
  readDeepLinkEventDetail,
  type DeepLinkAction,
} from "./deep-links"

const codeClass =
  "max-w-full rounded-[4px] bg-[color-mix(in_oklch,var(--v2-text-text-base)_8%,transparent)] px-1 py-0.5 font-mono text-xs font-medium leading-4 text-v2-text-text-base break-all"

function DialogDeepLink(props: { link: DeepLinkAction; onOpen: () => void }) {
  const dialog = useDialog()
  const language = useLanguage()

  const open = () => {
    props.onOpen()
    dialog.close()
  }

  return (
    <Dialog fit>
      <DialogHeader>
        <DialogTitleGroup
          title={language.t("dialog.deepLink.title")}
          description={
            <>
              {language.t("dialog.deepLink.description")}
              <br />
              {language.t("dialog.deepLink.directory")}
              <br />
              <code class={codeClass}>{props.link.directory}</code>
              <Show when={props.link.type === "new-session" ? props.link.prompt : undefined}>
                {(prompt) => (
                  <>
                    <br />
                    {language.t("dialog.deepLink.prompt")}
                    <br />
                    <code class={codeClass}>{prompt()}</code>
                  </>
                )}
              </Show>
            </>
          }
        />
      </DialogHeader>
      <DialogFooter>
        <Button type="button" variant="neutral" onClick={() => dialog.close()}>
          {language.t("common.cancel")}
        </Button>
        <Button type="button" variant="contrast" onClick={open}>
          {language.t("common.open")}
        </Button>
      </DialogFooter>
    </Dialog>
  )
}

export function DeepLinkGate() {
  const dialog = useDialog()
  const global = useGlobal()
  const tabs = useTabs()

  const open = (link: DeepLinkAction) => {
    // Deep link directories are local filesystem paths, so they only apply to
    // the local server.
    const conn = global.servers.list().find((item) => ServerConnection.local(item))
    if (!conn) {
      console.debug("[deep-links] ignoring link without a local server", link)
      return
    }
    const ctx = global.ensureServerCtx(conn)
    ctx.projects.open(link.directory)
    ctx.projects.touch(link.directory)
    void tabs.newDraft(
      { server: ServerConnection.key(conn), directory: link.directory },
      link.type === "new-session" ? link.prompt : undefined,
    )
  }

  // Each link gets its own stacked confirmation; cancelling one drops only that link.
  const gate = createDeepLinkGate({
    open,
    confirm: (link, approve) => void dialog.push(() => <DialogDeepLink link={link} onOpen={approve} />),
  })

  onMount(() => {
    gate.handle(drainPendingDeepLinks(window))
    makeEventListener(window, deepLinkEvent, (event: Event) => {
      gate.handle(readDeepLinkEventDetail(event))
    })
  })

  return null
}
