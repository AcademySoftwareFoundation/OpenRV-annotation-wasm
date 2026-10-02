# Contributing to OpenRV-annotation-wasm

Thank you for your interest in contributing! This project follows the same
contribution model as OpenRV and other ASWF projects.

## Developer Certificate of Origin (DCO)

All contributions require a `Signed-off-by:` line in the commit message.
By adding this line you certify that you have the right to submit the
contribution under the project's Apache-2.0 license.

Sign-off is automatic when you use `git commit -s`:

```bash
git commit -s -m "Your commit message"
```

This adds a line like:

```
Signed-off-by: Your Name <your.email@example.com>
```

### Developer Certificate of Origin 1.1

```
Developer Certificate of Origin
Version 1.1

Copyright (C) 2004, 2006 The Linux Foundation and its contributors.
1 Letterman Drive
Suite D4700
San Francisco, CA, 94129

Everyone is permitted to copy and distribute verbatim copies of this
license document, but changing it is not allowed.


Developer's Certificate of Origin 1.1

By making a contribution to this project, I certify that:

(a) The contribution was created in whole or in part by me and I
    have the right to submit it under the open source license
    indicated in the file; or

(b) The contribution is based upon previous work that, to the best
    of my knowledge, is covered under an appropriate open source
    license and I have the right under that license to submit that
    work with modifications, whether created in whole or in part
    by me, under the same open source license (unless I am
    permitted to submit under a different license), as indicated
    in the file; or

(c) The contribution was provided directly to me by some other
    person who certified (a), (b) or (c) and I have not modified
    it.

(d) I understand and agree that this project and the contribution
    are public and that a record of the contribution (including all
    personal information I submit with it, including my sign-off) is
    maintained indefinitely and may be redistributed consistent with
    this project or the open source license(s) involved.
```

Full text also at: https://developercertificate.org

## Pull request process

1. **Fork** the repository on GitHub.
2. **Create a branch** from `main` with a descriptive name
   (e.g. `fix/stroke-memory-leak`, `feat/new-cap-style`).
3. **Make your changes.** Keep commits focused; one logical change per commit.
4. **Sign off** every commit with `git commit -s`.
5. **Format** your code before pushing:
   ```bash
   make format
   ```
6. **Open a pull request** targeting `main`. Fill in the PR template.
7. A maintainer will review and may request changes.
8. Once approved the PR will be merged by a maintainer.

## Code style

The repo ships formatters for all languages — run them before committing:

```bash
make format          # fix C++ and JS in-place
make format-check    # dry-run check (also run by the pre-commit hook)
```

The pre-commit hook enforces formatting automatically. Install it once after
cloning:

```bash
make install-hooks
```

Formatter configs:
- **C++**: `.clang-format` (LLVM style, column limit 100)
- **JS/TS/MJS**: `.prettierrc`

## Contributing to the C++ core

`deps/OpenRV-annotation` is a git submodule pointing at
[OpenRV-annotation](https://github.com/AcademySoftwareFoundation/OpenRV-annotation).
For changes to the core geometry library (TwkPaint, TwkMath), please open a
pull request in that repository instead.

## Releasing

The package is published publicly as
[`@aswf/annotation-platform`](https://www.npmjs.com/package/@aswf/annotation-platform)
under the [`aswf` organization on npmjs.com](https://www.npmjs.com/org/aswf).

Publishing is automated via `.github/workflows/publish.yml`, which runs
`make publish` whenever a tag matching `vX.Y.Z` is pushed. The workflow
authenticates with npm
[trusted publishing](https://docs.npmjs.com/trusted-publishers) (OIDC), so no
npm token is stored in the repository, and every release gets a
[provenance attestation](https://docs.npmjs.com/generating-provenance-statements)
linking it to the commit and workflow run that built it. To cut a release:

1. Bump the `version` field in `package.json` to `X.Y.Z`.
2. Commit and merge that change to `main`.
3. Tag the merge commit and push the tag:
   ```bash
   git tag vX.Y.Z
   git push origin vX.Y.Z
   ```

The workflow verifies the tag matches `package.json`'s version before
publishing, so a mismatched tag fails the run instead of publishing the
wrong version.

### Trusted publisher configuration

Trusted publishing is configured on npmjs.com under the package's
**Settings → Trusted Publisher** (GitHub Actions):

| Field             | Value                       |
| ----------------- | --------------------------- |
| Organization      | `AcademySoftwareFoundation` |
| Repository        | `OpenRV-annotation-wasm`    |
| Workflow filename | `publish.yml`               |

If the workflow file is renamed, this setting must be updated to match or
publishing will fail with an authentication error.

### Publishing manually

Manual publishing should only be needed in exceptional cases (e.g. the very
first release, before trusted publishing could be configured). Releases
published manually do not get a provenance attestation.

The registry and public access are pinned via `publishConfig` in
`package.json`. You need to be a member of the `aswf` org with publish
rights:

```bash
npm login
make wasm && npm run build
npm publish --dry-run   # review the package contents
make publish            # prompts for your 2FA code
```

Don't push a `vX.Y.Z` tag for a version you published manually: the workflow
would try to publish it again and fail.

### Publishing to a different registry

To target a different registry (e.g. a local test registry), pass
`REGISTRY`:

```bash
make publish REGISTRY=http://localhost:4873
```

### Recovering from a version mismatch

If the version-check step fails, the job stops before `make publish` runs, so
nothing is published to NPM. It's safe to fix and retry.

1. Figure out which one was wrong: the tag or `package.json`.
2. **If `package.json` was wrong** (you forgot to bump it): delete the bad
   tag, fix the version, commit, then re-tag.
   ```bash
   git tag -d vX.Y.Z
   git push origin :refs/tags/vX.Y.Z   # delete remote tag
   # bump package.json version to X.Y.Z, commit, push to main
   git tag vX.Y.Z
   git push origin vX.Y.Z
   ```
3. **If the tag was wrong** (e.g. you tagged the wrong version number): just
   delete it and re-tag with the correct one — no code change needed.
   ```bash
   git tag -d vBadTag
   git push origin :refs/tags/vBadTag
   git tag vCorrectTag
   git push origin vCorrectTag
   ```

Pushing the tag again re-triggers the workflow, which re-runs the version
check and, if it now matches, proceeds to build and publish.

Note: if a version was already successfully published to NPM before you
noticed a mismatch on a different tag, that version can't be republished —
NPM rejects republishing an identical version. Since the version check runs
before publish, a rejected run never reaches NPM, so this shouldn't arise
from this workflow alone.

## Bug reports and feature requests

Please open a [GitHub Issue](https://github.com/AcademySoftwareFoundation/OpenRV-annotation-wasm/issues).
Include a minimal reproduction case for bugs.
