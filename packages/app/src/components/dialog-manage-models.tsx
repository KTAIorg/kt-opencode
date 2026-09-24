import { Button } from "@opencode-ai/ui/button"
import { Dialog, DialogBody, DialogHeader, DialogTitleGroup } from "@opencode-ai/ui/dialog"
import { Icon } from "@opencode-ai/ui/icon"
import { IconButton } from "@opencode-ai/ui/icon-button"
import { Menu } from "@opencode-ai/ui/menu"
import { ProviderIcon } from "@opencode-ai/ui/provider-icon"
import { Spinner } from "@opencode-ai/ui/spinner"
import { Switch } from "@opencode-ai/ui/switch"
import { TextInput } from "@opencode-ai/ui/text-input"
import { Badge } from "@opencode-ai/ui/badge"
import { useFilteredList } from "@opencode-ai/ui/hooks"
import { For, Show, type Component, createMemo, onMount } from "solid-js"
import { createStore } from "solid-js/store"
import { useLocal } from "@/context/local"
import { useModels } from "@/context/models"
import { popularProviders } from "@/hooks/use-providers"
import { useLanguage } from "@/context/language"
import { useDialog } from "@opencode-ai/ui/context/dialog"
import { DialogConnectProvider } from "./dialog-connect-provider"
import { ModelProbeBadge } from "./model-probe-badge"
import { decode64 } from "@/utils/base64"
import { customerFacingProviderName } from "@/utils/kt-settlement"
import { SettingsListV2 } from "./settings-v2/parts/list"
import { SettingsRowV2 } from "./settings-v2/parts/row"
import "./settings-v2/settings-v2.css"

type ModelItem = ReturnType<ReturnType<typeof useLocal>["model"]["list"]>[number]

// 分组折叠状态放模块级：弹窗关掉再打开也保留，应用重启后回到默认全展开。
const [collapsedGroups, setCollapsedGroups] = createStore<Record<string, boolean | undefined>>({})

