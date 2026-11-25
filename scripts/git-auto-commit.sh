#!/usr/bin/env bash
set -euo pipefail

MSG="${1:-chore: auto-commit verified changes}"

echo "1. Running tests and TypeScript check..."
npm test
npm run lint

echo "2. Staging changes..."
git add -A

# Safety check: never allow real .env files (allow .env.example) or data/ to be committed
if git diff --cached --name-only | grep -vE '(^|/)\.env\.example$' | grep -qE '(^\.env|/\.env|^data/)'; then
  echo "ERROR: Refusing to commit .env or data/ files!"
  git reset
  exit 1
fi

if git diff --cached --quiet; then
  echo "No changes to commit."
  exit 0
fi

echo "3. Committing: $MSG"
git commit -m "$MSG"

if git remote get-url origin >/dev/null 2>&1; then
  echo "4. Pushing to origin main..."
  git push -u origin main
else
  echo "4. Committed locally (no 'origin' remote configured yet)."
fi
