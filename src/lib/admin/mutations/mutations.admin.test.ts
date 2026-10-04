import { describe, expect, it } from "vitest";
import {
  attachSource,
  createDraft,
  publishRecord,
  rejectRecord,
  supersedeRecord,
  updateDraft,
  withdrawRecord,
} from "@/lib/admin/mutations/operations";
import { sanitizeError } from "@/lib/admin/mutations/errors";
import { fakeContext, SYNTHETIC_ADMIN_ID } from "@/test/admin/fake-context";

const RECORD_ID = "00000000-0000-4000-8000-0000000000b1";
const NEW_ID = "00000000-0000-4000-8000-0000000000c1";
const provider = {
  table: "providers",
  values: { slug: "example-provider", name: "Example Provider" },
};

describe("admin mutation pipeline: authentication and identity", () => {
  it("refuses an unauthenticated caller before touching the database", async () => {
    const { ctx, calls } = fakeContext({ access: { status: "unauthenticated" } });
    const result = await createDraft(ctx, provider);
    expect(result).toEqual({
      ok: false,
      code: "unauthenticated",
      message: "Please sign in to continue.",
    });
    expect(calls).toEqual([]);
  });

  it("refuses a signed-in user without an admin identity", async () => {
    const { ctx, calls } = fakeContext({ access: { status: "identity_missing" } });
    expect(await createDraft(ctx, provider)).toMatchObject({ ok: false, code: "forbidden" });
    expect(calls).toEqual([]);
  });

  it("refuses a disabled admin", async () => {
    const { ctx, calls } = fakeContext({ access: { status: "identity_disabled" } });
    expect(await createDraft(ctx, provider)).toMatchObject({ ok: false, code: "account_disabled" });
    expect(calls).toEqual([]);
  });

  it("fails closed when authentication is unavailable or the session vanished", async () => {
    const unavailable = fakeContext({ access: { status: "unavailable" } });
    expect(await createDraft(unavailable.ctx, provider)).toMatchObject({
      ok: false,
      code: "internal",
    });
    const vanished = fakeContext({ permissions: ["edit_draft"], noDatabase: true });
    expect(await createDraft(vanished.ctx, provider)).toMatchObject({
      ok: false,
      code: "unauthenticated",
    });
  });

  it("refuses when the database identity differs from the session identity", async () => {
    const { ctx, workflowCalls } = fakeContext({
      permissions: ["edit_draft"],
      databaseAdminId: "00000000-0000-4000-8000-00000000a999",
    });
    expect(await createDraft(ctx, provider)).toMatchObject({ ok: false, code: "forbidden" });
    expect(workflowCalls()).toEqual([]);
  });
});

describe("admin mutation pipeline: authorization", () => {
  it("refuses a role without the permission and never calls the workflow function", async () => {
    const { ctx, workflowCalls } = fakeContext({ permissions: ["view_admin", "validate_fact"] });
    expect(await createDraft(ctx, provider)).toMatchObject({ ok: false, code: "forbidden" });
    expect(await publishRecord(ctx, { table: "providers", id: RECORD_ID })).toMatchObject({
      ok: false,
      code: "forbidden",
    });
    expect(workflowCalls()).toEqual([]);
  });

  it("ignores unknown permission codes from the database", async () => {
    const { ctx } = fakeContext({ permissions: ["superuser" as never] });
    expect(await createDraft(ctx, provider)).toMatchObject({ ok: false, code: "forbidden" });
  });

  it("checks permission before input, so unauthorized callers learn nothing about validation", async () => {
    const { ctx } = fakeContext({ permissions: ["view_admin"] });
    const result = await createDraft(ctx, { table: "providers", values: { slug: "Not A Slug" } });
    expect(result).toMatchObject({ ok: false, code: "forbidden" });
    expect(result).not.toHaveProperty("fieldErrors");
  });
});

