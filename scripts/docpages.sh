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
DEST_PATH="$1"

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

if [ -n "$DEST_PATH" ]; then
  node - "$TARGET_DIR" "$DEST_PATH" <<'NODE'
const fs = require("node:fs");
const path = require("node:path");

const [srcRootArg, destRootArg] = process.argv.slice(2);

if (!srcRootArg || !destRootArg) {
  console.error("Usage: node export-docs.js <source> <destination>");
  process.exit(1);
}

const srcRoot = path.resolve(srcRootArg);
const destRoot = path.resolve(destRootArg);

if (destRoot === srcRoot || destRoot.startsWith(srcRoot + path.sep)) {
  console.error("Destination path must be outside the source docs directory.");
  process.exit(1);
}

function titleFromName(name) {
  const base = name.replace(/\.[^.]+$/, "").replace(/[-_]+/g, " ").trim();
  if (!base) return "Docs";
  return base.replace(/\b\w/g, (c) => c.toUpperCase());
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function escapePageValue(value) {
  return String(value)
    .replace(/\\/g, "\\\\")
    .replace(/\"/g, '\\"')
    .replace(/\r?\n/g, " ")
    .trim();
}

function slugifyHeader(text) {
  return text
    .toLowerCase()
    .trim()
    .replace(/[\u2019']/g, "")
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-");
}

function parseFrontMatter(content) {
  const input = content.replace(/^\uFEFF/, "");
  const match = input.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  if (!match) {
    return { meta: {}, body: input };
  }

  const meta = {};
  for (const rawLine of match[1].split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const splitIndex = line.indexOf(":");
    if (splitIndex < 0) continue;
    const key = line.slice(0, splitIndex).trim();
    let value = line.slice(splitIndex + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    meta[key] = value;
  }

  return { meta, body: input.slice(match[0].length) };
}

function parseMarkdownHeaders(markdown) {
  const headers = [];
  const seen = new Map();
  for (const line of markdown.split(/\r?\n/)) {
    const match = line.match(/^(#{1,6})\s+(.+?)\s*$/);
    if (!match) continue;
    const level = match[1].length;
    if (level < 2 || level > 3) continue;
    const title = match[2].replace(/[`*_]+/g, "").trim();
    if (!title) continue;

    const base = slugifyHeader(title) || "section";
    const count = seen.get(base) || 0;
    seen.set(base, count + 1);
    const anchor = count === 0 ? base : `${base}-${count + 1}`;

    headers.push({ level, title, anchor });
  }
  return headers;
}

function deriveDescription(markdown, meta, fallbackTitle) {
  if (meta.description && String(meta.description).trim()) {
    return String(meta.description).trim();
  }

  for (const rawLine of markdown.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;
    if (line.startsWith("#")) continue;
    if (line.startsWith("![[") || line.startsWith("![")) continue;
    const clean = line.replace(/[`*_]/g, "").trim();
    if (clean) {
      return clean.length > 160 ? `${clean.slice(0, 157)}...` : clean;
    }
  }

  return `${fallbackTitle} documentation page in LS Docs.`;
}

function deriveKeywords(meta, title, headers) {
  const base = ["LSTV", "LS Docs", "LS", title];
  if (meta.keywords && String(meta.keywords).trim()) {
    return `LSTV, ${String(meta.keywords).trim()}`;
  }

  for (const header of headers.slice(0, 4)) {
    base.push(header.title);
  }

  const unique = Array.from(new Set(base.map((item) => item.trim()).filter(Boolean)));
  return unique.join(", ");
}

function buildPageHead(pageMeta) {
  return [
    "<head>",
    "    @page {",
    `        title: \"${escapePageValue(pageMeta.title)}\";`,
    `        description: \"${escapePageValue(pageMeta.description)}\";`,
    `        keywords: \"${escapePageValue(pageMeta.keywords)}\";`,
    "    }",
    "</head>",
    "@import(\"/docs/ls/sidebar.html\");"
  ].join("\n");
}

function wrapMarkdown(markdownContent, pageMeta) {
  const normalized = markdownContent.replace(/\r\n/g, "\n");
  return [
    "#template /templates/docs.html",
    "",
    buildPageHead(pageMeta).trimEnd(),
    "",
    "<div .docs-content>",
    "<markdown>",
    normalized,
    "</markdown>",
    "</div>",
    ""
  ].join("\n");
}

function renderSidebarButton(href, label) {
  return `<a href="${escapeHtml(href)}" class="ls-button elevated"><span>${escapeHtml(label)}</span></a>`;
}

function renderSidebarSection(title, buttons, nestedBlocks, useDetails) {
  const titleHtml = `<span class="sidebar-menu-category-title">${escapeHtml(title)}</span>`;
  const buttonsHtml = buttons.length ? `<div class="grouped-buttons">\n${buttons.join("\n")}\n</div>` : "";
  const nestedHtml = nestedBlocks.join("\n");
  const body = [buttonsHtml, nestedHtml].filter(Boolean).join("\n");

  if (useDetails) {
    return [
      "<details>",
      `<summary>${titleHtml}</summary>`,
      body,
      "</details>"
    ].join("\n");
  }

  return [titleHtml, body].filter(Boolean).join("\n");
}

function loadFilesTree(filesJsonPath) {
  if (!fs.existsSync(filesJsonPath)) return null;
  const parsed = JSON.parse(fs.readFileSync(filesJsonPath, "utf8"));
  if (Array.isArray(parsed) && parsed[0] && parsed[0].type === "directory") {
    return parsed[0];
  }
  return null;
}

function buildDocIndex(node, relDir = "") {
  if (!node || node.type !== "directory" || !Array.isArray(node.contents)) return null;

  const dirRelPath = relDir;
  const files = [];
  const directories = [];

  for (const child of node.contents) {
    if (child.type === "directory") {
      const childRel = path.posix.join(dirRelPath, child.name);
      const childDir = buildDocIndex(child, childRel);
      if (childDir) directories.push(childDir);
      continue;
    }

    if (child.type !== "file") continue;
    if (!/\.(md|html)$/i.test(child.name)) continue;

    const sourceRelative = path.posix.join(dirRelPath, child.name);
    const sourcePath = path.join(srcRoot, sourceRelative);
    const outputRelative = sourceRelative.replace(/\.md$/i, ".html");

    let title = titleFromName(child.name);
    let description = `${title} documentation page in LS Docs.`;
    let keywords = `LSTV, LS Docs, ${title}`;
    let headers = [];

    if (/\.md$/i.test(child.name) && fs.existsSync(sourcePath)) {
      const markdownRaw = fs.readFileSync(sourcePath, "utf8");
      const { meta, body } = parseFrontMatter(markdownRaw);
      headers = parseMarkdownHeaders(body);
      title = String(meta.title || "").trim() || titleFromName(child.name);
      description = deriveDescription(body, meta, title);
      keywords = deriveKeywords(meta, title, headers);
    }

    files.push({
      title,
      sourceRelative,
      outputRelative,
      headers,
      description,
      keywords
    });
  }

  files.sort((a, b) => a.outputRelative.localeCompare(b.outputRelative));
  directories.sort((a, b) => a.name.localeCompare(b.name));

  return {
    name: node.name,
    relPath: dirRelPath,
    files,
    directories
  };
}

function renderSidebarDirectory(indexNode, depth = 0) {
  const sectionTitle = depth === 0 ? "Docs" : titleFromName(indexNode.name);
  const buttons = [];

  for (const file of indexNode.files) {
    const pageHref = file.outputRelative;
    buttons.push(renderSidebarButton(pageHref, file.title));

    for (const header of file.headers) {
      const anchorLabel = header.title;
      buttons.push(renderSidebarButton(`${pageHref}#${header.anchor}`, anchorLabel));
    }
  }

  const nested = indexNode.directories.map((dir) => renderSidebarDirectory(dir, depth + 1));
  return renderSidebarSection(sectionTitle, buttons, nested, depth > 0);
}

function writeSidebar(destDir, filesJsonPath) {
  const tree = loadFilesTree(filesJsonPath);
  if (!tree) return;

  const index = buildDocIndex(tree, "");
  if (!index) return;

  const sidebarHtml = [
    "<div .docs-sidebar>",
    renderSidebarDirectory(index),
    "</div>",
    ""
  ].join("\n");

  fs.writeFileSync(path.join(destDir, "sidebar.html"), sidebarHtml, "utf8");
}

function copyAndTransform(sourceDir, targetDir) {
  fs.mkdirSync(targetDir, { recursive: true });

  for (const entry of fs.readdirSync(sourceDir, { withFileTypes: true })) {
    const sourcePath = path.join(sourceDir, entry.name);
    const targetName = entry.isFile() ? entry.name.replace(/\.md$/i, ".html") : entry.name;
    const targetPath = path.join(targetDir, targetName);

    if (entry.isDirectory()) {
      copyAndTransform(sourcePath, targetPath);
      continue;
    }

    if (entry.isFile() && /\.md$/i.test(entry.name)) {
      const markdown = fs.readFileSync(sourcePath, "utf8");
      const { meta, body } = parseFrontMatter(markdown);
      const pageTitle = String(meta.title || "").trim() || titleFromName(entry.name);
      const pageHeaders = parseMarkdownHeaders(body);
      const pageDescription = deriveDescription(body, meta, pageTitle);
      const pageKeywords = deriveKeywords(meta, pageTitle, pageHeaders);
      fs.writeFileSync(targetPath, wrapMarkdown(body, {
        title: `LSTV | LS Docs > ${pageTitle}`,
        description: pageDescription,
        keywords: pageKeywords
      }), "utf8");
      continue;
    }

    if (entry.isFile()) {
      fs.copyFileSync(sourcePath, targetPath);
    }
  }
}

copyAndTransform(srcRoot, destRoot);
writeSidebar(destRoot, path.join(srcRoot, "files.json"));
NODE
fi