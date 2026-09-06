#!/usr/bin/env bun

import { spawnSync } from "node:child_process"

const owner = process.env.GITHUB_REPOSITORY_OWNER || "KTAIorg"
const repo = process.env.GITHUB_REPOSITORY?.split("/")[1] || "kt-opencode"
const releaseTag = requiredEnv("RELEASE_TAG")
const ktaiVersion = requiredEnv("KTAI_VERSION")
const upstreamVersion = requiredEnv("UPSTREAM_VERSION")
const commitSha = requiredEnv("RELEASE_COMMIT_SHA")
const issueToken = requiredEnv("ISSUE_TOKEN")
// Project placement runs through the kt-gh broker proxy (zero-trust CI passport,
// kt-cli/kt-secrets#100): the runner assumes gha-ktaiorg-kt-opencode-prod via
// OIDC and kt-gh exchanges the STS badge for broker execution. No long-lived
// PAT (KT_PROJECTS_TOKEN is revoked and slated for removal). Placement stays
// best-effort: without a passport (local runs, pre-reconcile) it degrades to a
// warning and is backfilled via `kt gh`.
const ktGhBin = process.env.KT_GH_BIN?.trim() || "kt-gh"
const testAssignee = process.env.TEST_ASSIGNEE?.trim() || ""

const projectNumber = 5
const projectFields = {
  Status: "Todo",
  类别: "功能",
  优先级: "P1",
  所属模块: "KT测试组",
  需人工对接: "待确认",
}

export function buildIssueTitle(tag) {
  return `Kito 测试需求（${tag}）`
}

export function buildIssueBody({ release, pullRequest, linkedIssues, version, openCodeVersion, sha }) {
  const issueLines = linkedIssues.length
    ? linkedIssues.flatMap((issue, index) => [`${index + 1}. ${issue.title}`, `   - Issue：${issue.url}`])
    : ["- 本次合并 PR 没有通过 Closing keyword 关联 Issue，请重点按 PR 变更范围执行回归。"]
  const linkedIssueTests = linkedIssues.map(
    (issue, index) => `${index + 6}. 验证 \`#${issue.number}\` 描述的问题已修复，并检查相邻功能回归`,
  )
  const assetLines = release.assets.map((asset) => `- [${asset.name}](${asset.browser_download_url})`)

  return [
    `# ${release.tag_name}`,
    "## 概述",
    `- Kito 版本：\`${version}\``,
    `- OpenCode 上游版本：\`${openCodeVersion}\``,
    `- Release：[${release.name || release.tag_name}](${release.html_url})`,
    `- 发布 Commit：\`${sha}\``,
    `- 关联 PR：[${pullRequest.title}](${pullRequest.url})`,
    "",
    "### 关联 Issue",
    ...issueLines,
    "",
    "## 测试需求",
    "1. Windows x64：验证 EXE 可安装、启动、卸载，版本号与 Release 一致",
    "2. macOS Intel：验证未签名 PKG 可安装并启动，同时抽测 DMG、ZIP",
    "3. macOS Apple Silicon：验证未签名 PKG 可安装并启动，同时抽测 DMG、ZIP",
    "4. 验证 Kito 品牌名称、应用图标、协议唤起和安装包文件名正确",
    "5. 验证 Kito Provider 可读取模型目录、使用密钥发起请求，且仓库与安装包不包含明文密钥",
    ...linkedIssueTests,
    "",
    "## 对应的安装包",
    `生产 Release：${release.html_url}`,
    ...assetLines,
    "",
    "## 测试结果",
    "- [ ] Windows x64 通过",
    "- [ ] macOS Intel 通过",
    "- [ ] macOS Apple Silicon 通过",
    "- [ ] Kito Provider 与品牌能力通过",
    "- [ ] 关联 Issue 回归通过",
    "",
  ].join("\n")
}

async function main() {
  const release = await githubRest(
    issueToken,
    `/repos/${owner}/${repo}/releases/tags/${encodeURIComponent(releaseTag)}`,
  )
  if (!release.assets?.length) throw new Error(`Release ${releaseTag} has no assets`)

  const pullRequest = await findMergedPullRequest(commitSha)
  const linkedIssues = pullRequest.closingIssuesReferences.nodes || []
  const title = buildIssueTitle(releaseTag)
  const body = buildIssueBody({
    release,
    pullRequest,
    linkedIssues,
    version: ktaiVersion,
    openCodeVersion: upstreamVersion,
    sha: commitSha,
  })
  const existing = await findIssueByTitle(title)
  const issue = existing ? await updateIssue(existing.number, body) : await createIssue(title, body)

  await assignIssue(issue.number)
  // Best-effort through the broker proxy: the issue is already created+assigned,
  // so a missing passport or a broker hiccup must not fail the job.
  if (commandExists(ktGhBin)) {
    try {
      await ensureProjectPlacement(issue.number)
    } catch (error) {
      console.warn(`Project placement failed (issue still created+assigned): ${error.message}`)
    }
  } else {
    console.warn(`${ktGhBin} not available; skipping project placement (backfill via kt gh).`)
  }
  console.log(`${existing ? "Updated" : "Created"} test issue #${issue.number}: ${issue.url}`)
}

