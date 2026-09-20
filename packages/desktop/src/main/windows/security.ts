import { BrowserWindow } from "electron"
import type { Session } from "electron"
import { openExternalURL } from "../files"
import { addRendererHeaders, isRendererUrl, upsertHeader } from "./protocol"

const rendererPermissions = new Set(["clipboard-sanitized-write", "notifications"])
const permissionedSessions = new WeakSet<Session>()

// Permission handlers are session-scoped: registering them per window would
// leave only the most recently created window covered. Register once per
// session and resolve the requesting window inside the handler instead.
export function allowRendererPermissions(win: BrowserWindow) {
  const session = win.webContents.session
  if (permissionedSessions.has(session)) return
  permissionedSessions.add(session)
  session.setPermissionRequestHandler((webContents, permission, callback, details) => {
    callback(
      rendererPermissions.has(permission) &&
        isRendererUrl(details.requestingUrl) &&
        Boolean(BrowserWindow.fromWebContents(webContents)),
    )
  })
  session.setPermissionCheckHandler((webContents, permission, requestingOrigin, details) => {
    if (!rendererPermissions.has(permission)) return false
    if (webContents && !BrowserWindow.fromWebContents(webContents)) return false
    return isRendererUrl(details.requestingUrl) || isRendererUrl(requestingOrigin)
  })
}

export function wireNavigationPolicy(win: BrowserWindow) {
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (!isRendererUrl(url)) openExternalURL(url)
    return { action: "deny" }
  })
  win.webContents.on("will-navigate", (event, url) => {
    if (isRendererUrl(url)) return
    event.preventDefault()
    openExternalURL(url)
  })
}

export function wireRendererHeaders(win: BrowserWindow) {
  win.webContents.session.webRequest.onBeforeSendHeaders((details, callback) => {
    upsertHeader(details.requestHeaders, "Access-Control-Allow-Origin", ["*"])
    callback({ requestHeaders: details.requestHeaders })
  })
  win.webContents.session.webRequest.onHeadersReceived((details, callback) => {
    const responseHeaders = details.responseHeaders ?? {}
    addRendererHeaders(details.url, responseHeaders)
    callback({ responseHeaders })
  })
}
