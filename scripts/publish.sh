#!/usr/bin/env bash
# Publish this site to GitHub. Usage:
#   ./scripts/publish.sh                                   # default org site
#   ./scripts/publish.sh https://github.com/<owner>/<repo>.git
# The GitHub Actions workflow in .github/workflows/deploy.yml builds and deploys
# on every push to main (enable it once: repo Settings → Pages → Source: GitHub Actions).
set -euo pipefail
cd "$(dirname "$0")/.."

REMOTE="${1:-https://github.com/noor-al-hikma-ai/noor-al-hikma-ai.github.io.git}"

echo "→ Checking the build locally first"
npm test
npm run build

if [ ! -d .git ]; then
  git init -b main
fi
git add -A
if ! git diff --cached --quiet; then
  git commit -m "Publish Noor Al Hikma AI site"
fi
if git remote get-url origin >/dev/null 2>&1; then
  git remote set-url origin "$REMOTE"
else
  git remote add origin "$REMOTE"
fi
git branch -M main
echo "→ Pushing to $REMOTE"
git push -u origin main
echo "✓ Pushed. Watch the deploy under the repository's Actions tab."
