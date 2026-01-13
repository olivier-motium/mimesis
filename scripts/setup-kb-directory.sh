#!/bin/bash
#
# Setup script for Commander Knowledge Base directory.
# Creates the required directory structure with proper permissions.
#
# Usage: ./setup-kb-directory.sh
#

set -e

KB_DIR="$HOME/.claude/commander/knowledge"
BY_NAME_DIR="$KB_DIR/by-name"
ALIASES_FILE="$KB_DIR/aliases.json"

echo "Setting up Commander Knowledge Base..."

# Create main knowledge directory
if [ ! -d "$KB_DIR" ]; then
    mkdir -p "$KB_DIR"
    echo "Created: $KB_DIR"
else
    echo "Exists: $KB_DIR"
fi

# Create by-name symlinks directory
if [ ! -d "$BY_NAME_DIR" ]; then
    mkdir -p "$BY_NAME_DIR"
    echo "Created: $BY_NAME_DIR"
else
    echo "Exists: $BY_NAME_DIR"
fi

# Create aliases.json if missing
if [ ! -f "$ALIASES_FILE" ]; then
    echo '{"_manual_overrides": {}}' > "$ALIASES_FILE"
    chmod 600 "$ALIASES_FILE"
    echo "Created: $ALIASES_FILE"
else
    echo "Exists: $ALIASES_FILE"
fi

# Set directory permissions
chmod 700 "$KB_DIR"
echo "Set permissions: $KB_DIR (700)"

echo ""
echo "Knowledge Base directory structure ready:"
echo "  $KB_DIR"
echo "  ├── aliases.json"
echo "  └── by-name/"
echo ""
echo "Run /knowledge-sync to populate with project knowledge."