describe("admin mutation pipeline: never trusts browser-supplied actor, role or state", () => {
  const forged = [
    { publication_state: "published" },
    { id: RECORD_ID },
    { actor_id: SYNTHETIC_ADMIN_ID },
    { created_by: SYNTHETIC_ADMIN_ID },
    { role: "publisher" },
    { created_at: "2020-01-01T00:00:00Z" },
  ];

  it.each(forged)("rejects %o in draft values", async (extra) => {
    const { ctx, workflowCalls } = fakeContext({ permissions: ["edit_draft"] });
    const result = await createDraft(ctx, {
      table: "providers",
      values: { ...provider.values, ...extra },
    });
    expect(result).toMatchObject({ ok: false, code: "invalid_input" });
    expect(Object.keys((result as { fieldErrors: object }).fieldErrors)).toEqual(
      Object.keys(extra),
    );
    expect(workflowCalls()).toEqual([]);
  });

  it("rejects actor or state fields on workflow steps instead of ignoring them", async () => {
    const { ctx, workflowCalls } = fakeContext({ permissions: ["publish_fact"] });
    const result = await publishRecord(ctx, {
      table: "providers",
      id: RECORD_ID,
      actorId: SYNTHETIC_ADMIN_ID,
      toState: "published",
    });
    expect(result).toMatchObject({ ok: false, code: "invalid_input" });
    expect(workflowCalls()).toEqual([]);
  });

  it("only accepts registered fact tables, never internal tables or other schemas", async () => {
    const { ctx, workflowCalls } = fakeContext({ permissions: ["edit_draft"] });
    for (const table of [
      "audit_log",
      "public.audit_log",
      "admin_identities",
      "auth.users",
      "providers;--",
      7,
    ]) {
      const result = await createDraft(ctx, { table, values: provider.values });
      expect(result).toMatchObject({
        ok: false,
        code: "invalid_input",
        fieldErrors: { table: "Unknown record type." },
      });
    }
    expect(workflowCalls()).toEqual([]);
  });

  it("sends exactly one rpc with the allow-listed values and no actor", async () => {
    const { ctx, workflowCalls } = fakeContext({
      permissions: ["edit_draft"],
      responses: { nfai_admin_create_draft: { data: NEW_ID, error: null } },
    });
    const result = await createDraft(ctx, {
      table: "providers",
      values: {
        slug: " example-provider ",
        name: "Example Provider",
        website_url: "",
        description: "Synthetic.",
      },
    });
    expect(result).toEqual({ ok: true, id: NEW_ID });
    expect(workflowCalls()).toEqual([
      {
        fn: "nfai_admin_create_draft",
        args: {
          p_table: "public.providers",
          p_values: {
            slug: "example-provider",
            name: "Example Provider",
            website_url: null,
            description: "Synthetic.",
          },
        },
      },
    ]);
  });
});

describe("admin mutation pipeline: input validation", () => {
  it("reports field errors for bad values", async () => {
    const { ctx } = fakeContext({ permissions: ["edit_draft"] });
    const result = await createDraft(ctx, {
      table: "providers",
      values: { slug: "Bad Slug", website_url: "javascript:alert(1)", organization_type: "cartel" },
    });
    expect(result).toMatchObject({
      ok: false,
      code: "invalid_input",
      fieldErrors: {
        slug: expect.any(String),
        name: "This field is required.",
        website_url: expect.any(String),
        organization_type: expect.any(String),
      },
    });
  });

  it("refuses URLs with embedded credentials", async () => {
    const { ctx } = fakeContext({ permissions: ["edit_draft"] });
    const result = await createDraft(ctx, {
      table: "providers",
      values: { ...provider.values, website_url: "https://user:pass@example.test/" },
    });
    expect(result).toMatchObject({ ok: false, fieldErrors: { website_url: expect.any(String) } });
  });

  it("requires at least one field on update and a uuid id", async () => {
    const { ctx } = fakeContext({ permissions: ["edit_draft"] });
    expect(await updateDraft(ctx, { table: "providers", id: RECORD_ID, values: {} })).toMatchObject(
      {
        code: "invalid_input",
      },
    );
    expect(
      await updateDraft(ctx, { table: "providers", id: "1 or 1=1", values: { name: "X" } }),
    ).toMatchObject({
      code: "invalid_input",
    });
  });

  it("keeps decimals as exact strings", async () => {
    const { ctx, workflowCalls } = fakeContext({
      permissions: ["edit_draft"],
      responses: { nfai_admin_create_draft: { data: NEW_ID, error: null } },
    });
    await createDraft(ctx, {
      table: "pricing_records",
      values: {
        model_version_id: RECORD_ID,
        deployment_channel_id: RECORD_ID,
        billing_dimension: "input_tokens",
        currency: "USD",
        price_amount: "0.000001",
        unit: "token",
        unit_quantity: 1000000,
        valid_from: "2026-01-01T00:00:00Z",
      },
    });
    const values = workflowCalls()[0]!.args!.p_values as Record<string, unknown>;
    expect(values.price_amount).toBe("0.000001");
    expect(values.unit_quantity).toBe("1000000");
  });

  it("requires reasons for reject and withdraw, and a distinct replacement for supersede", async () => {
    const { ctx, workflowCalls } = fakeContext({
      permissions: ["reject_fact", "withdraw_fact", "supersede_fact"],
    });
    expect(await rejectRecord(ctx, { table: "providers", id: RECORD_ID })).toMatchObject({
      fieldErrors: { reason: "This field is required." },
    });
    expect(
      await withdrawRecord(ctx, { table: "providers", id: RECORD_ID, reason: " " }),
    ).toMatchObject({
      fieldErrors: { reason: "This field is required." },
    });
    expect(
      await supersedeRecord(ctx, {
        table: "providers",
        oldId: RECORD_ID,
        newId: RECORD_ID,
        reason: "Fix.",
      }),
    ).toMatchObject({ fieldErrors: { newId: expect.any(String) } });
    expect(workflowCalls()).toEqual([]);
  });

  it("maps attach-source input to the workflow function arguments", async () => {
    const { ctx, workflowCalls } = fakeContext({
      permissions: ["edit_draft"],
      responses: { nfai_admin_attach_provenance: { data: NEW_ID, error: null } },
    });
    const result = await attachSource(ctx, {
      table: "providers",
      id: RECORD_ID,
      sourceDocumentId: NEW_ID,
      role: "primary",
      locator: "Section 2",
    });
    expect(result).toEqual({ ok: true, id: NEW_ID });
    expect(workflowCalls()[0]).toEqual({
      fn: "nfai_admin_attach_provenance",
      args: {
        p_values: {
          subject_table: "public.providers",
          subject_id: RECORD_ID,
          source_document_id: NEW_ID,
          source_observation_id: null,
          role: "primary",
          locator: "Section 2",
          evidence_note: null,
        },
      },
    });
  });
});

