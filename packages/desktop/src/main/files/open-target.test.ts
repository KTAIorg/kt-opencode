import { describe, expect, test } from "bun:test"
import { isAllowedOpenApp, isExecutablePath } from "./open-target"

const windowsRoots = [
  "C:\\Program Files",
  "C:\\Program Files (x86)",
  "C:\\Users\\tester\\AppData\\Local\\Programs",
  "C:\\Windows\\System32",
]

describe("isExecutablePath", () => {
  test("flags files that execute when opened", () => {
    for (const path of [
      "C:\\Tools\\run.exe",
      "C:\\Tools\\run.bat",
      "C:\\Tools\\run.cmd",
      "C:\\Tools\\setup.msi",
      "C:\\Tools\\link.lnk",
      "C:\\Tools\\saver.scr",
      "C:\\Tools\\script.ps1",
      "C:\\Tools\\script.js",
      "C:\\Tools\\macro.vbs",
      "C:\\Tools\\keys.reg",
      "/Users/tester/bad.command",
      "/Users/tester/install.sh",
      "/Applications/Foo.app",
      "C:\\Tools\\UPPER.EXE",
    ]) {
      expect(isExecutablePath(path)).toBe(true)
    }
  })

  test("leaves ordinary documents openable", () => {
    for (const path of [
      "/Users/tester/readme.md",
      "/Users/tester/photo.png",
      "/Users/tester/project",
      "C:\\Users\\tester\\notes.txt",
      "C:\\Users\\tester\\archive.zip",
      "/Users/tester/.bashrc",
    ]) {
      expect(isExecutablePath(path)).toBe(false)
    }
  })
})

describe("isAllowedOpenApp", () => {
  test("accepts the known open-in app names", () => {
    for (const app of [
      "Visual Studio Code",
      "Cursor",
      "Zed",
      "TextMate",
      "Antigravity",
      "Terminal",
      "iTerm",
      "Ghostty",
      "Warp",
      "Xcode",
      "Android Studio",
      "Sublime Text",
      "code",
      "cursor",
      "zed",
      "powershell",
    ]) {
      expect(isAllowedOpenApp(app, "darwin")).toBe(true)
    }
  })

  test("rejects arbitrary binaries and paths on macOS and Linux", () => {
    for (const app of [
      "sh",
      "bash",
      "python3",
      "notepad",
      "calc",
      "/bin/sh",
      "/Applications/Xcode.app",
      "/tmp/evil/Code",
      "C:\\Tools\\run.exe",
      "..\\code",
    ]) {
      expect(isAllowedOpenApp(app, "darwin")).toBe(false)
      expect(isAllowedOpenApp(app, "linux")).toBe(false)
    }
  })

  test("accepts resolved editor binaries under program install roots", () => {
    for (const app of [
      "C:\\Program Files\\Microsoft VS Code\\Code.exe",
      "C:\\Users\\tester\\AppData\\Local\\Programs\\cursor\\Cursor.exe",
      "C:\\Users\\tester\\AppData\\Local\\Programs\\Zed\\Zed.exe",
      "C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe",
      "C:\\Program Files\\Sublime Text\\sublime_text.exe",
    ]) {
      expect(isAllowedOpenApp(app, "win32", windowsRoots)).toBe(true)
    }
  })

  test("rejects look-alike binaries outside install roots and unknown names", () => {
    for (const app of [
      "C:\\Users\\tester\\Downloads\\Code.exe",
      "C:\\Users\\tester\\AppData\\Local\\Temp\\cursor.exe",
      "D:\\Tools\\zed.exe",
      "C:\\Program Files\\NotAnApp\\evil.exe",
      "C:\\Program Files\\..\\Temp\\code.exe",
      "C:\\Program Files\\Microsoft VS Code\\Code.cmd",
      "\\\\share\\tools\\Code.exe",
    ]) {
      expect(isAllowedOpenApp(app, "win32", windowsRoots)).toBe(false)
    }
  })
})
