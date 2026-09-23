import { Tooltip } from "@opencode-ai/ui/tooltip"
import { Show, type Component } from "solid-js"
import { useLanguage } from "@/context/language"
import { useModels } from "@/context/models"

/** 渠道可用性探测结果圆点：绿=可用、橙=限流（暂时）、红=不可用；探测中显示灰色脉冲，未探测且不在本次探测内的不渲染。 */
export const ModelProbeBadge: Component<{ providerID: string; modelID: string; class?: string }> = (props) => {
  const models = useModels()
  const language = useLanguage()

  const result = () => models.probe.result({ providerID: props.providerID, modelID: props.modelID })
  const probing = () => models.probe.probing({ providerID: props.providerID, modelID: props.modelID })
  const limited = () => models.probe.rateLimited({ providerID: props.providerID, modelID: props.modelID })
  const label = () => {
    const value = result()
    if (!value) return language.t("dialog.model.probe.running")
    if (value.ok) return language.t("dialog.model.probe.ok")
    if (limited()) return language.t("dialog.model.probe.rateLimited")
    return value?.error || language.t("dialog.model.probe.unavailable")
  }
  const dotClass = () => {
    const value = result()
    if (!value) return "animate-pulse bg-v2-icon-icon-muted"
    if (value.ok) return "bg-v2-state-fg-success"
    return limited() ? "bg-v2-state-fg-warning" : "bg-v2-state-fg-danger"
  }

  return (
    <Show when={result() || probing()}>
      <Tooltip appearance="standard" placement="top" value={label()}>
        <span
          role="img"
          aria-label={label()}
          class={`h-2 w-2 shrink-0 cursor-help rounded-full ${props.class ?? ""} ${dotClass()}`}
        />
      </Tooltip>
    </Show>
  )
}
