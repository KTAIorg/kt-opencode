import { splitProps, type JSX } from "solid-js"

export function ModelSelectorPopoverV2(props: { trigger: (props: Record<string, unknown>) => JSX.Element }) {
  const [local] = splitProps(props, ["trigger"])
  return <>{local.trigger({})}</>
}
