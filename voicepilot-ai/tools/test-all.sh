#!/usr/bin/env bash
#
# Every test in the repository, in one command.
#
# It exists because the invocations are not guessable and each one was
# rediscovered at least once. The Python suite must be discovered from the
# package root — `discover -s tests` breaks a relative import inside
# test_pipeline and silently runs 26 fewer tests than it should, reporting
# OK. The TypeScript packages need `--experimental-strip-types`. The browser
# tests need a Playwright that is not in this repo.
#
# Exits non-zero if anything fails. No dependencies beyond what the tests
# themselves need.

set -uo pipefail
cd "$(dirname "$0")/.."

fail=0
run() {
  local name="$1"; shift
  printf '\n\033[1m── %s\033[0m\n' "$name"
  if "$@"; then
    return 0
  fi
  printf '\033[31mFAILED: %s\033[0m\n' "$name"
  fail=1
}

py() (cd ai-services/copilot-core && python3 -m unittest discover -s . -q)
crm() (cd shared/crm && node --experimental-strip-types --test test/*.test.ts)
crm_types() (cd shared/crm && npx --no-install tsc --noEmit -p tsconfig.json)
authz() (cd backend/authz && node --experimental-strip-types --test test/*.test.ts)
ext() (cd browser-extension && node build.mjs >/dev/null && node test/extension.test.mjs)

# The fixtures are generated from the engines, so a change to an engine that
# alters what a screen renders shows up here rather than in a demo. Both are
# regenerated before the browser tests run; if a fixture is stale in git, the
# diff is the finding.
fixtures() {
  (cd frontend/console && python3 generate_fixture.py > call-events.json) &&
  (cd frontend/dashboard && python3 generate_fixture.py > floor.json) &&
  (cd frontend/import && node --experimental-strip-types generate_fixture.mjs > plan.json) &&
  (cd frontend/pipeline && node --experimental-strip-types generate_fixture.mjs > board.json)
}

run "copilot-core (python)"      py
run "shared/crm (tests)"         crm
run "shared/crm (typecheck)"     crm_types
run "backend/authz"              authz
run "fixtures (regenerate)"      fixtures
run "console (browser)"          node frontend/console/test/console.test.mjs
run "dashboard (browser)"        node frontend/dashboard/test/dashboard.test.mjs
run "player (browser)"           node frontend/player/test/player.test.mjs
run "report (browser)"           node frontend/report/test/report.test.mjs
run "import (browser)"           node frontend/import/test/import.test.mjs
run "pipeline (browser)"         node frontend/pipeline/test/pipeline.test.mjs
run "extension (browser)"        ext

FIXTURES='frontend/console/call-events.json frontend/dashboard/floor.json
          frontend/import/plan.json frontend/pipeline/board.json'
if git diff --quiet -- $FIXTURES; then
  printf '\n\033[1m── fixtures match the engines\033[0m\n'
else
  printf '\n\033[33mFixtures changed when regenerated — an engine now produces\n'
  printf 'different output than the committed fixture. Review the diff and\n'
  printf 'commit it if the new behaviour is intended.\033[0m\n'
  git diff --stat -- $FIXTURES
  fail=1
fi

printf '\n'
if [ "$fail" -eq 0 ]; then
  printf '\033[32mAll suites passed.\033[0m\n'
else
  printf '\033[31mSomething failed. See above.\033[0m\n'
fi
exit "$fail"
