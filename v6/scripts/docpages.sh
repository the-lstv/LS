#!/bin/bash

# Create a markdown documentation pages for each component
for file in js/*.js; do
    component=$(basename "$file" .js)
    # If not exists, create a markdown file for the component
    if [ ! -f "docs/components/$component.md" ]; then
        echo "# $component" > "docs/components/$component.md"
        echo "" >> "docs/components/$component.md"
        echo "Documentation for the $component component." >> "docs/components/$component.md"
    fi
done

TARGET_DIR="docs"

# Extract YAML front matter (skip leading # lines)
extract_meta() {
  awk '
    BEGIN { in_meta=0; started=0 }
    /^[[:space:]]*#/ { if (!started) next }
    /^---/ {
      if (!started) { started=1; in_meta=1; next }
      else { exit }
    }
    in_meta { print }
  ' "$1"
}

file_node() {
  local file_path="$1"
  local file_name
  file_name=$(basename "$file_path")

  if [[ "$file_name" =~ \.(md|html)$ ]]; then
    local meta_json
    meta_json=$(extract_meta "$file_path" | yq -o=json 2>/dev/null || printf 'null')

    if [ -z "$meta_json" ]; then
      meta_json=null
    fi

    jq -n --arg name "$file_name" --argjson meta "$meta_json" '{type:"file", name:$name, meta:$meta}'
  else
    jq -n --arg name "$file_name" '{type:"file", name:$name}'
  fi
}

dir_node() {
  local dir_path="$1"
  local dir_name
  dir_name=$(basename "$dir_path")
  local child_jsons=()
  local child

  shopt -s nullglob
  for child in "$dir_path"/*; do
    [ -e "$child" ] || continue
    child_jsons+=("$(build_node "$child")")
  done
  shopt -u nullglob

  local contents_json='[]'
  if [ "${#child_jsons[@]}" -gt 0 ]; then
    contents_json=$(printf '%s\n' "${child_jsons[@]}" | jq -s '.')
  fi

  jq -n --arg name "$dir_name" --argjson contents "$contents_json" '{type:"directory", name:$name, contents:$contents}'
}

build_node() {
  local node_path="$1"
  if [ -d "$node_path" ]; then
    dir_node "$node_path"
  else
    file_node "$node_path"
  fi
}

build_node "$TARGET_DIR" | jq -s '.' > docs/files.json