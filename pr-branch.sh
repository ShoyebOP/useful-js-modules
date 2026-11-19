#!/usr/bin/env bash

set -e # Exit immediately if a command fails

# 1. Configuration: Files or folders you want removed in the new branch
FILES_TO_REMOVE=(
    "conductor/"
    ".planning/"
    "pr-branch.sh"
)

# 2. Get the current branch name
CURRENT_BRANCH=$(git rev-parse --abbrev-ref HEAD)

if [ "$CURRENT_BRANCH" = "HEAD" ]; then
    echo "Error: You are in a detached HEAD state."
    exit 1
fi

# 3. Find the highest existing number prefix across local & remote branches
# Matches branches starting with digits followed by a hyphen (e.g., 1-, 02-, 105-)
HIGHEST_NUM=$(git branch -a | grep -oE '[0-9]+-' | tr -d '-' | sort -n | tail -1)

# Default to 0 if no numbered branches exist
if [ -z "$HIGHEST_NUM" ]; then
    NEXT_NUM=1
else
    NEXT_NUM=$((HIGHEST_NUM + 1))
fi

# 4. Construct new branch name
NEW_BRANCH="${NEXT_NUM}-${CURRENT_BRANCH}"

echo "Creating new branch '$NEW_BRANCH' from '$CURRENT_BRANCH'..."
git checkout -b "$NEW_BRANCH"

# 5. Remove specified files if they exist in the repository
REMOVED_ANY=false
for FILE in "${FILES_TO_REMOVE[@]}"; do
    if [ -e "$FILE" ] || git ls-files --error-unmatch "$FILE" >/dev/null 2>&1; then
        echo "Removing $FILE..."
        git rm -rf --ignore-unmatch "$FILE"
        REMOVED_ANY=true
    fi
done

# 6. Commit the removal if files were deleted
if [ "$REMOVED_ANY" = true ]; then
    git commit -m "chore: remove unwanted files for PR branch"
    echo "Cleaned files and committed changes."
else
    echo "No specified files were found to remove."
fi

echo "Successfully created and switched to '$NEW_BRANCH'."
