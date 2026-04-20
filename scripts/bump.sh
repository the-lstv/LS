#!/usr/bin/env bash
set -euo pipefail

# Usage:
#   ./bump.sh patch|minor|major [by=1] [--docs]

usage() {
    echo "Usage: $0 patch|minor|major [by=1] [--docs]"
    exit 1
}

bump_type="${1:-}"
by="${2:-1}"
docs_flag="${3:-}"

[[ -n "$bump_type" ]] || usage
[[ "$bump_type" =~ ^(patch|minor|major)$ ]] || usage
[[ "$by" =~ ^[0-9]+$ ]] || { echo "Error: 'by' must be a non-negative integer."; exit 1; }

copy_docs=false
if [[ "${docs_flag:-}" == "--docs" ]]; then
    copy_docs=true
elif [[ -n "${docs_flag:-}" ]]; then
    usage
fi

# Base path is parent of this script directory
base_path="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

addon_path="$base_path/misc/backend/akeno-cdn-api-addon"
versions_path="$addon_path/versions"
version_file="${VERSION_FILE:-$base_path/version}"
dist_src="${DIST_SRC:-$base_path/dist}"
docs_src="${DOCS_SRC:-$base_path/docs}"

[[ -d "$dist_src" ]] || { echo "Error: dist folder not found: $dist_src"; exit 1; }
mkdir -p "$versions_path"

if [[ ! -f "$version_file" ]]; then
    echo "0.0.0" > "$version_file"
fi

current_version="$(tr -d '[:space:]' < "$version_file")"
if [[ ! "$current_version" =~ ^([0-9]+)\.([0-9]+)\.([0-9]+)$ ]]; then
    echo "Error: invalid version format in $version_file (expected x.y.z)."
    exit 1
fi

major="${BASH_REMATCH[1]}"
minor="${BASH_REMATCH[2]}"
patch="${BASH_REMATCH[3]}"

case "$bump_type" in
    patch)
        patch=$((patch + by))
        ;;
    minor)
        minor=$((minor + by))
        patch=0
        ;;
    major)
        major=$((major + by))
        minor=0
        patch=0
        ;;
esac

new_version="${major}.${minor}.${patch}"
echo "$new_version" > "$version_file"

target_dir="$versions_path/$new_version"
mkdir -p "$target_dir"

# Copy dist while resolving symlinks
if command -v rsync >/dev/null 2>&1; then
    rsync -aL --delete "$dist_src"/ "$target_dir/dist"/
else
    rm -rf "$target_dir/dist"
    mkdir -p "$target_dir/dist"
    cp -aL "$dist_src"/. "$target_dir/dist"/
fi

# Optionally copy docs
if $copy_docs; then
    if [[ -d "$docs_src" ]]; then
        if command -v rsync >/dev/null 2>&1; then
            rsync -a --delete "$docs_src"/ "$target_dir/docs"/
        else
            rm -rf "$target_dir/docs"
            mkdir -p "$target_dir/docs"
            cp -a "$docs_src"/. "$target_dir/docs"/
        fi
    else
        echo "Warning: docs folder not found, skipping: $docs_src"
    fi
fi

echo "Bumped: $current_version -> $new_version"
echo "Copied dist to: $target_dir/dist"
if $copy_docs; then
    echo "Copied docs to: $target_dir/docs"
fi