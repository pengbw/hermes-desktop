const https = require("https");
const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

const targetDir = path.join(__dirname, "..", "src-tauri", "hermes-agent-source");
const zipPath = path.join(__dirname, "..", "src-tauri", "hermes-agent-main.zip");

const mirrorUrls = [
  "https://github.com/NousResearch/hermes-agent/archive/refs/heads/main.zip",
  "https://ghfast.top/https://github.com/NousResearch/hermes-agent/archive/refs/heads/main.zip",
  "https://ghproxy.cn/https://github.com/NousResearch/hermes-agent/archive/refs/heads/main.zip",
];

function download(url, destPath) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(destPath);
    const request = https.get(url, { timeout: 120000 }, (response) => {
      if (response.statusCode === 301 || response.statusCode === 302) {
        file.close();
        try { fs.unlinkSync(destPath); } catch (_) {}
        download(response.headers.location, destPath).then(resolve).catch(reject);
        return;
      }
      if (response.statusCode !== 200) {
        file.close();
        try { fs.unlinkSync(destPath); } catch (_) {}
        reject(new Error("HTTP " + response.statusCode));
        return;
      }
      response.pipe(file);
      file.on("finish", () => {
        file.close();
        resolve();
      });
    });
    request.on("error", (err) => {
      file.close();
      try { fs.unlinkSync(destPath); } catch (_) {}
      reject(err);
    });
    request.on("timeout", () => {
      request.destroy();
      file.close();
      try { fs.unlinkSync(destPath); } catch (_) {}
      reject(new Error("Request timeout"));
    });
  });
}

async function main() {
  console.log("[hermes-source] Downloading hermes-agent source code...");

  if (fs.existsSync(targetDir)) {
    console.log("[hermes-source] Removing existing source directory...");
    fs.rmSync(targetDir, { recursive: true, force: true });
  }

  let downloaded = false;

  for (const url of mirrorUrls) {
    try {
      console.log("[hermes-source] Trying: " + url);
      await download(url, zipPath);
      downloaded = true;
      break;
    } catch (err) {
      console.warn("[hermes-source] Failed: " + err.message);
    }
  }

  if (!downloaded) {
    console.error("[hermes-source] All mirrors failed, cannot download hermes-agent source");
    process.exit(1);
  }

  const zipSize = fs.statSync(zipPath).size;
  console.log("[hermes-source] Downloaded " + (zipSize / 1024 / 1024).toFixed(2) + " MB");

  if (zipSize < 100000) {
    console.error("[hermes-source] Downloaded file is too small, possibly an error page");
    fs.unlinkSync(zipPath);
    process.exit(1);
  }

  console.log("[hermes-source] Extracting...");
  const extractDir = path.join(__dirname, "..", "src-tauri", "_hermes-extract");
  if (fs.existsSync(extractDir)) {
    fs.rmSync(extractDir, { recursive: true, force: true });
  }
  fs.mkdirSync(extractDir, { recursive: true });

  if (process.platform === "win32") {
    execSync(
      'powershell -Command "Expand-Archive -Path \'' + zipPath + '\' -DestinationPath \'' + extractDir + '\' -Force"',
      { stdio: "inherit" }
    );
  } else {
    execSync('unzip -o "' + zipPath + '" -d "' + extractDir + '"', { stdio: "inherit" });
  }

  const extractedDirs = fs.readdirSync(extractDir).filter(function (f) {
    return fs.statSync(path.join(extractDir, f)).isDirectory();
  });

  let sourceDir = extractDir;
  if (extractedDirs.length === 1 && extractedDirs[0].startsWith("hermes-agent-")) {
    sourceDir = path.join(extractDir, extractedDirs[0]);
  }

  fs.mkdirSync(targetDir, { recursive: true });
  copyDirRecursive(sourceDir, targetDir);
  fs.rmSync(extractDir, { recursive: true, force: true });

  try { fs.unlinkSync(zipPath); } catch (_) {}
  console.log("[hermes-source] Done! hermes-agent source is ready for bundling.");
}

function copyDirRecursive(src, dst) {
  const entries = fs.readdirSync(src, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const dstPath = path.join(dst, entry.name);
    if (entry.isDirectory()) {
      fs.mkdirSync(dstPath, { recursive: true });
      copyDirRecursive(srcPath, dstPath);
    } else {
      fs.copyFileSync(srcPath, dstPath);
    }
  }
}

main().catch(function (err) {
  console.error("[hermes-source] Error:", err.message);
  process.exit(1);
});
