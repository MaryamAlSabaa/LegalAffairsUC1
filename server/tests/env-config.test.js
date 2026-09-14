import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

const testsDirectory = fileURLToPath(new URL("./", import.meta.url));
const repositoryDirectory = fileURLToPath(new URL("../../", import.meta.url));
const fixtureDatabaseUrl = "postgresql://unused:unused@127.0.0.1/env_config_tests";

async function createFixture(context, envContents) {
  // Keep the copied module beneath server so it resolves the installed dotenv package.
  const directory = await fs.mkdtemp(path.join(testsDirectory, "env-config-fixture-"));
  const files = [];
  context.after(async () => {
    for (const file of files) await fs.unlink(file);
    await fs.rmdir(directory);
  });
  const configPath = path.join(directory, "config.js");
  await fs.copyFile(new URL("../config.js", import.meta.url), configPath);
  files.push(configPath);
  async function writeEnv(name, contents) {
    const file = path.join(directory, name);
    await fs.writeFile(file, contents);
    files.push(file);
    return file;
  }
  if (envContents !== undefined) await writeEnv(".env", envContents);
  return { directory, configPath, writeEnv };
}

function loadConfiguration(fixture, { cwd = repositoryDirectory, overrides = {} } = {}) {
  const env = { ...process.env };
  for (const name of Object.keys(env)) {
    if (["DATABASE_URL", "USE_MOCK_AI_REVIEW", "GEMINI_API_KEY", "GEMINI_MODEL", "DOTENV_KEY"].includes(name)
      || name.startsWith("DOTENV_CONFIG_")) delete env[name];
  }
  Object.assign(env, { DOTENV_CONFIG_QUIET: "true" }, overrides);
  const result = spawnSync(process.execPath, ["--input-type=module", "-e", `
    const { config } = await import(${JSON.stringify(pathToFileURL(fixture.configPath).href)});
    process.stdout.write(JSON.stringify({
      databaseUrl: config.databaseUrl,
      useMockAiReview: config.useMockAiReview,
      apiKey: config.gemini.apiKey,
      model: config.gemini.model,
    }));
  `], { cwd, env, encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
  return JSON.parse(result.stdout);
}

test("server .env is loaded relative to config.js from the repository root or another working directory", async (context) => {
  const fixture = await createFixture(context, [
    `DATABASE_URL=${fixtureDatabaseUrl}`,
    "USE_MOCK_AI_REVIEW=false",
    "GEMINI_API_KEY=fixture-key-never-sent",
    "GEMINI_MODEL=fixture-model",
  ].join("\n"));
  const expected = {
    databaseUrl: fixtureDatabaseUrl,
    useMockAiReview: false,
    apiKey: "fixture-key-never-sent",
    model: "fixture-model",
  };
  assert.deepEqual(loadConfiguration(fixture), expected);
  assert.deepEqual(loadConfiguration(fixture, { cwd: testsDirectory }), expected);
});

test("DOTENV_CONFIG_PATH selects the requested file instead of the default server .env", async (context) => {
  const fixture = await createFixture(context, [
    `DATABASE_URL=${fixtureDatabaseUrl}`,
    "USE_MOCK_AI_REVIEW=true",
    "GEMINI_API_KEY=default-fixture-key",
    "GEMINI_MODEL=default-fixture-model",
  ].join("\n"));
  const selectedPath = await fixture.writeEnv("selected.env", [
    `DATABASE_URL=${fixtureDatabaseUrl}`,
    "USE_MOCK_AI_REVIEW=false",
    "GEMINI_API_KEY=selected-fixture-key",
    "GEMINI_MODEL=selected-fixture-model",
  ].join("\n"));
  assert.deepEqual(loadConfiguration(fixture, { overrides: { DOTENV_CONFIG_PATH: selectedPath } }), {
    databaseUrl: fixtureDatabaseUrl,
    useMockAiReview: false,
    apiKey: "selected-fixture-key",
    model: "selected-fixture-model",
  });
});

test("injected server environment values take precedence over .env values", async (context) => {
  const fixture = await createFixture(context, [
    "DATABASE_URL=postgresql://unused:unused@127.0.0.1/file_config_tests",
    "USE_MOCK_AI_REVIEW=true",
    "GEMINI_API_KEY=file-fixture-key",
    "GEMINI_MODEL=file-fixture-model",
  ].join("\n"));
  assert.deepEqual(loadConfiguration(fixture, { overrides: {
    DATABASE_URL: fixtureDatabaseUrl,
    USE_MOCK_AI_REVIEW: "false",
    GEMINI_API_KEY: "injected-fixture-key",
    GEMINI_MODEL: "injected-fixture-model",
  } }), {
    databaseUrl: fixtureDatabaseUrl,
    useMockAiReview: false,
    apiKey: "injected-fixture-key",
    model: "injected-fixture-model",
  });
});

test("missing AI settings preserve mock mode and an empty provider key", async (context) => {
  const fixture = await createFixture(context, `DATABASE_URL=${fixtureDatabaseUrl}\n`);
  const config = loadConfiguration(fixture);
  assert.equal(config.useMockAiReview, true);
  assert.equal(config.apiKey, "");
  assert.equal(config.model, "gemini-3.6-flash");
});

test("injected model settings trim whitespace and blank values use the supported default", async (context) => {
  const fixture = await createFixture(context, `DATABASE_URL=${fixtureDatabaseUrl}\nGEMINI_MODEL=file-fixture-model\n`);
  assert.equal(loadConfiguration(fixture, { overrides: { GEMINI_MODEL: "  custom-model  " } }).model, "custom-model");
  for (const model of ["", "   "]) {
    assert.equal(loadConfiguration(fixture, { overrides: { GEMINI_MODEL: model } }).model, "gemini-3.6-flash");
  }
});

test("an explicit missing env file does not fall back to the default .env", async (context) => {
  const fixture = await createFixture(context, [
    `DATABASE_URL=${fixtureDatabaseUrl}`,
    "USE_MOCK_AI_REVIEW=false",
    "GEMINI_API_KEY=default-fixture-key",
  ].join("\n"));
  const config = loadConfiguration(fixture, { overrides: {
    DATABASE_URL: fixtureDatabaseUrl,
    DOTENV_CONFIG_PATH: path.join(fixture.directory, "nonexistent.env"),
  } });
  assert.equal(config.useMockAiReview, true);
  assert.equal(config.apiKey, "");
});
