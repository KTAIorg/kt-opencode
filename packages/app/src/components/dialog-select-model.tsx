import { Popover as Kobalte } from "@kobalte/core/popover"
import { ComponentProps, createEffect, createMemo, For, JSX, Show } from "solid-js"
import { createStore } from "solid-js/store"
import { useLocal } from "@/context/local"
import { useModels } from "@/context/models"
import { useDialog } from "@opencode-ai/ui/context/dialog"
import { popularProviders } from "@/hooks/use-providers"
import { Badge } from "@opencode-ai/ui/badge"
import { Icon } from "@opencode-ai/ui/icon"
import { ScrollView } from "@opencode-ai/ui/scroll-view"
import { Tooltip } from "@opencode-ai/ui/tooltip"
import { Menu } from "@opencode-ai/ui/menu"
import { ModelTooltip } from "./model-tooltip"
import { useLanguage } from "@/context/language"
import { handleDocumentSearchKeydown } from "@/utils/search-keydown"
import { createMenuDismissController } from "@/utils/menu-dismiss-controller"
import { createEventListener } from "@solid-primitives/event-listener"
import { customerFacingProviderName } from "@/utils/kt-settlement"
import { matchesModelSearch } from "./dialog-select-model-search"
import { ModelProbeBadge } from "./model-probe-badge"

const isFree = (provider: string, cost: { input: number } | undefined) =>
  provider === "opencode" && (!cost || cost.input === 0)

type ModelState = ReturnType<typeof useLocal>["model"]
type ModelItem = ReturnType<ModelState["list"]>[number]

const modelKey = (model: ModelItem) => `${model.provider.id}:${model.id}`
const manageKey = "action:manage"

const sortModelGroups = (a: { category: string; items: ModelItem[] }, b: { category: string; items: ModelItem[] }) => {
  const aIndex = popularProviders.indexOf(a.category)
  const bIndex = popularProviders.indexOf(b.category)
  const aPopular = aIndex >= 0
  const bPopular = bIndex >= 0

  if (aPopular && !bPopular) return -1
  if (!aPopular && bPopular) return 1
  if (aPopular && bPopular) return aIndex - bIndex
  return a.items[0].provider.name.localeCompare(b.items[0].provider.name)
}

type ModelSelectorTriggerProps = Omit<ComponentProps<typeof Kobalte.Trigger>, "as" | "ref">
type ModelSelectorTrigger = (props: ModelSelectorTriggerProps) => JSX.Element

export function ModelSelectorPopoverV2(props: {
  provider?: string
  model?: ModelState
  trigger: ModelSelectorTrigger
  onClose?: () => void
}) {
  const dialog = useDialog()
  const controller = createModelSelectorController({
    model: props.model,
    provider: () => props.provider,
    onSelect: () => props.onClose?.(),
  })

  return (
    <ModelSelectorPopoverV2View
      trigger={props.trigger}
      models={controller.models}
      hiddenUnavailable={controller.hiddenUnavailable}
      hiddenByUser={controller.hiddenByUser}
      probe={controller.probe}
      groups={controller.groups}
      current={controller.current()}
      select={controller.select}
      onManage={() => {
        void import("./dialog-manage-models").then((module) => module.openManageModels({ dialog }))
      }}
      onClose={() => props.onClose?.()}
    />
  )
}

function createModelSelectorController(input: {
  provider: () => string | undefined
  model?: ModelState
  onSelect: () => void
}) {
  const model = input.model ?? useLocal().model
  const models = useModels()
  const scope = createMemo(() =>
    model.list().filter((item) => (input.provider() ? item.provider.id === input.provider() : true)),
  )
  const visible = createMemo(() =>
    scope().filter((item) => model.visible({ modelID: item.id, providerID: item.provider.id })),
  )
  const bySearch = (items: ModelItem[], search: string) =>
    items.filter((item) => matchesModelSearch(search, [item.name, item.id, item.provider.name]))
  // 硬失败才算不可用；限流（429）是暂时状态，保留可见。
  const unavailable = (item: ModelItem) => models.probe.unavailable({ modelID: item.id, providerID: item.provider.id })
  const shown = (search: string) => {
    const items = bySearch(visible(), search)
    return models.probe.state().hideUnavailable ? items.filter((item) => !unavailable(item)) : items
  }

  return {
    models: (search: string) => [...shown(search)].sort((a, b) => a.name.localeCompare(b.name)),
    // 「隐藏不可用」实际滤掉的行数，用来在列表里提示；没开启或没滤掉时为 0。
    hiddenUnavailable: (search: string) =>
      models.probe.state().hideUnavailable ? bySearch(visible(), search).filter(unavailable).length : 0,
    // 用户在「管理模型」里自己关掉的模型：和上面的不可用是两码事，不能合成一句。
    hiddenByUser: (search: string) =>
      bySearch(
        scope().filter((item) => models.hiddenByUser({ modelID: item.id, providerID: item.provider.id })),
        search,
      ).length,
    probe: {
      running: () => models.probe.running(),
      autoRun: () => models.probe.autoRun(),
    },
    groups: (models: ModelItem[]) => {
      const byProvider = new Map<string, ModelItem[]>()
      for (const item of models) {
        byProvider.set(item.provider.id, [...(byProvider.get(item.provider.id) ?? []), item])
      }
      return Array.from(byProvider, ([category, items]) => ({ category, items })).sort(sortModelGroups)
    },
    current: () => {
      const value = model.current()
      return value ? modelKey(value) : undefined
    },
    select: (item: ModelItem) => {
      model.set({ modelID: item.id, providerID: item.provider.id }, { recent: true })
      input.onSelect()
    },
  }
}

