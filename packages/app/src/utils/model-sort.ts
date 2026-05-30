type SortableModel = {
  id: string
  name: string
  release_date: string
  provider: { id: string }
  cost?: { input: number }
}

export function isFreeModel(model: { provider: { id: string }; cost?: { input: number } }) {
  return model.provider.id === "opencode" && (!model.cost || model.cost.input === 0)
}

export function sortModels(a: SortableModel, b: SortableModel) {
  const aFree = isFreeModel(a)
  const bFree = isFreeModel(b)
  if (aFree && !bFree) return -1
  if (!aFree && bFree) return 1
  if (aFree && bFree) {
    if (a.id !== b.id) {
      if (a.id === "big-pickle") return -1
      if (b.id === "big-pickle") return 1
    }
    return b.release_date.localeCompare(a.release_date) || a.name.localeCompare(b.name)
  }
  return a.name.localeCompare(b.name)
}
