import { execSync } from "node:child_process"
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs"
import { homedir } from "node:os"
import { basename, join, relative, resolve, sep } from "node:path"

const HOST = process.env["DOSSIER_HOST"] ?? "teambrilliant.dev"
const TOKEN = process.env["DOSSIER_TOKEN"]
const API = process.env["DOSSIER_API"] ?? `https://${HOST}/v1`
const KEYS_DIR = join(homedir(), ".config", "dossier")
const KEYS_PATH = join(KEYS_DIR, "keys.json")
const VERSIONS_PATH = join(KEYS_DIR, "versions.json")

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function str(value: Record<string, unknown>, key: string): string | null {
  const v = value[key]
  return typeof v === "string" ? v : null
}

function loadKeys(): Record<string, string> {
  if (!existsSync(KEYS_PATH)) return {}
  const parsed: unknown = JSON.parse(readFileSync(KEYS_PATH, "utf8"))
  if (!isRecord(parsed)) return {}
  const out: Record<string, string> = {}
  for (const [k, v] of Object.entries(parsed)) if (typeof v === "string") out[k] = v
  return out
}

function saveKey(siteId: string, key: string): void {
  const keys = loadKeys()
  keys[siteId] = key
  mkdirSync(KEYS_DIR, { recursive: true })
  writeFileSync(KEYS_PATH, JSON.stringify(keys, null, 2))
}

function loadVersions(): Record<string, number> {
  if (!existsSync(VERSIONS_PATH)) return {}
  const parsed: unknown = JSON.parse(readFileSync(VERSIONS_PATH, "utf8"))
  if (!isRecord(parsed)) return {}
  const out: Record<string, number> = {}
  for (const [k, v] of Object.entries(parsed)) if (typeof v === "number") out[k] = v
  return out
}

function saveVersion(siteId: string, version: unknown): void {
  if (typeof version !== "number") return
  const versions = loadVersions()
  versions[siteId] = version
  mkdirSync(KEYS_DIR, { recursive: true })
  writeFileSync(VERSIONS_PATH, JSON.stringify(versions, null, 2))
}

function contentAuth(siteId: string): string {
  return loadKeys()[siteId] ?? requireToken()
}

function detectNamespace(): string {
  try {
    const url = execSync("git remote get-url origin", { stdio: ["ignore", "pipe", "ignore"] })
      .toString()
      .trim()
    const name = basename(url).replace(/\.git$/, "").toLowerCase()
    return name.length > 0 ? name : "scratch"
  } catch {
    return "scratch"
  }
}

function detectGithubOrigin(): { repo: string; branch: string } | null {
  let url: string
  try {
    url = execSync("git remote get-url origin", { stdio: ["ignore", "pipe", "ignore"] })
      .toString()
      .trim()
  } catch {
    return null
  }
  const m = url.match(/github\.com[:/]+([^/]+)\/([^/]+?)(\.git)?\/?$/)
  if (m === null || m[1] === undefined || m[2] === undefined) return null
  let branch: string
  try {
    branch = execSync("git rev-parse --abbrev-ref HEAD", { stdio: ["ignore", "pipe", "ignore"] })
      .toString()
      .trim()
  } catch {
    return null
  }
  if (branch.length === 0 || branch === "HEAD") return null // detached HEAD: no stable branch to link
  return { repo: `${m[1]}/${m[2]}`, branch }
}

// Links the sibling markdown for a single-file doc (the true source; the .html is a
// build artifact) or the directory itself for a bundle, since a bundle has no one
// canonical file. Returns undefined for anything that isn't cleanly linkable —
// non-GitHub remote, detached HEAD, or the published path living outside the repo.
function githubSource(
  inputPath: string,
  doc: { sourceMd: string | undefined; isDir: boolean },
): { source_url: string; source_path: string } | undefined {
  const origin = detectGithubOrigin()
  if (origin === null) return undefined
  let repoRoot: string
  try {
    repoRoot = execSync("git rev-parse --show-toplevel", { stdio: ["ignore", "pipe", "ignore"] })
      .toString()
      .trim()
  } catch {
    return undefined
  }
  const target = doc.isDir
    ? inputPath
    : doc.sourceMd !== undefined
      ? inputPath.replace(/\.html$/, ".md")
      : inputPath
  const rel = relative(repoRoot, target).split(sep).join("/")
  if (rel.length === 0 || rel.startsWith("..")) return undefined
  const kind = doc.isDir ? "tree" : "blob"
  return { source_url: `https://github.com/${origin.repo}/${kind}/${origin.branch}/${rel}`, source_path: rel }
}

