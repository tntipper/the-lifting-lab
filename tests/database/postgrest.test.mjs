// Direct Data API regressions against the synthetic local database only.
// Start the documented local PostgREST fixture and set LOCAL_POSTGREST_URL.
import test from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";

const origin = process.env.LOCAL_POSTGREST_URL;
if (!origin || !["127.0.0.1", "localhost"].includes(new URL(origin).hostname)) {
  throw new Error("LOCAL_POSTGREST_URL must identify the disposable loopback test API.");
}
const userA = "10000000-0000-4000-8000-000000000001";
const userB = "10000000-0000-4000-8000-000000000002";
const product = "20000000-0000-4000-8000-000000000002";
const secret = "tll-stage0-local-jwt-secret-synthetic-only-2026";
function token(sub) {
  const encode = value => Buffer.from(JSON.stringify(value)).toString("base64url");
  const body = `${encode({ alg: "HS256", typ: "JWT" })}.${encode({ role: "authenticated", sub, exp: Math.floor(Date.now() / 1000) + 600 })}`;
  return `${body}.${createHmac("sha256", secret).update(body).digest("base64url")}`;
}
async function request(path, { method = "GET", user, body, representation = false } = {}) {
  const response = await fetch(new URL(path, origin), {
    method,
    headers: {
      ...(user ? { Authorization: `Bearer ${token(user)}` } : {}),
      ...(body ? { "Content-Type": "application/json" } : {}),
      ...(representation ? { Prefer: "return=representation" } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const text = await response.text();
  return { status: response.status, data: text ? JSON.parse(text) : null };
}

test("synthetic Data API permissions and moderation", async t => {
  await t.test("public catalogue reads only active records", async () => {
    const r = await request("/products?select=id,status");
    assert.equal(r.status, 200);
    assert.ok(r.data.length >= 2);
    assert.ok(r.data.every(row => row.status === "active"));
  });
  await t.test("anonymous users cannot read private profiles", async () => {
    assert.equal((await request("/profiles?select=id")).status, 401);
  });
  await t.test("signed requests see only their own profile", async () => {
    const r = await request("/profiles?select=id", { user: userA });
    assert.equal(r.status, 200);
    assert.deepEqual(r.data, [{ id: userA }]);
  });
  await t.test("ordinary own-profile editing survives", async () => {
    const r = await request(`/profiles?id=eq.${userA}`, {
      method: "PATCH", user: userA, body: { display_name: "Synthetic API fixture" }, representation: true,
    });
    assert.equal(r.status, 200);
    assert.equal(r.data[0].display_name, "Synthetic API fixture");
  });
  for (const [field, value] of [["total_points", 999999], ["points_spent", 0], ["referral_code", "FORGED"], ["created_at", "2000-01-01T00:00:00Z"]]) {
    await t.test(`direct PATCH cannot change authoritative ${field}`, async () => {
      const r = await request(`/profiles?id=eq.${userA}`, { method: "PATCH", user: userA, body: { [field]: value } });
      assert.equal(r.status, 403);
      assert.equal(r.data.code, "42501");
    });
  }
  await t.test("another user's profile update changes no rows", async () => {
    const r = await request(`/profiles?id=eq.${userB}`, { method: "PATCH", user: userA, body: { display_name: "FORGED" }, representation: true });
    assert.equal(r.status, 200);
    assert.deepEqual(r.data, []);
    const other = await request(`/profiles?id=eq.${userB}&select=display_name`, { user: userB });
    assert.notEqual(other.data[0].display_name, "FORGED");
  });
  for (const status of ["active", "pending"]) {
    await t.test(`direct product INSERT with ${status} bypasses neither moderation nor grants`, async () => {
      const r = await request("/products", { method: "POST", user: userA, body: { name: "Synthetic forbidden publication", status, submitted_by: userB } });
      assert.equal(r.status, 403);
      assert.equal(r.data.code, "42501");
    });
  }
  await t.test("ordinary submission reaches an unreadable moderation inbox", async () => {
    const r = await request("/supplement_submissions", { method: "POST", body: { category: "whey", brand: "Fixture", product_name: "Synthetic API submission", url: "https://example.invalid/label" } });
    assert.equal(r.status, 201);
    const inbox = await request("/supplement_submissions?select=id");
    assert.equal(inbox.status, 200);
    assert.deepEqual(inbox.data, []);
  });
  await t.test("review self-approval and backdating are denied before creation", async () => {
    for (const protectedField of [{ status: "approved" }, { created_at: "2000-01-01T00:00:00Z" }]) {
      const r = await request("/reviews", { method: "POST", user: userA, body: { user_id: userA, product_id: product, rating: 5, ...protectedField } });
      assert.equal(r.status, 403);
      assert.equal(r.data.code, "42501");
    }
  });
  await t.test("ordinary review remains pending and cannot approve itself", async () => {
    const path = `/reviews?user_id=eq.${userA}&product_id=eq.${product}`;
    await request(path, { method: "DELETE", user: userA });
    const r = await request("/reviews", { method: "POST", user: userA, body: { user_id: userA, product_id: product, rating: 4, body: "Synthetic API review" }, representation: true });
    assert.equal(r.status, 201);
    assert.equal(r.data[0].status, "pending");
    assert.equal((await request(path, { method: "PATCH", user: userA, body: { status: "approved" } })).status, 403);
    assert.equal((await request(path, { method: "PATCH", user: userA, body: { created_at: "2000-01-01T00:00:00Z" } })).status, 403);
    await request(path, { method: "DELETE", user: userA });
  });
  await t.test("arbitrary share references cannot claim reward points", async () => {
    const r = await request("/rpc/award_points", { method: "POST", user: userA, body: { p_action: "share", p_ref_id: "forged-reference" } });
    assert.equal(r.status, 200);
    assert.equal(r.data, 0);
  });
});
