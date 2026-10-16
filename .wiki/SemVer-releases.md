# SemVer releases (learn by shipping)

How **this** repo publishes [`harianto/dns01-proxy`](https://hub.docker.com/r/harianto/dns01-proxy) to Docker Hub.

## Why SemVer exists

```text
MAJOR.MINOR.PATCH   →   e.g. 1.0.0
```

| Part | Bump when | Example |
| --- | --- | --- |
| **MAJOR** | Breaking for anyone already running the image | Rename required env, drop a public API route, change default data layout incompatibly |
| **MINOR** | New capability, old usage still works | New UI/plugin behaviour that does not break existing mounts/env |
| **PATCH** | Fix or image-only tweak, same contract | Bug fix, Bun/base bump, Dockerfile tweak |

Think from the puller’s point of view (`docker pull …:1.0.0` and their compose). Spec: [semver.org](https://semver.org/).

## How *our* pipeline uses SemVer

You choose the version. GitHub Actions does **not**.

```text
git tag v1.0.1  ──push──►  Actions build  ──►  Docker Hub
                                              1.0.1
                                              1.0
                                              latest
```

| You create (git) | Hub gets |
| --- | --- |
| `v1.0.0` | `harianto/dns01-proxy:1.0.0`, `:1.0`, `:latest` |

- Git tag has a leading **`v`**; Hub tags do **not**.
- Pushing `main` alone publishes **nothing**.
- Prefer a new patch tag over rewriting an old one.
- Pin compose to `1.0.0` (or `1.0`) on machines you care about; treat `latest` as lab-friendly.

Workflow: [`.github/workflows/docker-publish.yml`](../.github/workflows/docker-publish.yml).

Build context: `src/dns01-proxy` + `Dockerfile.platform` (**amd64 + arm64**). Local multi-arch push remains `./dc.sh push` (`_push.yml`).

## Decide the next version

```bash
git fetch --tags
git tag -l 'v*' | sort -V | tail -5
git log v1.0.0..HEAD --oneline   # replace with your latest tag
```

| Since last tag you… | Next tag |
| --- | --- |
| Only fixed bugs / image internals | `v1.0.1` |
| Added compatible features | `v1.1.0` |
| Broke the contract | `v2.0.0` |
| Docs / wiki only | **no tag** |

## Release checklist

```bash
git status
git fetch origin && git pull --ff-only origin main
NEXT=v1.0.1
git tag -a "$NEXT" -m "$NEXT"
git push origin "$NEXT"
# Actions → Publish Docker image → green
docker pull harianto/dns01-proxy:1.0.1
```

## Secrets

Repository secrets (Settings → Secrets and variables → Actions):

| Secret | Purpose |
| --- | --- |
| `DOCKERHUB_USERNAME` | Hub namespace (image path) |
| `DOCKERHUB_TOKEN` | Hub access token (not your password) |

## Habits

- Tag a clean `main` commit; prefer annotated tags (`git tag -a`).
- Never force-move a published tag people already pulled.
- Seed / data layout changes that break existing volumes without migration → at least MINOR, often MAJOR.
