const fs = require("fs");
const path = require("path");
const https = require("https");

const OUTPUT_FILE = path.join(__dirname, "..", "docs", "en-roles-mapping.json");

const DEPT_DIRS = [
  { dir: "engineering", key: "engineering" },
  { dir: "design", key: "design" },
  { dir: "marketing", key: "marketing" },
  { dir: "paid-media", key: "paid_media" },
  { dir: "sales", key: "sales" },
  { dir: "finance", key: "finance" },
  { dir: "hr", key: "hr" },
  { dir: "legal", key: "legal" },
  { dir: "supply-chain", key: "supply_chain" },
  { dir: "product", key: "product" },
  { dir: "project-management", key: "project_management" },
  { dir: "testing", key: "testing" },
  { dir: "support", key: "support" },
  { dir: "specialized", key: "specialized" },
  { dir: "spatial-computing", key: "spatial_computing" },
  { dir: "game-development", key: "game_dev" },
  { dir: "academic", key: "academic" },
];

function fetchJSON(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { "User-Agent": "node" } }, (res) => {
      let data = "";
      res.on("data", (c) => (data += c));
      res.on("end", () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          reject(e);
        }
      });
    }).on("error", reject);
  });
}

function fetchText(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { "User-Agent": "node" } }, (res) => {
      let data = "";
      res.on("data", (c) => (data += c));
      res.on("end", () => resolve(data));
    }).on("error", reject);
  });
}

function parseFrontmatter(content) {
  const match = content.match(/^---\n([\s\S]*?)\n---/);
  if (!match) return {};
  const fm = {};
  for (const line of match[1].split("\n")) {
    const m = line.match(/^(\w+):\s*["']?(.*?)["']?\s*$/);
    if (m) fm[m[1]] = m[2];
  }
  return fm;
}

async function main() {
  const mapping = {};

  for (const { dir, key } of DEPT_DIRS) {
    console.log(`Fetching ${dir}...`);
    let files;
    try {
      files = await fetchJSON(
        `https://api.github.com/repos/msitarzewski/agency-agents/contents/${dir}`
      );
    } catch (e) {
      console.log(`  Failed to fetch ${dir}, skipping`);
      continue;
    }

    if (!Array.isArray(files)) {
      console.log(`  No files in ${dir}, skipping`);
      continue;
    }

    const mdFiles = files.filter((f) => f.name.endsWith(".md"));
    console.log(`  Found ${mdFiles.length} MD files`);

    mapping[key] = [];

    for (const file of mdFiles) {
      const slug = file.name.replace(/\.md$/, "").replace(/^[^-]+-/, "");
      try {
        const content = await fetchText(
          `https://raw.githubusercontent.com/msitarzewski/agency-agents/main/${dir}/${file.name}`
        );
        const fm = parseFrontmatter(content);
        mapping[key].push({
          fileName: file.name,
          slug: slug,
          enName: fm.name || slug,
          enDescription: fm.description || "",
          emoji: fm.emoji || "",
          color: fm.color || "",
        });
        process.stdout.write(".");
      } catch (e) {
        console.log(`  Failed to fetch ${file.name}: ${e.message}`);
        mapping[key].push({
          fileName: file.name,
          slug: slug,
          enName: slug,
          enDescription: "",
          emoji: "",
          color: "",
        });
      }
    }
    console.log("");
  }

  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(mapping, null, 2), "utf-8");
  console.log(`\nMapping saved to ${OUTPUT_FILE}`);

  let total = 0;
  for (const [dept, roles] of Object.entries(mapping)) {
    console.log(`  ${dept}: ${roles.length} roles`);
    total += roles.length;
  }
  console.log(`Total: ${total} roles`);
}

main().catch(console.error);
