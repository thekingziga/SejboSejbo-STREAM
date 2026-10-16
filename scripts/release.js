#!/usr/bin/env node
/**
 * Automated GitHub Release & Versioned Source Code Publisher
 *
 * Usage:
 *   node scripts/release.js              # releases current version in package.json
 *   node scripts/release.js 1.0.0 <sha>  # releases a specific version & commit
 */

const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const REPO = process.env.GITHUB_REPO || "thekingziga/SejboSejbo-STREAM";
const DOCKER_REPO = process.env.DOCKER_REPO || "thekingziga/sejbosejbo-stream";

function getGithubToken() {
  if (process.env.GITHUB_TOKEN) return process.env.GITHUB_TOKEN.trim();
  const out = execSync("git credential fill", {
    input: "protocol=https\nhost=github.com\n",
    encoding: "utf8"
  });
  const line = out.split(/\r?\n/).find((l) => l.startsWith("password="));
  if (!line) throw new Error("No GitHub token found in GITHUB_TOKEN or git credential manager.");
  return line.replace("password=", "").trim();
}

async function publishRelease(version, ref = "HEAD", notes = "") {
  const cleanVer = String(version).replace(/^v/, "");
  const tag = `v${cleanVer}`;
  const token = getGithubToken();

  // Ensure git tag exists and is pushed
  try {
    execSync(`git rev-parse ${tag}`, { stdio: "ignore" });
  } catch {
    execSync(`git tag -a ${tag} ${ref} -m "Release ${tag}"`);
  }
  execSync(`git push origin ${tag}`, { stdio: "inherit" });

  // Export exact source code archive from git for this tag
  const tmpDir = path.join(require("os").tmpdir(), `sejbosejbo-release-${cleanVer}`);
  fs.mkdirSync(tmpDir, { recursive: true });
  const tarFile = path.join(tmpDir, `sejbosejbo-stream-${tag}-source.tar.gz`);
  const zipFile = path.join(tmpDir, `sejbosejbo-stream-${tag}-source.zip`);

  execSync(`git archive --format=tar.gz --prefix=sejbosejbo-stream-${cleanVer}/ -o "${tarFile}" ${tag}`);
  execSync(`git archive --format=zip --prefix=sejbosejbo-stream-${cleanVer}/ -o "${zipFile}" ${tag}`);

  const releaseBody = notes || [
    `## SEJBOSEJBO.TV — Release ${tag}`,
    "",
    `- **Docker Hub Image**: \`${DOCKER_REPO}:${cleanVer}\` (and \`${DOCKER_REPO}:latest\`)`,
    `- **Source Code**: Attached below as \`sejbosejbo-stream-${tag}-source.tar.gz\` and \`sejbosejbo-stream-${tag}-source.zip\` (as well as GitHub's automatic source archives).`,
    "",
    "### Quickstart with Docker",
    "```bash",
    `docker run -d --name sejbosejbo-live -p 3030:3030 -v $(pwd)/data:/app/data -v $(pwd)/uploads:/app/uploads ${DOCKER_REPO}:${cleanVer}`,
    "```"
  ].join("\n");

  const headers = {
    Authorization: `Bearer ${token}`,
    Accept: "application/vnd.github+json",
    "User-Agent": "sejbosejbo-release-script",
    "Content-Type": "application/json"
  };

  let release;
  const existingRes = await fetch(`https://api.github.com/repos/${REPO}/releases/tags/${tag}`, { headers });
  if (existingRes.ok) {
    const existing = await existingRes.json();
    const patchRes = await fetch(`https://api.github.com/repos/${REPO}/releases/${existing.id}`, {
      method: "PATCH",
      headers,
      body: JSON.stringify({ name: `${tag} — Sejbosejbo Live`, body: releaseBody })
    });
    release = await patchRes.json();
  } else {
    const createRes = await fetch(`https://api.github.com/repos/${REPO}/releases`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        tag_name: tag,
        name: `${tag} — Sejbosejbo Live`,
        body: releaseBody,
        draft: false,
        prerelease: false
      })
    });
    if (!createRes.ok) {
      throw new Error(`Failed to create release ${tag}: ${await createRes.text()}`);
    }
    release = await createRes.json();
  }

  // Upload source code archives as release assets
  const uploadBase = release.upload_url.replace(/\{\?name,label\}$/, "");
  for (const [filePath, mime] of [
    [tarFile, "application/gzip"],
    [zipFile, "application/zip"]
  ]) {
    const fileName = path.basename(filePath);
    const existingAsset = (release.assets || []).find((a) => a.name === fileName);
    if (existingAsset) {
      await fetch(`https://api.github.com/repos/${REPO}/releases/assets/${existingAsset.id}`, {
        method: "DELETE",
        headers
      });
    }
    const bytes = fs.readFileSync(filePath);
    const upRes = await fetch(`${uploadBase}?name=${encodeURIComponent(fileName)}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github+json",
        "User-Agent": "sejbosejbo-release-script",
        "Content-Type": mime
      },
      body: bytes
    });
    if (!upRes.ok) {
      throw new Error(`Failed uploading ${fileName}: ${await upRes.text()}`);
    }
    console.log(`   uploaded asset: ${fileName} (${bytes.length} bytes)`);
  }

  fs.rmSync(tmpDir, { recursive: true, force: true });
  console.log(`✅ Published GitHub Release ${tag}: ${release.html_url}`);
}

const argVer = process.argv[2] || require("../package.json").version;
const argRef = process.argv[3] || "HEAD";
const argNotes = process.argv[4] || "";

publishRelease(argVer, argRef, argNotes).catch((err) => {
  console.error(err.message);
  process.exit(1);
});
