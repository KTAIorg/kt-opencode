import { createResource, Show, Suspense } from "solid-js"
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
          tab.type === "draft" &&
          tab.home === true &&
          tab.server === ServerConnection.key(props.conn) &&
          tab.directory === props.directory,
      ) ??
      tabs.newDraft(
        { server: ServerConnection.key(props.conn), directory: props.directory },
        undefined,
        undefined,
        false,
      ),
  )
  return (
    <Suspense>
      <Show when={draft()} keyed>
        {(draft) => (
          <ServerProvider conn={props.conn}>
            <ModelsProvider directory={props.directory}>
              <LocationProvider directory={props.directory}>
                <SessionUIProvider directory={props.directory} server={draft.server}>
                  <FileProvider>
                    <ComposerPersistenceProvider draftID={draft.draftID}>
                      <CommentsProvider>
                        {/* 主页底部条空间有限：关掉大水印，改用紧凑居中布局，避免挤出底部的附件/模型按钮。 */}
                        <NewSession draftId={draft.draftID} autoFocus={false} wordmark={false} />
                      </CommentsProvider>
                    </ComposerPersistenceProvider>
                  </FileProvider>
                </SessionUIProvider>
              </LocationProvider>
            </ModelsProvider>
          </ServerProvider>
        )}
      </Show>
    </Suspense>
  )
}