function requiredEnv(name) {
  const value = process.env[name]?.trim()
  if (!value) throw new Error(`Missing required env: ${name}`)
  return value
}

async function githubRest(token, path, init = {}) {
  const response = await fetch(`https://api.github.com${path}`, {
    ...init,
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "User-Agent": "kt-opencode-release-test-issue",
      ...init.headers,
    },
  })
  const payload = await response.json()
  if (!response.ok) throw new Error(`GitHub REST ${path} failed: ${JSON.stringify(payload)}`)
  return payload
}

async function githubGraphql(token, query, variables = {}) {
  const payload = await githubRest(token, "/graphql", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query, variables }),
  })
  if (payload.errors?.length) throw new Error(`GitHub GraphQL failed: ${JSON.stringify(payload.errors)}`)
  return payload.data
}

// Broker proxy for project placement: kt-gh exchanges the runner's aliyun STS
// badge for broker execution (no PAT on the runner). The structured verbs
// (project add/set, kt-secrets #110) replaced raw `api graphql`, which the
// broker now denies for machine subjects (#103: exec channel is human-only).
function ktGhProject(args) {
  const result = spawnSync(ktGhBin, [
    "--path", "/broker/",
    "--key", "GITHUB_CLASSIC__BROKER",
    "--owner", owner,
    "--repo", repo,
    ...args,
  ], { encoding: "utf8", timeout: 30_000 })
  if (result.error) throw new Error(`kt-gh spawn failed: ${result.error.message}`)
  if (result.status !== 0) throw new Error(`kt-gh failed (exit ${result.status}): ${result.stderr || result.stdout}`)
  return result.stdout
}

function commandExists(command) {
  return spawnSync("which", [command], { statusOnly: true }).status === 0
}

async function findMergedPullRequest(sha) {
  const pulls = await githubRest(issueToken, `/repos/${owner}/${repo}/commits/${sha}/pulls`)
  const merged = pulls.find((pull) => pull.merged_at)
  if (!merged) throw new Error(`No merged pull request is associated with commit ${sha}`)

  const data = await githubGraphql(
    issueToken,
    `query($owner:String!, $repo:String!, $number:Int!) {
      repository(owner:$owner, name:$repo) {
        pullRequest(number:$number) {
          number
          title
          url
          closingIssuesReferences(first:20) {
            nodes { number title url }
          }
        }
      }
    }`,
    { owner, repo, number: merged.number },
  )
  return data.repository.pullRequest
}

async function findIssueByTitle(title) {
  const query = encodeURIComponent(`repo:${owner}/${repo} is:issue in:title "${title}"`)
  const result = await githubRest(issueToken, `/search/issues?q=${query}&per_page=10`)
  const match = result.items.find((item) => item.title === title)
  if (!match) return null
  return getIssue(match.number)
}

async function getIssue(number) {
  const data = await githubGraphql(
    issueToken,
    `query($owner:String!, $repo:String!, $number:Int!) {
      repository(owner:$owner, name:$repo) {
        issue(number:$number) { id number url body }
      }
    }`,
    { owner, repo, number },
  )
  return data.repository.issue
}

async function createIssue(title, body) {
  const issue = await githubRest(issueToken, `/repos/${owner}/${repo}/issues`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ title, body }),
  })
  return getIssue(issue.number)
}

async function updateIssue(number, body) {
  await githubRest(issueToken, `/repos/${owner}/${repo}/issues/${number}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ body }),
  })
  return getIssue(number)
}

async function assignIssue(number) {
  if (!testAssignee) return
  const response = await fetch(`https://api.github.com/repos/${owner}/${repo}/issues/${number}/assignees`, {
    method: "POST",
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${issueToken}`,
      "Content-Type": "application/json",
      "User-Agent": "kt-opencode-release-test-issue",
    },
    body: JSON.stringify({ assignees: [testAssignee] }),
  })
  if (response.ok) return
  console.warn(`Unable to assign ${testAssignee}: ${await response.text()}`)
}

async function ensureProjectPlacement(issueNumber) {
  // project add is idempotent (already-on-board reuses the item), and each
  // field is a separate verb call — no GraphQL ID juggling on the runner.
  ktGhProject(["project", "add", "--project", String(projectNumber), String(issueNumber)])
  for (const [fieldName, optionName] of Object.entries(projectFields)) {
    ktGhProject([
      "project", "set", "--project", String(projectNumber), String(issueNumber),
      "--field", fieldName, "--option", optionName,
    ])
  }
}

if (import.meta.main) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.stack || error.message : String(error))
    process.exit(1)
  })
}