function requireToken(): string {
  if (TOKEN === undefined || TOKEN.length === 0) {
    console.error("DOSSIER_TOKEN is not set")
    process.exit(1)
  }
  return TOKEN
}

async function req(method: string, path: string, bearer: string, body?: unknown): Promise<Response> {
  const headers: Record<string, string> = { Authorization: `Bearer ${bearer}` }
  if (body !== undefined) headers["Content-Type"] = "application/json"
  return fetch(`${API}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  })
}

async function fail(context: string, res: Response): Promise<never> {
  console.error(`${context}: ${res.status} ${await res.text()}`)
  process.exit(1)
}

async function jsonOf(res: Response): Promise<Record<string, unknown>> {
  const parsed: unknown = await res.json()
  return isRecord(parsed) ? parsed : {}
}

function splitSiteId(value: string): [string, string] {
  const [ns, slug] = value.split("/")
  if (ns === undefined || slug === undefined || ns.length === 0 || slug.length === 0) {
    console.error(`expected <namespace>/<slug>, got: ${value}`)
    process.exit(1)
  }
  return [ns, slug]
}

async function keyFor(siteId: string): Promise<string> {
  const cached = loadKeys()[siteId]
  if (cached !== undefined) return cached
  const [ns, slug] = splitSiteId(siteId)
  const res = await req("POST", `/sites/${ns}/${slug}/rotate-key`, requireToken())
  if (res.status === 404) {
    console.error(
      `${siteId} does not exist — create it first: bun dossier.ts publish <file.html|dir> --slug=${slug} --namespace=${ns}`,
    )
    process.exit(1)
  }
  if (!res.ok) await fail(`cannot recover update_key for ${siteId}`, res)
  const data = await jsonOf(res)
  const key = str(data, "update_key")
  if (key === null) await fail(`rotate-key returned no key for ${siteId}`, res)
  saveKey(siteId, key)
  return key
}

function flagValue(args: string[], name: string): string | undefined {
  const found = args.find((a) => a.startsWith(`--${name}=`))
  return found?.slice(name.length + 3)
}

function readDoc(inputPath: string): { html: string; sourceMd: string | undefined; isDir: boolean } {
  const isDir = statSync(inputPath).isDirectory()
  const htmlPath = isDir ? join(inputPath, "index.html") : inputPath
  const html = readFileSync(htmlPath, "utf8")
  const sourceCandidate = isDir ? null : inputPath.replace(/\.html$/, ".md")
  const sourceMd =
    sourceCandidate !== null && sourceCandidate !== inputPath && existsSync(sourceCandidate)
      ? readFileSync(sourceCandidate, "utf8")
      : undefined
  return { html, sourceMd, isDir }
}

async function uploadAssets(namespace: string, slug: string, inputPath: string): Promise<void> {
  const key = contentAuth(`${namespace}/${slug}`)
  const walk = (dir: string): string[] =>
    readdirSync(dir).flatMap((f) => {
      if (f.startsWith(".") || f === "CLAUDE.md") return []
      const p = join(dir, f)
      return statSync(p).isDirectory() ? walk(p) : [p]
    })
  for (const file of walk(inputPath)) {
    const rel = relative(inputPath, file)
    if (rel === "index.html") continue
    const res = await fetch(
      `${API}/sites/${namespace}/${slug}/assets?relative_path=${encodeURIComponent(rel)}`,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${key}` },
        body: new Uint8Array(readFileSync(file)),
      },
    )
    if (!res.ok) await fail(`asset ${rel} failed`, res)
    console.log(`  asset ${rel}`)
  }
}

const [command, target, ...rest] = process.argv.slice(2)

