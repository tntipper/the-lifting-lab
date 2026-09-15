import test from "node:test";
import assert from "node:assert/strict";
import { assertPreviewIsolation } from "../config/preview-isolation.mjs";

const stagingProject = "abcdefghijklmnopqrst";
const valid = {
  VERCEL_ENV: "preview",
  NEXT_PUBLIC_TLL_ENVIRONMENT: "staging",
  TLL_STAGING_SUPABASE_PROJECT_REF: stagingProject,
  NEXT_PUBLIC_SUPABASE_URL: `https://${stagingProject}.supabase.co`,
};

test("an explicit isolated preview configuration is accepted", () => {
  assert.doesNotThrow(() => assertPreviewIsolation(valid));
});

test("inherited live database and missing stage markers block previews", () => {
  for (const env of [
    { VERCEL_ENV: "preview" },
    { ...valid, NEXT_PUBLIC_TLL_ENVIRONMENT: "production" },
    { ...valid, TLL_STAGING_SUPABASE_PROJECT_REF: "wrhgscovsgsudtedbljr" },
    { ...valid, NEXT_PUBLIC_SUPABASE_URL: "https://wrhgscovsgsudtedbljr.supabase.co" },
    { ...valid, TLL_STAGING_SUPABASE_PROJECT_REF: "" },
  ]) assert.throws(() => assertPreviewIsolation(env), /Preview/);
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

test("this preview gate does not prevent the existing production build or isolated local checks", () => {
  assert.doesNotThrow(() => assertPreviewIsolation({ VERCEL_ENV: "production" }));
  assert.doesNotThrow(() => assertPreviewIsolation({ NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54321" }));
});
