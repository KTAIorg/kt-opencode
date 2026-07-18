#!/usr/bin/env bun
import { $ } from "bun"
import path from "node:path"

const dist = path.resolve(import.meta.dir, "../dist")
const app = (await $`find ${dist} -maxdepth 3 -type d -name '*.app'`.text()).trim().split("\n")[0]
if (!app) throw new Error(`No macOS app bundle found in ${dist}`)

const pkg = await Bun.file(path.resolve(import.meta.dir, "../package.json")).json()
const arch = process.arch === "arm64" ? "arm64" : "x64"
const output = path.join(dist, `ktai-desktop-${pkg.version}-macos-${arch}.pkg`)

await $`pkgbuild --component ${app} --install-location /Applications --identifier cc.ktapi.desktop --version ${pkg.version} ${output}`
console.log(output)
