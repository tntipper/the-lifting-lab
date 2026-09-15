import test from "node:test";
import assert from "node:assert/strict";
import {
  assertPreviewIsolation,
  SYNTHETIC_PREVIEW_URL,
} from "../config/preview-isolation.mjs";

const stagingProject = "abcdefghijklmnopqrst";
const valid = {
  VERCEL_ENV: "preview",
  NEXT_PUBLIC_TLL_ENVIRONMENT: "staging",
  TLL_STAGING_SUPABASE_PROJECT_REF: stagingProject,
  NEXT_PUBLIC_SUPABASE_URL: `https://${stagingProject}.supabase.co`,
};

test("an explicit isolated preview configuration is accepted", () => {
  const env = { ...valid };
  assert.doesNotThrow(() => assertPreviewIsolation(env));
  assert.equal(env.TLL_STAGING_SUPABASE_PROJECT_REF, stagingProject);
});

test("inherited live database and missing stage markers use synthetic preview env", () => {
  for (const env of [
    { VERCEL_ENV: "preview" },
    {
      VERCEL_ENV: "preview",
      NEXT_PUBLIC_SUPABASE_URL: "https://wrhgscovsgsudtedbljr.supabase.co",
      NEXT_PUBLIC_SUPABASE_ANON_KEY: "prod-key",
    },
    {
      ...valid,
      TLL_STAGING_SUPABASE_PROJECT_REF: "wrhgscovsgsudtedbljr",
      NEXT_PUBLIC_SUPABASE_URL: "https://wrhgscovsgsudtedbljr.supabase.co",
    },
  ]) {
    assert.doesNotThrow(() => assertPreviewIsolation(env));
    assert.equal(env.NEXT_PUBLIC_TLL_ENVIRONMENT, "synthetic-preview");
    assert.equal(env.TLL_STAGING_SUPABASE_PROJECT_REF, undefined);
    assert.equal(env.NEXT_PUBLIC_SUPABASE_URL, SYNTHETIC_PREVIEW_URL);
    assert.equal(env.NEXT_PUBLIC_SUPABASE_ANON_KEY, "tll-preview-synthetic-public-key");
  }
});

test("misleading URLs, credentials and unexpected paths are rejected", () => {
  for (const url of [
    "not-a-url",
    `http://${stagingProject}.supabase.co`,
    `https://${stagingProject}.supabase.co.evil.example`,
    `https://username@${stagingProject}.supabase.co`,
    `https://${stagingProject}.supabase.co:444`,
    `https://${stagingProject}.supabase.co/rest/v1`,
    `https://${stagingProject}.supabase.co?ignored=true`,
    `https://${stagingProject}.supabase.co#ignored`,
  ]) assert.throws(() => assertPreviewIsolation({ ...valid, NEXT_PUBLIC_SUPABASE_URL: url }), /Preview/);
});

test("partial staging markers without a matching URL still fail closed", () => {
  assert.throws(
    () => assertPreviewIsolation({
      VERCEL_ENV: "preview",
      NEXT_PUBLIC_TLL_ENVIRONMENT: "staging",
      TLL_STAGING_SUPABASE_PROJECT_REF: stagingProject,
    }),
    /Preview/,
  );
  assert.throws(
    () => assertPreviewIsolation({
      ...valid,
      NEXT_PUBLIC_TLL_ENVIRONMENT: "production",
    }),
    /Preview/,
  );
});

test("this preview gate does not prevent the existing production build or isolated local checks", () => {
  assert.doesNotThrow(() => assertPreviewIsolation({ VERCEL_ENV: "production" }));
  assert.doesNotThrow(() => assertPreviewIsolation({ NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54321" }));
});


test("synthetic preview stays explicit and idempotent across config loads", () => {
  const env = { VERCEL_ENV: "preview" };
  assertPreviewIsolation(env);
  const first = { ...env };
  assertPreviewIsolation(env);
  assert.deepEqual(env, first);
  assert.equal(new URL(env.NEXT_PUBLIC_SUPABASE_URL).hostname.endsWith(".invalid"), true);
});
