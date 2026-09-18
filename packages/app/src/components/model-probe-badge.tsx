import { Tooltip } from "@opencode-ai/ui/tooltip"
import { Show, type Component } from "solid-js"
import { useLanguage } from "@/context/language"
import { useModels } from "@/context/models"

/** 渠道可用性探测结果圆点；未探测过的模型不渲染。 */
export const ModelProbeBadge: Component<{ providerID: string; modelID: string; class?: string }> = (props) => {
  const models = useModels()
  const language = useLanguage()

  const result = () => models.probe.result({ providerID: props.providerID, modelID: props.modelID })
  const label = () => {
    const value = result()
    return value?.ok
      ? language.t("dialog.model.probe.ok")
      : value?.error || language.t("dialog.model.probe.unavailable")
  }

  return (
    <Show when={result()}>
      <Tooltip appearance="standard" placement="top" value={label()}>
        <span
          role="img"
          aria-label={label()}
          class={`h-2 w-2 shrink-0 cursor-help rounded-full ${props.class ?? ""} ${result()?.ok ? "bg-v2-state-fg-success" : "bg-v2-state-fg-danger"}`}
        />
      </Tooltip>
    </Show>
  )
}