function ModelSelectorPopoverV2View(props: {
  trigger: ModelSelectorTrigger
  models: (search: string) => ModelItem[]
  hiddenUnavailable: (search: string) => number
  hiddenByUser: (search: string) => number
  probe: { running: () => boolean; autoRun: () => void }
  groups: (models: ModelItem[]) => { category: string; items: ModelItem[] }[]
  current: string | undefined
  select: (item: ModelItem) => void
  onManage: () => void
  onClose: () => void
}) {
  const language = useLanguage()
  const [store, setStore] = createStore({ open: false, search: "", active: "" })
  let searchRef: HTMLInputElement | undefined
  let contentRef: HTMLDivElement | undefined
  const dismiss = createMenuDismissController(() => contentRef)
  const noticeClass = "px-3 py-1.5 text-[11px] font-[440] leading-4 tracking-[-0.04px] text-v2-text-text-faint"

  const models = createMemo(() => props.models(store.search))
  const groups = createMemo(() => props.groups(models()))
  const keys = () => [...models().map(modelKey), manageKey]
  const initialActive = () => {
    const selected = props.current
    const options = keys()
    if (selected && options.includes(selected)) return selected
    return options[0] ?? ""
  }
  const activeItem = () =>
    store.active ? contentRef?.querySelector<HTMLElement>(`[data-option-key="${CSS.escape(store.active)}"]`) : undefined
  const setOpen = (open: boolean) => {
    if (open) {
      dismiss.allowTriggerRestore()
      setStore({ open: true, active: initialActive() })
      // 列表打开就顺带刷新过期的可用性探测，不阻塞渲染。
      props.probe.autoRun()
      setTimeout(() =>
        requestAnimationFrame(() => {
          searchRef?.focus()
          activeItem()?.scrollIntoView({ block: "nearest" })
        }),
      )
      return
    }
    setStore({ open: false, search: "", active: "" })
  }
  const selectModel = (item: ModelItem) => {
    dismiss.preventTriggerRestore()
    setOpen(false)
    dismiss.afterClose(() => props.select(item))
  }
  const manage = () => {
    dismiss.preventTriggerRestore()
    setOpen(false)
    dismiss.afterClose(props.onManage)
  }
  const selectActive = () => {
    const item = models().find((item) => modelKey(item) === store.active)
    if (item) {
      selectModel(item)
      return
    }
    if (store.active === manageKey) manage()
  }
  const moveActive = (delta: number) => {
    const options = keys()
    if (options.length === 0) return
    const index = options.indexOf(store.active)
    const start = index === -1 ? 0 : index
    setStore("active", options[(start + delta + options.length) % options.length])
    queueMicrotask(() => activeItem()?.scrollIntoView({ block: "nearest" }))
  }
  const setSearch = (value: string) => {
    const first = props.models(value)[0]
    setStore({ search: value, active: first ? modelKey(first) : manageKey })
  }

  createEffect(() => {
    if (!store.open) return
    createEventListener(
      document,
      "keydown",
      (event: KeyboardEvent) => handleDocumentSearchKeydown(searchRef, event, store.search, setSearch),
      true,
    )
  })

  return (
    <Menu open={store.open} modal={false} placement="top-start" gutter={6} onOpenChange={setOpen}>
      <Menu.Trigger as={props.trigger} />
      <Menu.Portal>
        <Menu.Content
          ref={(element: HTMLDivElement) => (contentRef = element)}
          class="w-[284px] overflow-hidden rounded-md border-0 bg-v2-background-bg-layer-01 !p-0 shadow-[var(--v2-elevation-floating)] focus:outline-none"
          onPointerDownOutside={dismiss.preventTriggerRestore}
          onFocusOutside={dismiss.preventTriggerRestore}
          onCloseAutoFocus={dismiss.onCloseAutoFocus}
        >
          <div class="flex flex-col p-0.5">
            <div class="flex h-7 items-center gap-2 rounded-sm pl-3 pr-2.5 text-v2-icon-icon-muted">
              <Icon name="magnifying-glass" size="small" class="shrink-0" />
              <input
                ref={(el) => (searchRef = el)}
                value={store.search}
                placeholder={language.t("dialog.model.search.placeholder")}
                class="h-7 min-w-0 flex-1 border-0 bg-transparent text-[13px] font-[440] leading-5 tracking-[-0.04px] text-v2-text-text-base outline-none placeholder:text-v2-text-text-faint"
                spellcheck={false}
                autocorrect="off"
                autocomplete="off"
                autocapitalize="off"
                onInput={(event) => setSearch(event.currentTarget.value)}
                onKeyDown={(event) => {
                  if (event.key === "Tab") return
                  event.stopPropagation()
                  if (event.key === "Escape") {
                    event.preventDefault()
                    dismiss.preventTriggerRestore()
                    setOpen(false)
                    dismiss.afterClose(props.onClose)
                    return
                  }
                  if (event.altKey || event.metaKey) return
                  if (event.key === "ArrowDown") {
                    event.preventDefault()
                    moveActive(1)
                    return
                  }
                  if (event.key === "ArrowUp") {
                    event.preventDefault()
                    moveActive(-1)
                    return
                  }
                  if (event.key === "Enter" && !event.isComposing) {
                    event.preventDefault()
                    selectActive()
                  }
                }}
              />
              <Show when={store.search.trim()}>
                <button
                  type="button"
                  class="flex size-5 items-center justify-center rounded-sm text-v2-icon-icon-muted hover:bg-v2-overlay-simple-overlay-hover"
                  onPointerDown={(event) => event.preventDefault()}
                  onClick={() => setSearch("")}
                  aria-label={language.t("common.clear")}
                >
                  <Icon name="close" size="small" />
                </button>
              </Show>
            </div>
          </div>
          <div class="h-px bg-v2-border-border-muted" />
          <ScrollView data-slot="model-selector-scroll" class="max-h-[220px] min-h-0">
            <div class="flex flex-col p-0.5 pt-0">
              <Show when={props.probe.running()}>
                <div class={noticeClass}>{language.t("dialog.model.probe.running")}</div>
              </Show>
              <Show when={props.hiddenUnavailable(store.search) > 0}>
                <div class={noticeClass}>
                  {language.plural("dialog.model.probe.hidden", props.hiddenUnavailable(store.search))}
                </div>
              </Show>
              <Show when={props.hiddenByUser(store.search) > 0}>
                <div class={noticeClass}>
                  {language.plural("dialog.model.hiddenByUser", props.hiddenByUser(store.search))}
                </div>
              </Show>
              <Show
                when={models().length > 0}
                fallback={
                  <div class="flex h-12 items-center px-3 text-[13px] font-[440] leading-5 tracking-[-0.04px] text-v2-text-text-faint">
                    {language.t("dialog.model.empty")}
                  </div>
                }
              >
                <For each={groups()}>
                  {(group) => (
                    <Menu.Group>
                      <Menu.GroupLabel class="gap-2 px-3">
                        <span class="min-w-0 truncate">
                          {customerFacingProviderName(group.items[0].provider.id, group.items[0].provider.name)}
                        </span>
                      </Menu.GroupLabel>
                      <Menu.RadioGroup value={props.current}>
                        <For each={group.items}>
                          {(item) => (
                            <Tooltip
                              class="w-full"
                              placement="right-start"
                              gutter={6}
                              openDelay={0}
                              value={
                                <ModelTooltip
                                  model={item}
                                  latest={item.latest}
                                  free={isFree(item.provider.id, item.cost)}
                                  v2
                                />
                              }
                            >
                              <Menu.RadioItem
                                value={modelKey(item)}
                                data-option-key={modelKey(item)}
                                data-selected-model={props.current === modelKey(item) ? true : undefined}
                                class="scroll-my-6 w-full"
                                classList={{ "!bg-v2-overlay-simple-overlay-hover": store.active === modelKey(item) }}
                                onMouseEnter={() => {
                                  setStore("active", modelKey(item))
                                  setTimeout(() => searchRef?.focus())
                                }}
                                onSelect={() => selectModel(item)}
                              >
                                <span class="min-w-0 truncate leading-5">{item.name}</span>
                                <ModelProbeBadge providerID={item.provider.id} modelID={item.id} />
                                <Show when={isFree(item.provider.id, item.cost)}>
                                  <Badge class="shrink-0">{language.t("model.tag.free")}</Badge>
                                </Show>
                                <Show when={item.latest}>
                                  <Badge class="shrink-0">{language.t("model.tag.latest")}</Badge>
                                </Show>
                              </Menu.RadioItem>
                            </Tooltip>
                          )}
                        </For>
                      </Menu.RadioGroup>
                    </Menu.Group>
                  )}
                </For>
              </Show>
            </div>
          </ScrollView>
          <div class="h-px bg-v2-border-border-muted" />
          <div class="flex flex-col p-0.5">
            <Menu.Item
              data-option-key={manageKey}
              classList={{ "!bg-v2-overlay-simple-overlay-hover": store.active === manageKey }}
              onMouseEnter={() => {
                setStore("active", manageKey)
                setTimeout(() => searchRef?.focus())
              }}
              onSelect={manage}
            >
              <Icon name="outline-sliders" size="small" />
              <span class="min-w-0 flex-1 truncate leading-5">{language.t("dialog.model.manage")}</span>
            </Menu.Item>
          </div>
        </Menu.Content>
      </Menu.Portal>
    </Menu>
  )
}
