import { Select } from "@opencode-ai/ui/select"
import { createMemo, type Component } from "solid-js"
import { useLanguage } from "@/context/language"

// 语言选择只有这一份实现：设置里的「语言」行和标题栏都用它。
export const LanguageSelect: Component<{
  valueClass?: string
  "data-action"?: string
}> = (props) => {
  const language = useLanguage()
  const options = createMemo(() =>
    language.locales.map((locale) => ({
      value: locale,
      label: language.label(locale),
    })),
  )
  const current = () => {
    const value = language.locale()
    return options().find((option) => option.value === value)
  }

  return (
    <Select
      valueClass={props.valueClass}
      data-action={props["data-action"]}
      options={options()}
      placement="bottom-end"
      gutter={6}
      current={current()}
      value={(option) => option.value}
      label={(option) => option.label}
      triggerLabel={language.t("language.select.label")}
      onSelect={(option) => option && language.setLocale(option.value)}
    />
  )
}