export const DialogManageModelsV2: Component<{ initialSearch?: string }> = (props) => {
  const local = useLocal()
  const language = useLanguage()
  const dialog = useDialog()
  const models = useModels()
  const directory = () => decode64(local.slug())

  onMount(() => {
    models.probe.autoRun()
    if (props.initialSearch) list.onInput(props.initialSearch)
  })

  const handleConnectProvider = () => {
    void dialog.show(() => <DialogConnectProvider directory={directory()} />)
  }
  // 分组显示偏好是三态：default（清偏好回默认规则）/ show（显示全部）/ hide（隐藏全部）。
  const providerPref = (providerID: string) => models.providerPreference(providerID) ?? "default"
  const setProviderPref = (providerID: string, value: string) => {
    models.setProviderVisibility(providerID, value === "show" || value === "hide" ? value : "default")
  }
  const prefLabel = (pref: string) =>
    pref === "show"
      ? language.t("dialog.model.manage.showAll")
      : pref === "hide"
        ? language.t("dialog.model.manage.visibility.hide")
        : language.t("dialog.model.manage.visibility.default")
  // 三态用图标区分（眼睛=全部显示、划线眼=全部隐藏、滑杆=默认规则），纯文字难扫读。
  const prefIcon = (pref: string) => (pref === "show" ? "eye" : pref === "hide" ? "eye-off" : "sliders")
  // 搜索时强制展开，否则折叠组里的命中结果看不见。
  const groupExpanded = (providerID: string) => !collapsedGroups[providerID] || list.filter().length > 0
  const toggleGroup = (providerID: string) => setCollapsedGroups(providerID, (value) => !value)
  // 分组头状态计数：绿=可用、橙=限流、红=不可用、转圈=探测中；大组不展开也能看健康度。
  const groupStatus = (items: ModelItem[]) => {
    const counts = { ok: 0, limited: 0, unavailable: 0, pending: 0 }
    for (const item of items) {
      if (models.probe.probing({ providerID: item.provider.id, modelID: item.id })) {
        counts.pending++
        continue
      }
      const result = models.probe.result({ providerID: item.provider.id, modelID: item.id })
      if (!result) continue
      if (result.ok) counts.ok++
      else if (models.probe.rateLimited({ providerID: item.provider.id, modelID: item.id })) counts.limited++
      else counts.unavailable++
    }
    return counts
  }
  const statusSummary = (counts: { ok: number; limited: number; unavailable: number; pending: number }) =>
    [
      counts.pending > 0 ? `${language.t("dialog.model.probe.running")} ${counts.pending}` : undefined,
      counts.ok > 0 ? `${language.t("dialog.model.probe.ok")} ${counts.ok}` : undefined,
      counts.limited > 0 ? `${language.t("dialog.model.probe.rateLimited")} ${counts.limited}` : undefined,
      counts.unavailable > 0 ? `${language.t("dialog.model.probe.unavailable")} ${counts.unavailable}` : undefined,
    ]
      .filter((part) => part !== undefined)
      .join(" · ")
  const modelVisible = (item: ModelItem) => local.model.visible({ modelID: item.id, providerID: item.provider.id })
  // 默认规则藏起来的行（非用户显式关闭）：标出来，让「为什么这里看不到」可解释。
  const defaultHidden = (item: ModelItem) =>
    !models.hiddenByUser({ modelID: item.id, providerID: item.provider.id }) && !modelVisible(item)
  const setModelVisibility = (item: ModelItem, checked: boolean) => {
    local.model.setVisibility({ modelID: item.id, providerID: item.provider.id }, checked)
  }
  // 「设为当前」= 组合器选择器的同一个动作：选中并把该模型推进最近使用，然后关掉弹窗。
  const useModel = (item: ModelItem) => {
    local.model.set({ modelID: item.id, providerID: item.provider.id }, { recent: true })
    dialog.close()
  }
  const isCurrentModel = (item: ModelItem) => {
    const current = local.model.current()
    return current?.provider.id === item.provider.id && current?.id === item.id
  }
  const list = useFilteredList<ModelItem>({
    // 「隐藏不可用」开启时只滤硬失败（403/缺凭据等，Kito 与其它已探测渠道）；限流（429）是暂时状态，保留可见。
    items: () =>
      local.model.list().filter((item) => {
        if (!models.probe.state().hideUnavailable) return true
        return !models.probe.unavailable({ modelID: item.id, providerID: item.provider.id })
      }),
    key: (x) => `${x.provider.id}:${x.id}`,
    filterKeys: ["provider.name", "name", "id"],
    sortBy: (a, b) => a.name.localeCompare(b.name),
    groupBy: (x) => x.provider.id,
    sortGroupsBy: (a, b) => {
      const aRank = popularProviders.indexOf(a.category)
      const bRank = popularProviders.indexOf(b.category)
      const aPopular = aRank >= 0
      const bPopular = bRank >= 0
      if (aPopular && !bPopular) return -1
      if (!aPopular && bPopular) return 1
      return aRank - bRank
    },
  })

  return (
    <Dialog size="large" variant="settings" class="settings-v2-manage-models-dialog">
      <DialogHeader hideClose={true} closeLabel={language.t("common.close")}>
        <DialogTitleGroup
          title={language.t("dialog.model.manage")}
          description={language.t("dialog.model.manage.description")}
        />
        <div class="flex items-center gap-2">
          <Switch
            class="cursor-pointer"
            appearance="standard"
            checked={models.probe.state().hideUnavailable}
            onChange={(checked) => models.probe.setHideUnavailable(checked)}
          >
            {language.t("dialog.model.probe.hideUnavailable")}
          </Switch>
          <Button
            variant="neutral"
            icon="play"
            disabled={models.probe.running() || models.probe.probeable() === 0}
            onClick={() => void models.probe.run()}
          >
            {models.probe.running()
              ? language.t("dialog.model.probe.progress", {
                  done: models.probe.progress().done,
                  total: models.probe.progress().total,
                })
              : language.t("dialog.model.probe.action")}
          </Button>
          <Button variant="neutral" icon="plus" onClick={handleConnectProvider}>
            {language.t("command.provider.connect")}
          </Button>
        </div>
      </DialogHeader>
      <DialogBody class="flex min-h-0 flex-1 flex-col">
        <div class="px-4 pt-px pb-3">
          <div class="relative">
            <TextInput
              type="search"
              appearance="base"
              class="!w-full self-stretch"
              value={list.filter()}
              onInput={(event) => list.onInput(event.currentTarget.value)}
              placeholder={language.t("dialog.model.search.placeholder")}
              spellcheck={false}
              autocorrect="off"
              autocomplete="off"
              autocapitalize="off"
              autofocus
              aria-label={language.t("dialog.model.search.placeholder")}
            />
            <Show when={list.filter()}>
              <IconButton
                type="button"
                variant="ghost-muted"
                size="small"
                class="settings-v2-tab-search-clear"
                icon={<Icon name="close" size="large" class="text-v2-icon-icon-muted" />}
                onClick={() => list.clear()}
                aria-label={language.t("common.clear")}
              />
            </Show>
          </div>
        </div>
        <div data-slot="manage-models-scroll" class="relative min-h-0 flex-1">
          <div class="settings-v2-panel settings-v2-models h-full px-4 pt-4 pb-4">
            <Show
              when={!list.grouped.loading}
              fallback={
                <div class="settings-v2-models-status">
                  {language.t("common.loading")}
                  {language.t("common.loading.ellipsis")}
                </div>
              }
            >
              <Show
                when={list.flat().length > 0}
                fallback={
                  <div class="settings-v2-models-status">
                    <span>{language.t("dialog.model.empty")}</span>
                    <Show when={list.filter()}>
                      <span class="settings-v2-models-status-filter">&quot;{list.filter()}&quot;</span>
                    </Show>
                  </div>
                }
              >
                <For each={list.grouped.latest}>
                  {(group) => {
                    const providerName = customerFacingProviderName(
                      group.items[0].provider.id,
                      group.items[0].provider.name,
                    )
                    // 存取器而非一次性求值：Solid 的列表项渲染只跑一次，折叠态与计数必须跟着 store 走。
                    const expanded = () => groupExpanded(group.category)
                    const counts = () => groupStatus(group.items)
                    const summary = () => statusSummary(counts())
                    return (
                      <div class="settings-v2-section" data-component="settings-models-provider">
                        <div class="settings-v2-models-group-header justify-between">
                          <div class="flex min-w-0 items-center gap-2">
                            <button
                              type="button"
                              class="flex min-w-0 cursor-pointer items-center gap-2"
                              aria-expanded={expanded()}
                              aria-label={language.t(
                                expanded() ? "dialog.model.manage.group.collapse" : "dialog.model.manage.group.expand",
                                { provider: providerName },
                              )}
                              onClick={() => toggleGroup(group.category)}
                            >
                              <Icon
                                name={expanded() ? "chevron-down" : "chevron-right"}
                                size="small"
                                class="ml-4 shrink-0 text-v2-icon-icon-muted"
                              />
                              <ProviderIcon id={group.category} width={16} height={16} class="shrink-0" />
                              <h3 class="settings-v2-section-title truncate">{providerName}</h3>
                            </button>
                            <Show when={summary()}>
                              <div
                                class="flex shrink-0 items-center gap-2 text-[11px] font-[440] leading-none text-v2-text-text-muted"
                                title={summary()}
                              >
                                <Show when={counts().pending > 0}>
                                  <span class="flex items-center gap-1">
                                    <Spinner class="h-3 w-3 text-v2-icon-icon-muted" />
                                    {counts().pending}
                                  </span>
                                </Show>
                                <Show when={counts().ok > 0}>
                                  <span class="flex items-center gap-1">
                                    <span class="h-1.5 w-1.5 rounded-full bg-v2-state-fg-success" />
                                    {counts().ok}
                                  </span>
                                </Show>
                                <Show when={counts().limited > 0}>
                                  <span class="flex items-center gap-1">
                                    <span class="h-1.5 w-1.5 rounded-full bg-v2-state-fg-warning" />
                                    {counts().limited}
                                  </span>
                                </Show>
                                <Show when={counts().unavailable > 0}>
                                  <span class="flex items-center gap-1">
                                    <span class="h-1.5 w-1.5 rounded-full bg-v2-state-fg-danger" />
                                    {counts().unavailable}
                                  </span>
                                </Show>
                              </div>
                            </Show>
                          </div>
                          <div class="mr-6">
                            <Menu placement="bottom-end" gutter={4}>
                              <Menu.Trigger
                                class="flex h-7 cursor-pointer items-center gap-1 rounded-sm px-2 text-[13px] font-[440] leading-5 tracking-[-0.04px] text-v2-text-text-base hover:bg-v2-overlay-simple-overlay-hover"
                                aria-label={language.t("dialog.model.manage.provider.toggle", {
                                  provider: providerName,
                                })}
                              >
                                <Icon
                                  name={prefIcon(providerPref(group.category))}
                                  size="small"
                                  class="text-v2-icon-icon-muted"
                                />
                                {prefLabel(providerPref(group.category))}
                                <Icon name="chevron-down" size="small" class="text-v2-icon-icon-muted" />
                              </Menu.Trigger>
                              <Menu.Portal>
                                <Menu.Content class="min-w-[170px] overflow-hidden rounded-md border-0 bg-v2-background-bg-layer-01 p-0.5 shadow-[var(--v2-elevation-floating)] focus:outline-none">
                                  <Menu.RadioGroup
                                    value={providerPref(group.category)}
                                    onChange={(value) => setProviderPref(group.category, value)}
                                  >
                                    <Menu.RadioItem
                                      value="default"
                                      class="h-7 cursor-pointer rounded-sm px-3 text-[13px] font-[440] leading-5 tracking-[-0.04px] text-v2-text-text-base data-[highlighted]:!bg-v2-overlay-simple-overlay-hover"
                                    >
                                      <span class="flex items-center gap-2">
                                        <Icon name="sliders" size="small" class="text-v2-icon-icon-muted" />
                                        {language.t("dialog.model.manage.visibility.default")}
                                      </span>
                                    </Menu.RadioItem>
                                    <Menu.RadioItem
                                      value="show"
                                      class="h-7 cursor-pointer rounded-sm px-3 text-[13px] font-[440] leading-5 tracking-[-0.04px] text-v2-text-text-base data-[highlighted]:!bg-v2-overlay-simple-overlay-hover"
                                    >
                                      <span class="flex items-center gap-2">
                                        <Icon name="eye" size="small" class="text-v2-icon-icon-muted" />
                                        {language.t("dialog.model.manage.showAll")}
                                      </span>
                                    </Menu.RadioItem>
                                    <Menu.RadioItem
                                      value="hide"
                                      class="h-7 cursor-pointer rounded-sm px-3 text-[13px] font-[440] leading-5 tracking-[-0.04px] text-v2-text-text-base data-[highlighted]:!bg-v2-overlay-simple-overlay-hover"
                                    >
                                      <span class="flex items-center gap-2">
                                        <Icon name="eye-off" size="small" class="text-v2-icon-icon-muted" />
                                        {language.t("dialog.model.manage.visibility.hide")}
                                      </span>
                                    </Menu.RadioItem>
                                  </Menu.RadioGroup>
                                </Menu.Content>
                              </Menu.Portal>
                            </Menu>
                          </div>
                        </div>
                        <Show when={expanded()}>
                          <SettingsListV2>
                            <For each={group.items}>
                              {(item) => (
                                <div class="cursor-pointer" onClick={() => useModel(item)}>
                                  <SettingsRowV2 title={item.name} description="">
                                    <div class="flex items-center gap-2">
                                      <ModelProbeBadge class="ml-2" providerID={item.provider.id} modelID={item.id} />
                                      <Show when={defaultHidden(item)}>
                                        <Badge class="shrink-0">{language.t("dialog.model.manage.defaultHidden")}</Badge>
                                      </Show>
                                      <Button
                                        variant="neutral"
                                        disabled={isCurrentModel(item)}
                                        onClick={(event: MouseEvent) => {
                                          event.stopPropagation()
                                          useModel(item)
                                        }}
                                      >
                                        {isCurrentModel(item)
                                          ? language.t("dialog.model.use.current")
                                          : language.t("dialog.model.use")}
                                      </Button>
                                      <div onClick={(event) => event.stopPropagation()}>
                                        <Switch
                                          appearance="standard"
                                          checked={modelVisible(item)}
                                          onChange={(checked) => setModelVisibility(item, checked)}
                                          hideLabel
                                        >
                                          {language.t("dialog.model.manage.model.toggle", { model: item.name })}
                                        </Switch>
                                      </div>
                                    </div>
                                  </SettingsRowV2>
                                </div>
                              )}
                            </For>
                          </SettingsListV2>
                        </Show>
                      </div>
                    )
                  }}
                </For>
              </Show>
            </Show>
          </div>
        </div>
      </DialogBody>
    </Dialog>
  )
}

// 需要选择模型的地方（额度用尽后的「选择付费模型」）打开这个居中的弹窗，而不是挂在组合器上的 popover。
// search 用来从模型选择器「查看全部」跳转时预填过滤词，直接落到对应分组。
export function openManageModels(input: {
  dialog: ReturnType<typeof useDialog>
  onClose?: () => void
  search?: string
}) {
  void input.dialog.show(
    () => <DialogManageModelsV2 initialSearch={input.search} />,
    () => input.onClose?.(),
  )
}
