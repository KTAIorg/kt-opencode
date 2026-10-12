// 模型可见性的纯判定逻辑：单模型显式标记 > provider 级偏好 > 默认规则。
// 默认规则 = zen 免费模型始终可见，否则「每家族最新且 6 个月内」，没有有效发布日期也可见。
// 抽成纯函数便于单测；context/models.tsx 负责把 catalog 与持久化状态映射进来。

export type Visibility = "show" | "hide"

export type VisibilityInput = {
  userMark?: Visibility
  providerPref?: Visibility
  zenFree?: boolean
  latest?: boolean
  releaseValid?: boolean
}

export function resolveVisibility(input: VisibilityInput): boolean {
  if (input.userMark === "hide") return false
  if (input.userMark === "show") return true
  if (input.providerPref === "hide") return false
  if (input.providerPref === "show") return true
  if (input.zenFree) return true
  if (input.latest) return true
  return input.releaseValid !== true
}

export type VisibilityMark = {
  providerID: string
  modelID: string
  visibility: Visibility
}

// 旧版分组开关会把整组模型逐个写显式标记且永不回默认。组内「全部模型都有标记且同值」时
// 折叠成 provider 级偏好并清掉标记，恢复默认规则的回退路径；部分标记保持原样不动。
export function collapseProviderMarks(models: { providerID: string; modelID: string }[], user: VisibilityMark[]) {
  const marks = new Map(user.map((item) => [`${item.providerID}:${item.modelID}`, item.visibility]))
  const stats = new Map<string, { total: number; marked: number; show: number }>()
  for (const model of models) {
    const stat = stats.get(model.providerID) ?? { total: 0, marked: 0, show: 0 }
    stat.total++
    const mark = marks.get(`${model.providerID}:${model.modelID}`)
    if (mark !== undefined) {
      stat.marked++
      if (mark === "show") stat.show++
    }
    stats.set(model.providerID, stat)
  }

  const provider: Record<string, Visibility> = {}
  const collapsed = new Set<string>()
  for (const [providerID, stat] of stats) {
    if (stat.marked !== stat.total || stat.total === 0) continue
    if (stat.show === stat.total) provider[providerID] = "show"
    else if (stat.show === 0) provider[providerID] = "hide"
    else continue
    collapsed.add(providerID)
  }
  const keep = user.filter((item) => !collapsed.has(item.providerID))
  return { provider, keep }
}
