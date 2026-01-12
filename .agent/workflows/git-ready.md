---
description: Initialize Git, configure .gitignore, and commit changes
---

1. Check repository status

   - Run `git status`
   - If the directory is not a git repository, initialize it with `git init`.


2. Verify and Update .gitignore

   - Ensure a `.gitignore` file exists in the root.
   - It should contain ignores for:
     - Python: `__pycache__`, `*.pyc`, `.venv`
     - IDEs: `.vscode`, `.idea`
     - Cache directories: `.mypy_cache`, `.ruff_cache`
   - // turbo
   - Append missing entries if necessary.


3. Stage all files

   - // turbo
   - Run `git add .`


4. Commit changes

   - Generate a short, descriptive commit message based on the changes.
   - The commit message should be structured as follows:

     <type>[optional scope]: <description>

     [optional body]

     [optional footer(s)]

   - Types of commits
     Conventional Commits defines several types of changes:

     - feat: Introduces a new feature.
     - fix: Patches a bug.
     - docs: Documentation-only changes.
     - style: Changes that do not affect the meaning of the code (white-space, formatting, etc).
     - refactor: A code change that neither fixes a bug nor adds a feature.
     - perf: Improves performance.
     - test: Adds missing tests or corrects existing tests.
     - chore: Changes to the build process or auxiliary tools and libraries such as documentation generation.

   - Run `git commit -m "<message>"`