describe("admin error sanitizing", () => {
  const secretish = {
    code: "XX000",
    message:
      'relation "public.audit_log" failed; key=eyJhbGciOiJIUzI1NiJ9.secret; SUPABASE_SERVICE_ROLE_KEY=sk_live_abc',
    details: "select * from auth.users",
    hint: "stack at /srv/app.js:10",
  };

  it("never copies database text into the result", async () => {
    const { ctx, reported } = fakeContext({
      permissions: ["publish_fact"],
      responses: { nfai_admin_publish: { data: null, error: secretish } },
    });
    const result = await publishRecord(ctx, { table: "providers", id: RECORD_ID });
    expect(result).toEqual({
      ok: false,
      code: "internal",
      message: "Something went wrong. Please try again later.",
    });
    const serialized = JSON.stringify(result);
    for (const leak of [
      "audit_log",
      "eyJ",
      "SERVICE_ROLE",
      "sk_live",
      "auth.users",
      "stack",
      "XX000",
    ]) {
      expect(serialized).not.toContain(leak);
    }
    expect(reported).toHaveLength(1);
  });

  it("treats thrown non-database errors as internal", () => {
    expect(sanitizeError(new Error("ECONNREFUSED 10.0.0.1:5432 password=hunter2"))).toEqual({
      ok: false,
      code: "internal",
      message: "Something went wrong. Please try again later.",
    });
  });

  it.each([
    ["NFA01", "forbidden"],
    ["NFA02", "account_disabled"],
    ["NFA03", "forbidden"],
    ["NFA04", "separation_of_duties"],
    ["NFA05", "invalid_state"],
    ["42501", "forbidden"],
    ["P0002", "not_found"],
    ["22023", "invalid_input"],
    ["23505", "conflict"],
    ["23P01", "conflict"],
    ["23503", "invalid_input"],
  ])("maps SQLSTATE %s to %s", (code, expected) => {
    expect(sanitizeError({ code, message: "anything secret" })).toMatchObject({ code: expected });
    expect(JSON.stringify(sanitizeError({ code, message: "anything secret" }))).not.toContain(
      "secret",
    );
  });

  it("recognises the provenance gate and maps named column checks to allowed fields only", () => {
    expect(
      sanitizeError({
        code: "23514",
        message:
          "public.providers(x) needs an active supporting provenance link to an approved T1-T3 source",
      }),
    ).toMatchObject({ code: "provenance_required" });
    expect(
      sanitizeError(
        { code: "23514", message: "violates", constraint: "providers_slug_check" },
        { table: "public.providers", fields: ["slug", "name"] },
      ),
    ).toMatchObject({ code: "invalid_input", fieldErrors: { slug: "Invalid value." } });
    expect(
      sanitizeError(
        { code: "23514", message: "violates", constraint: "providers_internal_secret_check" },
        { table: "public.providers", fields: ["slug"] },
      ),
    ).toEqual({ ok: false, code: "invalid_input", message: "Some fields are missing or invalid." });
  });
});
