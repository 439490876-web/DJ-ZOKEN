# DJ-ZOKEN Force Push Deployment Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan.

**Goal:** Overwrite the remote `main` branch on `https://github.com/439490876-web/DJ-ZOKEN.git` with the current full repository state in `/Users/apple/work/NEWSETki`.

**Architecture:** Use the existing git repo in `/Users/apple/work/NEWSETki`, confirm the correct remote, create a backup tag for the current remote state, commit local changes if any, and force-push local `main` to the remote `main`.

**Tech Stack:** Git (CLI), GitHub remote.

---

### Task 1: Verify repository state and remotes

**Files:**
- Modify: none
- Test: none

**Step 1: Inspect current git status**

Run: `git status --short`
Expected: Shows any modified/untracked files.

**Step 2: Check remotes**

Run: `git remote -v`
Expected: `origin` points to `https://github.com/439490876-web/DJ-ZOKEN.git`.

**Step 3: Confirm current branch is main**

Run: `git branch --show-current`
Expected: `main`.

---

### Task 2: Stage and commit local changes (if any)

**Files:**
- Modify: files currently changed
- Test: optional based on project needs

**Step 1: If there are changes, review**

Run: `git status --short`
Expected: list of changed files.

**Step 2: Stage all changes**

Run: `git add -A`
Expected: no output.

**Step 3: Commit changes**

Run: `git commit -m "chore: sync local state before force push"`
Expected: commit created (or skip if there are no changes).

---

### Task 3: Backup remote state before overwrite

**Files:**
- Modify: none
- Test: none

**Step 1: Fetch remote**

Run: `git fetch origin`
Expected: fetch completes.

**Step 2: Tag current remote main for safety**

Run: `git tag backup/pre-force-$(date +%Y%m%d) origin/main`
Expected: tag created locally.

**Step 3: Push backup tag**

Run: `git push origin backup/pre-force-$(date +%Y%m%d)`
Expected: tag pushed to remote.

---

### Task 4: Force push local main to remote main

**Files:**
- Modify: none
- Test: none

**Step 1: Force push**

Run: `git push --force origin main`
Expected: remote `main` updated.

**Step 2: Verify remote**

Run: `git ls-remote --heads origin main`
Expected: shows new hash matching local `main`.

---

### Task 5: Record deployment result

**Files:**
- Modify: `docs/plans/2026-01-29-dj-zoken-force-push-plan.md`
- Test: none

**Step 1: Append a short note with the pushed commit hash**

Append lines:
- `Result: pushed <hash> to origin/main at <timestamp>`

**Step 2: Commit the plan update**

Run: `git add docs/plans/2026-01-29-dj-zoken-force-push-plan.md`
Run: `git commit -m "docs: record force push result"`
Expected: commit created.


Result: pushed e8c1716 to origin/main at 2026-01-29 17:51:29 +0800