if (command === "publish" && target !== undefined) {
  const token = requireToken()
  const inputPath = resolve(target)
  const slug =
    flagValue(rest, "slug") ??
    basename(inputPath).replace(/\.(html|md)$/, "").toLowerCase().replace(/[^a-z0-9-]+/g, "-")
  const namespace = flagValue(rest, "namespace") ?? detectNamespace()
  const siteId = `${namespace}/${slug}`
  const doc = readDoc(inputPath)
  const source = githubSource(inputPath, doc)
  const only = flagValue(rest, "only")

  const createRes = await req("POST", "/sites", token, {
    namespace,
    slug,
    html: doc.html,
    source_md: doc.sourceMd,
    source_url: source?.source_url,
    source_path: source?.source_path,
    restricted_to:
      only === undefined
        ? undefined
        : only.split(",").map((s) => s.trim()).filter((s) => s.length > 0),
  })
  if (createRes.status === 409) {
    const data = await jsonOf(createRes)
    const title = str(data, "title")
    const updated = str(data, "updated_at")
    const version = data["version"]
    console.error(
      `${siteId} already exists` +
        (title !== null ? `: "${title}"` : "") +
        (typeof version === "number" ? ` (v${String(version)}` : " (") +
        (updated !== null ? `, updated ${updated})` : ")"),
    )
    console.error(`  update that doc:   bun dossier.ts republish ${siteId} ${target}`)
    console.error(`  or distinct slug:  bun dossier.ts publish ${target} --slug=<project>-${slug}`)
    process.exit(1)
  }
  if (createRes.status !== 201) await fail("publish failed", createRes)
  const data = await jsonOf(createRes)
  const url = str(data, "url")
  const updateKey = str(data, "update_key")
  if (updateKey !== null) saveKey(siteId, updateKey)
  saveVersion(siteId, data["version"])
  console.log(`published ${url ?? siteId}`)
  if (source) console.log(`  source: ${source.source_url}`)
  const restrictedTo = data["restricted_to"]
  if (Array.isArray(restrictedTo) && restrictedTo.length > 0)
    console.log(`  restricted to: ${restrictedTo.join(", ")}`)
  if (doc.isDir) await uploadAssets(namespace, slug, inputPath)
} else if (command === "republish" && target !== undefined && rest[0] !== undefined) {
  const [ns, slug] = splitSiteId(target)
  const inputPath = resolve(rest[0])
  const doc = readDoc(inputPath)
  const source = githubSource(inputPath, doc)
  const force = rest.includes("--force")
  const baseVersion = force ? undefined : loadVersions()[target]
  if (!force && baseVersion === undefined)
    console.error(
      `no pulled version of ${target} on this machine — pushing without a conflict check (pull first to enable it)`,
    )
  const putRes = await req("PUT", `/sites/${ns}/${slug}`, contentAuth(target), {
    html: doc.html,
    source_md: doc.sourceMd,
    source_url: source?.source_url,
    source_path: source?.source_path,
    base_version: baseVersion,
  })
  if (putRes.status === 409) {
    const conflict = await jsonOf(putRes)
    const updated = str(conflict, "updated_at")
    console.error(
      `${target} changed since you pulled it: you have v${String(baseVersion)}, server has v${String(conflict["current_version"])}` +
        (updated !== null ? ` (updated ${updated})` : ""),
    )
    console.error(`  get theirs:   bun dossier.ts pull ${target} <outdir>   (merge into your copy, then republish)`)
    console.error(`  overwrite:    bun dossier.ts republish ${target} ${rest[0]} --force`)
    process.exit(1)
  }
  if (!putRes.ok) await fail("republish failed", putRes)
  const data = await jsonOf(putRes)
  saveVersion(target, data["version"])
  console.log(`republished https://${HOST}/${target}/ (v${String(data["version"])})`)
  if (source) console.log(`  source: ${source.source_url}`)
  if (doc.isDir) await uploadAssets(ns, slug, inputPath)
} else if (command === "pull" && target !== undefined) {
  const token = requireToken()
  const [ns, slug] = splitSiteId(target)
  const metaRes = await req("GET", `/sites/${ns}/${slug}`, token)
  if (!metaRes.ok) await fail("pull failed", metaRes)
  const version = (await jsonOf(metaRes))["version"]
  if (typeof version !== "number") await fail("pull failed: no version in metadata", metaRes)
  const htmlRes = await req("GET", `/sites/${ns}/${slug}/versions/${String(version)}/index.html`, token)
  if (!htmlRes.ok) await fail("pull failed", htmlRes)
  const sourceRes = await req("GET", `/sites/${ns}/${slug}/source?version=${String(version)}`, token)
  if (!sourceRes.ok && sourceRes.status !== 404) await fail("pull failed", sourceRes)
  const commentsRes = await req("GET", `/sites/${ns}/${slug}/comments`, token)
  const outDir = rest[0] !== undefined ? resolve(rest[0]) : process.cwd()
  mkdirSync(outDir, { recursive: true })
  const written = [`${slug}.html`]
  writeFileSync(join(outDir, `${slug}.html`), await htmlRes.text())
  if (sourceRes.ok) {
    writeFileSync(join(outDir, `${slug}.md`), await sourceRes.text())
    written.push(`${slug}.md`)
  }
  if (commentsRes.ok) {
    writeFileSync(
      join(outDir, `${slug}.comments.json`),
      JSON.stringify(await jsonOf(commentsRes), null, 2),
    )
    written.push(`${slug}.comments.json`)
  }
  saveVersion(target, version)
  console.log(`pulled ${target} v${String(version)} → ${outDir} (${written.join(", ")})`)
} else if (command === "list") {
  const res = await req("GET", target !== undefined ? `/sites?namespace=${target}` : "/sites", requireToken())
  if (!res.ok) await fail("list failed", res)
  console.log(JSON.stringify(await jsonOf(res), null, 2))
} else if (command === "comment" && target !== undefined) {
  const token = requireToken()
  const [ns, slug] = splitSiteId(target)
  const body = rest.join(" ")
  if (body.length === 0) {
    console.error("usage: comment <ns/slug> <text>")
    process.exit(1)
  }
  const res = await req("POST", `/sites/${ns}/${slug}/comments`, token, { body })
  if (!res.ok) await fail("comment failed", res)
  console.log("comment posted")
} else if (command === "share" && target !== undefined) {
  const [ns, slug] = splitSiteId(target)
  const password = flagValue(rest, "password")
  const key = await keyFor(target)
  const res = await req(
    "POST",
    `/sites/${ns}/${slug}/share`,
    key,
    password !== undefined ? { password } : {},
  )
  if (!res.ok) await fail("share failed", res)
  console.log(JSON.stringify(await jsonOf(res), null, 2))
} else if (command === "unshare" && target !== undefined) {
  const [ns, slug] = splitSiteId(target)
  const key = await keyFor(target)
  const res = await req("DELETE", `/sites/${ns}/${slug}/share`, key)
  if (!res.ok) await fail("unshare failed", res)
  console.log("share revoked")
} else if (command === "restrict" && target !== undefined) {
  const [ns, slug] = splitSiteId(target)
  const only = flagValue(rest, "only")
  if (only === undefined) {
    console.error("usage: restrict <ns/slug> --only=me | --only=a@x,b@y | --only=org")
    process.exit(1)
  }
  const payload = {
    restricted_to:
      only === "org" ? null : only.split(",").map((s) => s.trim()).filter((s) => s.length > 0),
  }
  let res = await req("POST", `/sites/${ns}/${slug}/restrict`, requireToken(), payload)
  if (res.status === 401)
    res = await req("POST", `/sites/${ns}/${slug}/restrict`, await keyFor(target), payload)
  if (!res.ok) await fail("restrict failed", res)
  const data = await jsonOf(res)
  const list = data["restricted_to"]
  console.log(Array.isArray(list) ? `restricted to: ${list.join(", ")}` : "org-visible")
} else if (command === "delete" && target !== undefined) {
  const [ns, slug] = splitSiteId(target)
  const key = await keyFor(target)
  const res = await req("DELETE", `/sites/${ns}/${slug}`, key)
  if (!res.ok) await fail("delete failed", res)
  console.log(`deleted ${target}`)
} else {
  console.error(`usage:
  bun dossier.ts publish <file.html|dir> --slug=x [--namespace=x] [--only=me|a@x,...]   # create; never overwrites
  bun dossier.ts republish <ns/slug> <file.html|dir> [--force]      # update; same URL, new version; 409 if changed since your pull
  bun dossier.ts pull <ns/slug> [outdir]                             # → <slug>.html + <slug>.md + <slug>.comments.json
  bun dossier.ts list [namespace]
  bun dossier.ts comment <ns/slug> <text>
  bun dossier.ts share <ns/slug> [--password=x]
  bun dossier.ts unshare <ns/slug>
  bun dossier.ts restrict <ns/slug> --only=me|a@x,b@y|org   # viewer allowlist (keyed)
  bun dossier.ts delete <ns/slug>

env: DOSSIER_TOKEN (required), DOSSIER_HOST (default teambrilliant.dev), DOSSIER_API (override for local dev)`)
  process.exit(1)
}
