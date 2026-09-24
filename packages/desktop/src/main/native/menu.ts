import { app, BrowserWindow, Menu } from "electron"
import type { MenuItemConstructorOptions } from "electron"
import {
  DESKTOP_MENU,
  desktopMenuVisible,
  type DesktopMenuEntry,
  type DesktopMenuRole,
} from "@opencode-ai/app/desktop-menu"
import { Ipc, sendIpcEvent } from "../../shared/ipc-contract"

import { UPDATER_ENABLED } from "../constants"
import { openExternalURL } from "../files"
import { runDesktopMenuAction } from "./menu-actions"
import { nativeT } from "./translations"

type Deps = {
  trigger: (id: string) => void
  // Enabled command ids reported by the focused window's renderer. Commands the
  // renderer has not registered are disabled instead of silently doing nothing.
  commands: () => ReadonlySet<string> | undefined
  checkForUpdates: () => void
  relaunch: () => void
}

export function createMenu(deps: Deps) {
  if (process.platform !== "darwin") return

  const commands = deps.commands()
  const template = DESKTOP_MENU.filter((menu) => desktopMenuVisible(menu, "macos")).map((menu) => {
    if (menu.role) return { role: nativeRole(menu.role), label: menu.labelKey ? nativeT(menu.labelKey, appParams()) : undefined }
    return {
      label: menu.labelKey ? nativeT(menu.labelKey, appParams()) : undefined,
      submenu: menu.items
        ?.filter((entry) => desktopMenuVisible(entry, "macos"))
        .map((entry) => nativeItem(entry, deps, commands)),
    }
  })

  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}

export function sendMenuCommand(win: BrowserWindow, id: string) {
  sendIpcEvent(win.webContents, Ipc.menu.command, id)
}

function nativeItem(
  entry: DesktopMenuEntry,
  deps: Deps,
  commands: ReadonlySet<string> | undefined,
): MenuItemConstructorOptions {
  if (entry.type === "separator") return { type: "separator" }
  if (entry.role)
    return { role: nativeRole(entry.role), label: entry.labelKey ? nativeT(entry.labelKey, appParams()) : undefined }

  const item: MenuItemConstructorOptions = {
    label: entry.labelKey ? nativeT(entry.labelKey, appParams()) : undefined,
    accelerator: entry.accelerator?.macos,
    enabled: entry.command
      ? (commands?.has(entry.command) ?? false)
      : entry.enabled === "updater"
        ? UPDATER_ENABLED
        : undefined,
  }

  if (entry.command) {
    const command = entry.command
    item.click = () => deps.trigger(command)
  }
  if (entry.action) {
    const action = entry.action
    item.click = () =>
      runDesktopMenuAction(BrowserWindow.getFocusedWindow(), action, {
        checkForUpdates: deps.checkForUpdates,
        relaunch: deps.relaunch,
      })
  }
  if (entry.href) {
    const href = entry.href
    item.click = () => openExternalURL(href)
  }

  return item
}

function nativeRole(role: DesktopMenuRole) {
  return role as NonNullable<MenuItemConstructorOptions["role"]>
}

// macOS app-menu labels embed the running app name (e.g. "Hide Kito Dev"), so
// every label gets the channel-resolved name as the `app` parameter.
function appParams() {
  return { app: app.getName() }
}
