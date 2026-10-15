const fs = require("fs");
const path = require("path");
const { Client } = require("ssh2");

const root = path.resolve(__dirname, "..");
const VERSION = require("../package.json").version;

const config = {
  host: process.env.DOCKER_HOST_IP || "192.168.69.29",
  username: process.env.DOCKER_USER || "ldocker",
  password: process.env.DOCKER_PASSWORD
};

const REPO = process.env.DOCKER_REPO || "thekingziga/sejbosejbo-stream";
const ignoredDirs = new Set(["node_modules", "data", "uploads", ".git", "deploy"]);
const ignoredFiles = new Set(["npm-debug.log"]);

function connect() {
  return new Promise((resolve, reject) => {
    const conn = new Client();
    conn.on("ready", () => resolve(conn));
    conn.on("error", reject);
    conn.connect(config);
  });
}

function exec(conn, command, streamOutput = false) {
  return new Promise((resolve, reject) => {
    conn.exec(command, (err, stream) => {
      if (err) return reject(err);
      let stdout = "";
      let stderr = "";
      stream.on("data", (data) => {
        const text = data.toString();
        stdout += text;
        if (streamOutput) process.stdout.write(text);
      });
      stream.stderr.on("data", (data) => {
        const text = data.toString();
        stderr += text;
        if (streamOutput) process.stderr.write(text);
      });
      stream.on("close", (code) => {
        if (code === 0) return resolve({ stdout, stderr });
        reject(new Error(`Command failed (${code}): ${command}\n${stderr || stdout}`));
      });
    });
  });
}

function sftp(conn) {
  return new Promise((resolve, reject) => {
    conn.sftp((err, client) => (err ? reject(err) : resolve(client)));
  });
}

function listFiles(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    const rel = path.relative(root, full).replaceAll("\\", "/");
    if (entry.isDirectory() && ignoredDirs.has(entry.name)) continue;
    if (entry.isFile() && ignoredFiles.has(entry.name)) continue;
    if (entry.isDirectory()) {
      files.push(...listFiles(full));
    } else if (entry.isFile()) {
      files.push({ full, rel });
    }
  }
  return files;
}

function uploadFile(client, localPath, remotePath) {
  return new Promise((resolve, reject) => {
    client.fastPut(localPath, remotePath, (err) => (err ? reject(err) : resolve()));
  });
}

async function main() {
  console.log(`==> Connecting to ${config.username}@${config.host}...`);
  const conn = await connect();
  try {
    const info = await exec(conn, "pwd && ls -la && uname -m && docker --version");
    console.log(info.stdout.trim());

    // Find existing docker build folder on host or use ~/docker_build_images/sejbosejbo-stream
    const homeRes = await exec(conn, "echo $HOME");
    const homeDir = homeRes.stdout.trim() || "/home/ldocker";

    const findDirRes = await exec(
      conn,
      `for d in "${homeDir}/docker_build_images" "${homeDir}/docker-build-images" "${homeDir}/docker build images" "/opt/docker_build_images"; do if [ -d "$d" ]; then echo "$d"; break; fi; done`
    );
    const baseBuildFolder = findDirRes.stdout.trim() || `${homeDir}/docker_build_images`;
    const remoteBuildDir = `${baseBuildFolder}/sejbosejbo-stream`;

    console.log(`==> Preparing build directory: ${remoteBuildDir}`);
    await exec(conn, `rm -rf "${remoteBuildDir}" && mkdir -p "${remoteBuildDir}"`);

    const client = await sftp(conn);
    const files = listFiles(root);
    const madeDirs = new Set();

    for (const file of files) {
      const remoteFile = `${remoteBuildDir}/${file.rel}`;
      const remoteDir = path.posix.dirname(remoteFile);
      if (!madeDirs.has(remoteDir)) {
        await exec(conn, `mkdir -p "${remoteDir}"`);
        madeDirs.add(remoteDir);
      }
      await uploadFile(client, file.full, remoteFile);
      console.log(`   uploaded ${file.rel}`);
    }

    console.log(`==> Building Docker image ${REPO}:${VERSION} and ${REPO}:latest on ${config.host}...`);
    await exec(
      conn,
      `docker build -t "${REPO}:${VERSION}" -t "${REPO}:latest" "${remoteBuildDir}"`,
      true
    );

    console.log(`==> Pushing ${REPO}:${VERSION} and ${REPO}:latest to Docker Hub...`);
    await exec(conn, `docker push "${REPO}:${VERSION}"`, true);
    await exec(conn, `docker push "${REPO}:latest"`, true);

    console.log(`==> Verifying manifest on Docker Hub...`);
    await exec(conn, `docker manifest inspect "${REPO}:${VERSION}" >/dev/null 2>&1`);
    console.log(`✅ Published ${REPO}:${VERSION} and ${REPO}:latest to Docker Hub!`);
  } finally {
    conn.end();
  }
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
