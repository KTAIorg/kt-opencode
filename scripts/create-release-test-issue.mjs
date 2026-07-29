#!/usr/bin/env bun

const owner = process.env.GITHUB_REPOSITORY_OWNER || "KTAIorg"
const repo = process.env.GITHUB_REPOSITORY?.split("/")[1] || "kt-opencode"
const releaseTag = requiredEnv("RELEASE_TAG")
const ktaiVersion = requiredEnv("KTAI_VERSION")
const upstreamVersion = requiredEnv("UPSTREAM_VERSION")
const commitSha = requiredEnv("RELEASE_COMMIT_SHA")
const issueToken = requiredEnv("ISSUE_TOKEN")
const projectToken = requiredEnv("PROJECT_TOKEN")
const testAssignee = process.env.TEST_ASSIGNEE?.trim() || ""

const projectOwner = "KTAIorg"
const projectNumber = 5
const projectFields = {
  Status: "Todo",
  类别: "功能",
  优先级: "P1",
  所属模块: "KT测试组",
  需人工对接: "待确认",
}

export function buildIssueTitle(tag) {
  return `KTAI OpenCode 测试需求（${tag}）`
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
    `- KTAI 版本：\`${version}\``,
    `- OpenCode 上游版本：\`${openCodeVersion}\``,
    `- Release：[${release.name || release.tag_name}](${release.html_url})`,
    `- 发布 Commit：\`${sha}\``,
    `- 关联 PR：[${pullRequest.title}](${pullRequest.url})`,
    "",
    "### 关联 Issue",
    ...issueLines,
    "",
    "## 测试需求",
    "",
    "### A. 安装与基础能力",
    "1. Windows x64：验证 EXE 可安装、启动、卸载，版本号与 Release 一致",
    "2. macOS Intel：验证未签名 PKG 可安装并启动，同时抽测 DMG、ZIP",
    "3. macOS Apple Silicon：验证未签名 PKG 可安装并启动，同时抽测 DMG、ZIP",
    "4. 验证 KTAI 品牌名称、应用图标、协议唤起和安装包文件名正确",
    "5. 验证仓库与安装包不包含明文运营密钥 / 共享 NewAPI Secret",
    ...linkedIssueTests,
    "",
    "### B. 客户路径连贯验收（必测，勿拆开只测一端）",
    "",
    "参考：[客户路径 Wiki](../blob/main/docs/wiki/customer-journey.md)",
    "",
    "必须在**同一台干净环境 / 新 profile**上按顺序串测「免费额度 → 引导充值 → ktapi 配 key → 付费模型」，重点验收两段之间的过渡是否流畅、文案是否合理。",
    "",
    "#### B1. 免费额度场景（新客户刚安装）",
    "- [ ] 新安装后**无需** KT 账号、**无需** NewAPI / KTAI API key，即可看到并选用 OpenCode Zen 免费模型",
    "- [ ] 使用 Zen 免费模型可正常完成至少一轮对话",
    "- [ ] 模型选择器中可见 Zen；此时不应强迫用户先登录 KT 或粘贴 key",
    "",
    "#### B2. 免费额度用尽 → ktapi 引导（过渡关键）",
    "- [ ] Zen 免费额度用尽后弹出 **KT 充值引导**（不是 OpenCode Go 订阅）",
    "- [ ] CTA 打开 `https://www.ktapi.cc/wallet`（或等价钱包入口）",
    "- [ ] 引导文案说清下一步：去注册/登录 KT、充值；过渡态仍需在控制台自建/粘贴 API key（当前无自动发 sk-）",
    "- [ ] 关闭引导后，用户仍可理解「免费不可用 / 需走 KT」而不是卡死无提示",
    "",
    "#### B3. ktapi 场景（开账号 → 充值 → 配 key → 付费模型）",
    "- [ ] 在 [ktapi.cc](https://ktapi.cc) / NewAPI 使用 **KT Identity**（密码或 Telegram）登录成功",
    "- [ ] 登录后本地业务用户可用（Ensure）；在控制台创建个人 API key",
    "- [ ] 回到 OpenCode，配置/粘贴 **KTAI API key**（或环境变量仅限开发机验证）",
    "- [ ] 模型选择器出现 KTAI 付费模型；默认可见精选编程模型，其余可在 Manage models 打开",
    "- [ ] 使用 KTAI 模型完成至少一轮对话，确认请求走 ktapi 且用量归属该账号",
    "",
    "#### B4. 两段交互过渡（串测检查）",
    "- [ ] 从「只用 Zen」到「配好 KTAI key」全程可走通，无需清数据重装（除非用例要求干净环境）",
    "- [ ] 过渡过程中无误导：登录 KT Identity ≠ 自动获得模型调用能力（在自动换票上线前）",
    "- [ ] 不出现要求用户填写「未知的 NewAPI 本地旧密码」才能继续的主路径阻塞",
    "- [ ] 安装包未内置共享运营 key；付费路径使用的是用户个人 key",
    "",
    "## 对应的安装包",
    `生产 Release：${release.html_url}`,
    ...assetLines,
    "",
    "## 测试结果",
    "- [ ] Windows x64 通过",
    "- [ ] macOS Intel 通过",
    "- [ ] macOS Apple Silicon 通过",
    "- [ ] 安装与品牌基础能力通过",
    "- [ ] **B1 免费额度场景通过**",
    "- [ ] **B2 免费→ktapi 引导过渡通过**",
    "- [ ] **B3 ktapi 开账号/充值/配 key/付费模型通过**",
    "- [ ] **B4 两段连贯串测通过**",
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
  await ensureProjectPlacement(issue.id, issue.number)
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

async function ensureProjectPlacement(issueId, issueNumber) {
  const data = await githubGraphql(
    projectToken,
    `query($owner:String!, $repo:String!, $number:Int!, $projectOwner:String!, $projectNumber:Int!) {
      organization(login:$projectOwner) {
        projectV2(number:$projectNumber) {
          id
          fields(first:100) {
            nodes {
              ... on ProjectV2FieldCommon { id name }
              ... on ProjectV2SingleSelectField { options { id name } }
            }
          }
        }
      }
      repository(owner:$owner, name:$repo) {
        issue(number:$number) {
          projectItems(first:20) {
            nodes { id project { ... on ProjectV2 { id } } }
          }
        }
      }
    }`,
    { owner, repo, number: issueNumber, projectOwner, projectNumber },
  )
  const project = data.organization.projectV2
  if (!project) throw new Error(`Project ${projectOwner}#${projectNumber} not found`)
  const existing = data.repository.issue.projectItems.nodes.find((item) => item.project?.id === project.id)
  const itemId = existing?.id || (await addProjectItem(project.id, issueId))

  for (const [fieldName, optionName] of Object.entries(projectFields)) {
    const field = project.fields.nodes.find((candidate) => candidate.name === fieldName)
    const option = field?.options?.find((candidate) => candidate.name === optionName)
    if (!field || !option) throw new Error(`Project field option not found: ${fieldName}=${optionName}`)
    await setProjectField(project.id, itemId, field.id, option.id)
  }
}

async function addProjectItem(projectId, issueId) {
  const data = await githubGraphql(
    projectToken,
    `mutation($project:ID!, $content:ID!) {
      addProjectV2ItemById(input:{projectId:$project, contentId:$content}) { item { id } }
    }`,
    { project: projectId, content: issueId },
  )
  return data.addProjectV2ItemById.item.id
}

async function setProjectField(projectId, itemId, fieldId, optionId) {
  await githubGraphql(
    projectToken,
    `mutation($project:ID!, $item:ID!, $field:ID!, $option:String!) {
      updateProjectV2ItemFieldValue(input:{
        projectId:$project,
        itemId:$item,
        fieldId:$field,
        value:{singleSelectOptionId:$option}
      }) { projectV2Item { id } }
    }`,
    { project: projectId, item: itemId, field: fieldId, option: optionId },
  )
}

if (import.meta.main) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.stack || error.message : String(error))
    process.exit(1)
  })
}
