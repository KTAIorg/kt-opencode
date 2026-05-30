type SortableModelOption = {
  modelID: string
  title: string
  releaseDate: string
  free: boolean
}

export function sortModelOptions(a: SortableModelOption, b: SortableModelOption) {
  if (a.free && !b.free) return -1
  if (!a.free && b.free) return 1
  if (a.free && b.free) {
    if (a.modelID !== b.modelID) {
      if (a.modelID === "big-pickle") return -1
      if (b.modelID === "big-pickle") return 1
    }
    return b.releaseDate.localeCompare(a.releaseDate) || a.title.localeCompare(b.title)
  }
  return a.title.localeCompare(b.title)
}
