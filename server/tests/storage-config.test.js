import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const serverDirectory = fileURLToPath(new URL("../", import.meta.url));
const configUrl = new URL("../config.js", import.meta.url).href;

function configuredStorage(overrides = {}) {
  const result = spawnSync(process.execPath, ["--input-type=module", "-e",
    `const { config } = await import(${JSON.stringify(configUrl)}); process.stdout.write(JSON.stringify(config.pdfStoragePath));`,
  ], {
    cwd: serverDirectory,
    env: {
      ...process.env,
      DATABASE_URL: "postgresql://unused:unused@127.0.0.1/unused",
      PDF_STORAGE_PATH: "",
      RAILWAY_VOLUME_MOUNT_PATH: "",
      DOTENV_CONFIG_PATH: path.join(serverDirectory, "tests", "nonexistent.env"),
      DOTENV_CONFIG_QUIET: "true",
      ...overrides,
    },
    encoding: "utf8",
  });
  assert.equal(result.status, 0, result.stderr);
  return JSON.parse(result.stdout);
}

test("local document storage stays relative to the server directory", () => {
  assert.equal(configuredStorage(), path.resolve(serverDirectory, "storage/pdfs"));
});

test("an attached Railway volume is used when no document path is configured", () => {
  const mountPath = path.resolve(serverDirectory, "test-volume");
  assert.equal(configuredStorage({ RAILWAY_VOLUME_MOUNT_PATH: mountPath }), mountPath);
});

test("an explicit repository keeps precedence over an attached volume", () => {
  const mountPath = path.resolve(serverDirectory, "test-volume");
  assert.equal(configuredStorage({
    PDF_STORAGE_PATH: "storage/existing-documents",
    RAILWAY_VOLUME_MOUNT_PATH: mountPath,
  }), path.resolve(serverDirectory, "storage/existing-documents"));
});

test("blank paths use the volume and absolute repository paths are preserved", () => {
  const mountPath = path.resolve(serverDirectory, "test-volume");
  assert.equal(configuredStorage({ PDF_STORAGE_PATH: "  ", RAILWAY_VOLUME_MOUNT_PATH: ` ${mountPath} ` }), mountPath);
  const repositoryPath = path.resolve(serverDirectory, "existing-repository");
  assert.equal(configuredStorage({ PDF_STORAGE_PATH: ` ${repositoryPath} ` }), repositoryPath);
});
