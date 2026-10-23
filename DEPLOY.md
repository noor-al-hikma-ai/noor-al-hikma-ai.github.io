# Publishing to GitHub Pages

The site deploys automatically with GitHub Actions: every push to `main` runs the compiler tests, builds
`dist/` and publishes it. You never upload files by hand.

## Which address?

A GitHub Pages address is `https://<owner>.github.io/`, where `<owner>` is a GitHub user or organization,
and the repository must be named `<owner>.github.io`.

* `hikma-ai` is already taken on GitHub by another account, so `hikma-ai.github.io` is not available.
* An organization called **`noor-al-hikma-ai`** was created on 23 Oct 2026. If that is yours, the site will be
  **https://noor-al-hikma-ai.github.io/** and the steps below work as written.
* If it is not yours, pick a free name (for example `noor-hikma-ai`) and replace `noor-al-hikma-ai` everywhere below.

## One-time setup (≈5 minutes, in the browser)

1. Sign in at https://github.com.
2. If you don't own the organization yet: **+ → New organization → Free**, name it `noor-al-hikma-ai`.
3. In the organization: **Repositories → New repository**
   * Name: `noor-al-hikma-ai.github.io` (exactly `<org>.github.io`)
   * Visibility: **Public** (Pages on the free plan requires a public repository)
   * Do **not** add a README, .gitignore or licence (the repository must start empty).
4. Open the new repository → **Settings → Pages → Build and deployment → Source: GitHub Actions**.

## Push the site from your Mac

In Terminal:

```bash
cd "/Users/amiasnikov/Noor Al Hikma Site"
./scripts/publish.sh
```

The script runs the tests and a production build, creates the git repository, commits and pushes to
`https://github.com/noor-al-hikma-ai/noor-al-hikma-ai.github.io.git`. For a different repository, pass its URL:

```bash
./scripts/publish.sh https://github.com/<owner>/<owner>.github.io.git
```

When git asks for credentials, use your GitHub username and a **personal access token** (GitHub →
Settings → Developer settings → Personal access tokens → Fine-grained, with *Contents: read and write*
on this repository), not your password. Installing the GitHub CLI (`brew install gh`, then `gh auth login`)
avoids the token prompt entirely.

Then open the repository's **Actions** tab: the "Deploy site to GitHub Pages" run takes about a minute.
The site is live at https://noor-al-hikma-ai.github.io/.

## Updating the site later

Edit files, then:

```bash
cd "/Users/amiasnikov/Noor Al Hikma Site"
git add -A
git commit -m "Update site"
git push
```

## Project site instead of an organization site

The build uses relative paths and hash routing, so it also works from any repository, e.g.
`https://<user>.github.io/casespine/`: create the repository, enable *Settings → Pages → Source: GitHub
Actions*, and run `./scripts/publish.sh https://github.com/<user>/casespine.git`.

## Custom domain (optional)

To serve from e.g. `www.noor-al-hikma.ai`: add a file `public/CNAME` containing just the domain, push,
set the domain in **Settings → Pages → Custom domain**, create a `CNAME` DNS record pointing
`www` to `noor-al-hikma-ai.github.io`, and tick **Enforce HTTPS** once the certificate is issued.

## Troubleshooting

* **404 after deploy** — check Settings → Pages shows *Source: GitHub Actions*, and that the repository name is exactly `<owner>.github.io`.
* **Workflow failed** — open the failed run in the Actions tab; `npm test` or `npm run build` output shows the cause. Run the same commands locally.
* **Old version showing** — hard-refresh (⌘⇧R); GitHub Pages caches for up to 10 minutes.
