import { For, type JSXElement } from "solid-js"
import { createStore } from "solid-js/store"
import { ToolsMenu, ToolsMenuIcon, type ToolsMenuProps, type ToolsMenuStatus, type ToolsMenuTab } from "./tools-menu"

export default {
  title: "Desktop V2/Tools Menu",
  id: "desktop-v2-tools-menu",
  component: ToolsMenu,
  tags: ["autodocs"],
  parameters: {
    docs: {
      description: {
        component: `The desktop V2 Tools menu shown in the titlebar. Stories cover every MCP status, both LSP states, populated plugin rows, and empty states for all tabs.`,
      },
    },
  },
}

const labels = {
  menu: "Tools",
  mcp: "MCP",
  lsp: "LSP",
  plugins: "Plugins",
  mcpDescription: "Add MCP servers in opencode.json",
  lspDescription: "LSPs are auto-detected as you open files",
  pluginsDescription: "Add plugins in opencode.json",
  disabled: "Disabled",
  failed: "Failed",
  reauthenticate: "Reauthenticate",
}

const empty = {
  mcp: "No MCPs configured yet",
  lsp: "No active language servers yet",
  plugins: "No plugins configured yet",
}

const mcp = [
  { name: "ui-docs", status: "needs_auth" },
  { name: "browser-tools", status: "needs_client_registration" },
  { name: "brave-search", status: "disabled" },
  { name: "fastmail-mcp", status: "connected" },
  { name: "puppeteer", status: "failed" },
  { name: "figma", status: "connected" },
  { name: "playwright", status: "failed" },
] satisfies Array<{ name: string; status: ToolsMenuStatus }>

const lsp = [
  { name: "typescript", status: "connected" },
  { name: "eslint", status: "connected" },
  { name: "rust-analyzer", status: "error" },
] satisfies ToolsMenuProps["lsp"]

const plugins = ["opencode-devcontainers", "opencode-daytona", "~/.config/opencode/plugins/ping.ts"]

const populated = {
  labels,
  empty,
  mcp,
  lsp,
  plugins,
} satisfies Omit<ToolsMenuProps, "defaultTab">

function InteractiveMenu() {
  const [state, setState] = createStore({ mcp: mcp.map((item) => ({ ...item, pending: false })) })
  return (
    <MenuPreview warning>
      <ToolsMenu
        {...populated}
        mcp={state.mcp.map((item, index) => ({
          ...item,
          onToggle: () => {
            if (item.status === "needs_auth" || item.status === "needs_client_registration") return
            setState("mcp", index, "status", item.status === "connected" ? "disabled" : "connected")
          },
        }))}
      />
    </MenuPreview>
  )
}

function MenuPreview(props: { warning?: boolean; children: JSXElement }) {
  return (
    <div class="flex flex-col gap-2">
      <div class="flex h-7 items-center gap-2 text-[11px] font-[530] uppercase tracking-[0.05px] text-v2-text-text-faint">
        <ToolsMenuIcon warning={props.warning} />
        {props.warning ? "warning" : "normal"}
      </div>
      {props.children}
    </div>
  )
}

function Gallery(props: { empty?: boolean }) {
  const tabs: ToolsMenuTab[] = ["mcp", "lsp", "plugins"]
  return (
    <div class="flex flex-wrap items-start gap-6">
      <For each={tabs}>
        {(tab) => (
          <MenuPreview warning={!props.empty && tab !== "plugins"}>
            <ToolsMenu
              {...populated}
              defaultTab={tab}
              mcp={props.empty ? [] : populated.mcp}
              lsp={props.empty ? [] : populated.lsp}
              plugins={props.empty ? [] : populated.plugins}
            />
          </MenuPreview>
        )}
      </For>
    </div>
  )
}

export const Interactive = {
  render: () => <InteractiveMenu />,
}

export const AllTabs = {
  name: "All populated tabs",
  render: () => <Gallery />,
}

export const EmptyStates = {
  name: "All empty tabs",
  render: () => <Gallery empty />,
}

export const McpPending = {
  name: "MCP pending toggle",
  render: () => (
    <MenuPreview warning>
      <ToolsMenu {...populated} mcp={populated.mcp.map((item) => ({ ...item, pending: item.name === "figma" }))} />
    </MenuPreview>
  ),
}
