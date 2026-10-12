import { createResource, Show } from "solid-js"
import { CommentsProvider } from "@/composer/comments"
import { ComposerPersistenceProvider } from "@/composer/persistence"
import { FileProvider } from "@/workspaces/files/model"
import { LocationProvider } from "@/workspaces/location"
import { ModelsProvider } from "@/providers/models/models"
import { ServerProvider } from "@/runtime/server/current"
import { ServerConnection } from "@/runtime/server/registry"
import { SessionUIProvider } from "@/shell/routes/session-ui-provider"
import { useTabs, type DraftTab } from "@/shell/tabs/tabs"
import NewSession from "@/new-session/screen"

export function HomeComposer(props: { conn: ServerConnection.Any; directory: string }) {
  const tabs = useTabs()
  const [draft] = createResource(
    () => `${ServerConnection.key(props.conn)}\0${props.directory}`,
    () =>
      tabs.store.find(
        (tab): tab is DraftTab =>
          tab.type === "draft" && tab.server === ServerConnection.key(props.conn) && tab.directory === props.directory,
      ) ??
      tabs.newDraft(
        { server: ServerConnection.key(props.conn), directory: props.directory },
        undefined,
        undefined,
        false,
      ),
  )
  return (
    <Show when={draft()} keyed>
      {(draft) => (
        <ServerProvider conn={props.conn}>
          <ModelsProvider directory={props.directory}>
            <LocationProvider directory={props.directory}>
              <SessionUIProvider directory={props.directory} server={draft.server}>
                <FileProvider>
                  <ComposerPersistenceProvider>
                    <CommentsProvider>
                      <NewSession draftId={draft.draftID} />
                    </CommentsProvider>
                  </ComposerPersistenceProvider>
                </FileProvider>
              </SessionUIProvider>
            </LocationProvider>
          </ModelsProvider>
        </ServerProvider>
      )}
    </Show>
  )
}
