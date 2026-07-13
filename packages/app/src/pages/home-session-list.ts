export type HomeSessionListGroup<T> = {
  id: string
  title: string
  sessions: T[]
}

export type HomeSessionListRow<T> =
  | {
      type: "header"
      key: string
      group: HomeSessionListGroup<T>
    }
  | {
      type: "session"
      key: string
      group: HomeSessionListGroup<T>
      record: T
      last: boolean
      finalGroup: boolean
    }

export function homeSessionListRows<T>(groups: HomeSessionListGroup<T>[], key: (record: T) => string) {
  return groups.flatMap((group, groupIndex) => [
    { type: "header" as const, key: `header:${group.id}`, group },
    ...group.sessions.map((record, index) => ({
      type: "session" as const,
      key: key(record),
      group,
      record,
      last: index === group.sessions.length - 1,
      finalGroup: groupIndex === groups.length - 1,
    })),
  ])
}

export function homeSessionListRowSize<T>(row: HomeSessionListRow<T>) {
  if (row.type === "header") return 44
  if (!row.last) return 41
  return row.finalGroup ? 40 : 64
}

export function homeSessionActiveHeaderIndex<T>(rows: HomeSessionListRow<T>[], index: number) {
  return rows.slice(0, index + 1).findLastIndex((row) => row.type === "header")
}

export function shouldLoadMoreHomeSessions(input: {
  scrollTop: number
  scrollHeight: number
  clientHeight: number
  threshold: number
}) {
  return input.scrollHeight - input.scrollTop - input.clientHeight < input.threshold
}
