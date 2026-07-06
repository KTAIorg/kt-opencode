import { SearchExa } from "./exa"
import { SearchParallel } from "./parallel"

export const SearchPlugins = [SearchExa.Plugin, SearchParallel.Plugin] as const
