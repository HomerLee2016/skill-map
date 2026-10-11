# Response format

- Start every answer with a 1–2 sentence summary that directly answers the question.
- Put details, steps, and explanations after it.

# Unit tests

After any change under run the tests before reporting done

# Working on a big story or epic

When a story/epic has several sub-issues:

1. Create a feature branch for the epic (see "Branch naming").
2. Make at least one commit per sub-issue.
3. Test the work and check the code.
4. QA carefully and fix the bugs found.
5. Create a PR for the user to review.

# Merge conflicts

- Before pushing or QA-ing a PR, check it against the latest main: `git fetch origin main`, then `git merge-tree --write-tree origin/main HEAD`.
- If it conflicts (or is behind main), rebase onto main: `git rebase origin/main`, resolve, then `git push --force-with-lease`.
- Re-run the tests after the rebase.

# Branch naming

- Use a type prefix: `feature/`, `bug/`, `refactor/`.
- Then the issue number (if any) and a short kebab-case description, e.g. `feature/65-account-level-exp-curve`.
- Never use auto-generated names like `claude/modest-fayman-ahuz4`.

# Code structure

- If understanding or changing something means digging through many layers of files, treat it as a sign the code needs refactoring.
- Point it out and suggest a refactor (e.g. a `refactor/` branch) rather than adding another layer on top.

# Writing this file

- Keep CLAUDE.md short, simple, and concise.
- Use point form; no long paragraphs.
