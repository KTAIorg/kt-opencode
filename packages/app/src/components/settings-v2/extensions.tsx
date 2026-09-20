import { Component, For, JSX, Show, createEffect, createMemo, createResource, createSignal } from "solid-js"
import { Button } from "@opencode-ai/ui/button"
import { Icon } from "@opencode-ai/ui/icon"
import { Switch } from "@opencode-ai/ui/switch"
import { Tabs } from "@opencode-ai/ui/tabs"
import { useLanguage } from "@/context/language"
import { useData } from "@/context/server"
import { useServerSDK } from "@/context/server-sdk"
import { useMcpToggle } from "@/context/mcp"
import { pluginLabel } from "@/utils/plugin"
import { ExternalLink } from "../external-link"
import { InlineServerSelect } from "./parts/server-select"
import "./settings-v2.css"

interface McpRowItem {
  name: string
  enabled: boolean
}

interface PluginRowItem {
  name: string
}

export const SettingsExtensionsV2: Component = () => {
  const language = useLanguage()
  const serverSdk = useServerSDK()
  const data = useData()
  const [mcpList, { refetch: refetchMcp }] = createResource(
    () => serverSdk.connection.status() === "connected",
    () => serverSdk.api.mcp.list().then((result) => result.data),
  )
  const toggleMcp = useMcpToggle(() => undefined, refetchMcp)
  const mcps = createMemo<McpRowItem[]>(() => {
    return (mcpList.latest ?? []).map((server) => ({
      name: server.name,
      enabled: server.status.status === "connected",
    }))
  })

  const handleMcpToggle = (item: McpRowItem, checked: boolean) => {
    if (item.enabled === checked || toggleMcp.isPending) return
    toggleMcp.mutate(item.name)
  }

  const [pluginList, { refetch: refetchPlugins }] = createResource(
    () => serverSdk.connection.status() === "connected",
    () => serverSdk.api.plugin.list().then((result) => result.data),
  )
  const plugins = createMemo<PluginRowItem[]>(() =>
    (pluginList.latest ?? []).map((item) => ({ name: pluginLabel(item) })),
  )

  const [skillFailed, setSkillFailed] = createSignal(false)
  const syncSkills = () =>
    void data.location.skill
      .sync()
      .then(() => setSkillFailed(false))
      .catch((cause) => {
        console.error("Failed to load skills", cause)
        setSkillFailed(true)
      })
  createEffect(() => {
    if (serverSdk.connection.status() !== "connected") return
    syncSkills()
  })
  const skills = () => data.location.skill.list() ?? []

  return (
    <>
      <div class="settings-v2-tab-header">
        <div class="settings-v2-tab-header-row">
          <div class="flex flex-col gap-1">
            <h2 class="settings-v2-tab-title">{language.t("settings.tab.extensions")}</h2>
            <span class="text-11-regular text-v2-text-text-muted">{language.t("settings.extensions.description")}</span>
          </div>
          <InlineServerSelect />
        </div>
      </div>

      <div class="settings-v2-tab-body">
        <Tabs variant="pill" defaultValue="mcps" class="settings-v2-extensions-tabs">
          <Tabs.List>
            <Tabs.Trigger value="mcps">{language.t("settings.extensions.tab.mcps")}</Tabs.Trigger>
            <Tabs.Trigger value="plugins">{language.t("status.popover.tab.plugins")}</Tabs.Trigger>
            <Tabs.Trigger value="skills">{language.t("settings.extensions.tab.skills")}</Tabs.Trigger>
          </Tabs.List>

          <Tabs.Content value="mcps">
            <div class="settings-v2-section">
              <div class="flex items-center justify-between">
                <span class="text-13-medium text-v2-text-text-base">
                  {language.t("settings.extensions.availableAll")}
                </span>
                <span class="text-13-regular text-v2-text-faint">{language.t("settings.extensions.manageConfig")}</span>
              </div>
              <div class="bg-[var(--v2-background-bg-base)] border-[0.5px] border-[var(--v2-border-border-base)] rounded-[8px] pl-4 pr-3 overflow-hidden">
                <ExtensionsListStatus
                  loading={mcpList.loading}
                  error={!!mcpList.error}
                  empty={mcps().length === 0}
                  emptyText={language.t("dialog.mcp.empty")}
                  onRetry={() => refetchMcp()}
                >
                  <For each={mcps()}>
                    {(item) => (
                      <div class="py-4 flex items-center justify-between border-b-[0.5px] border-[var(--v2-border-border-base)] last:border-b-0">
                        <div class="flex items-center gap-2.5 min-w-0">
                          <Icon name="mcp" class="text-v2-icon-icon-muted shrink-0" />
                          <span class="text-13-medium text-v2-text-text-base truncate">{item.name}</span>
                        </div>
                        <Switch checked={item.enabled} onChange={(checked) => handleMcpToggle(item, checked)} hideLabel>
                          {item.name}
                        </Switch>
                      </div>
                    )}
                  </For>
                </ExtensionsListStatus>
              </div>
            </div>
          </Tabs.Content>

          <Tabs.Content value="plugins">
            <div class="settings-v2-section">
              <div class="flex items-center justify-between">
                <span class="text-13-medium text-v2-text-text-base">
                  {language.t("settings.extensions.availableAll")}
                </span>
                <span class="text-13-regular text-v2-text-faint">{language.t("settings.extensions.manageConfig")}</span>
              </div>
              <div class="bg-[var(--v2-background-bg-base)] border-[0.5px] border-[var(--v2-border-border-base)] rounded-[8px] pl-4 pr-3 overflow-hidden">
                <ExtensionsListStatus
                  loading={pluginList.loading}
                  error={!!pluginList.error}
                  empty={plugins().length === 0}
                  emptyText={language.t("dialog.plugins.empty")}
                  onRetry={() => refetchPlugins()}
                >
                  <For each={plugins()}>
                    {(plugin) => (
                      <div class="py-4 flex items-center justify-between border-b-[0.5px] border-[var(--v2-border-border-base)] last:border-b-0">
                        <div class="flex items-center gap-2.5 min-w-0">
                          <Icon name="cube" class="text-v2-icon-icon-muted shrink-0" />
                          <span class="text-13-medium text-v2-text-text-base truncate font-mono">{plugin.name}</span>
                        </div>
                      </div>
                    )}
                  </For>
                </ExtensionsListStatus>
              </div>
            </div>
          </Tabs.Content>

          <Tabs.Content value="skills">
            <div class="settings-v2-section">
              <div class="flex items-center justify-between">
                <span class="text-13-medium text-v2-text-text-base">
                  {language.t("settings.extensions.availableAll")}
                </span>
                <ExternalLink
                  class="text-13-regular text-v2-text-accent hover:underline"
                  href="https://github.com/ktaiorg/kt-opencode"
                >
                  {language.t("settings.extensions.addSkills")}
                </ExternalLink>
              </div>
              <div class="bg-[var(--v2-background-bg-base)] border-[0.5px] border-[var(--v2-border-border-base)] rounded-[8px] pl-4 pr-3 overflow-hidden">
                <ExtensionsListStatus
                  loading={
                    serverSdk.connection.status() === "connected" &&
                    data.location.skill.list() === undefined &&
                    !skillFailed()
                  }
                  error={skillFailed()}
                  empty={skills().length === 0}
                  emptyText={language.t("settings.extensions.skills.empty")}
                  onRetry={syncSkills}
                >
                  <For each={skills()}>
                    {(skill) => (
                      <div class="py-4 flex items-center justify-between border-b-[0.5px] border-[var(--v2-border-border-base)] last:border-b-0">
                        <div class="flex items-center gap-2.5 min-w-0">
                          <Icon name="post-skill" class="text-v2-icon-icon-muted shrink-0" />
                          <span class="text-13-medium text-v2-text-text-base truncate">{skill.name}</span>
                        </div>
                      </div>
                    )}
                  </For>
                </ExtensionsListStatus>
              </div>
            </div>
          </Tabs.Content>
        </Tabs>
      </div>
    </>
  )
}

const ExtensionsListStatus: Component<{
  loading: boolean
  error: boolean
  empty: boolean
  emptyText: string
  onRetry: () => void
  children: JSX.Element
}> = (props) => {
  const language = useLanguage()
  return (
    <Show
      when={!props.loading}
      fallback={
        <div class="settings-v2-provider-empty">
          {language.t("common.loading")}
          {language.t("common.loading.ellipsis")}
        </div>
      }
    >
      <Show
        when={!props.error}
        fallback={
          <div class="settings-v2-provider-empty flex items-center justify-between">
            <span>{language.t("common.requestFailed")}</span>
            <Button size="normal" variant="ghost-muted" onClick={() => props.onRetry()}>
              {language.t("common.retry")}
            </Button>
          </div>
        }
      >
        <Show when={!props.empty} fallback={<div class="settings-v2-provider-empty">{props.emptyText}</div>}>
          {props.children}
        </Show>
      </Show>
    </Show>
  )
}
