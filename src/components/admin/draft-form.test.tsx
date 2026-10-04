import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { formValues, validateFields, type FormFieldDef } from "@/components/admin/draft-fields";
import { DraftForm } from "@/components/admin/draft-form";
import type { ActionResult } from "@/components/admin/types";

const fields: FormFieldDef[] = [
  { name: "slug", label: "Slug", kind: "slug", required: true },
  { name: "name", label: "Name", kind: "text", required: true },
  { name: "website_url", label: "Website URL", kind: "url" },
  {
    name: "organization_type",
    label: "Organization type",
    kind: "select",
    options: [{ value: "company", label: "Company" }],
  },
];

function data(entries: Record<string, string | string[]>): FormData {
  const formData = new FormData();
  for (const [key, value] of Object.entries(entries)) {
    for (const item of Array.isArray(value) ? value : [value]) formData.append(key, item);
  }
  return formData;
}

describe("validateFields", () => {
  it("reports missing required fields and bad formats", () => {
    expect(validateFields(fields, data({ slug: "Not A Slug", website_url: "ftp://x" }))).toEqual({
      slug: "Use lowercase letters, digits and single hyphens.",
      name: "This field is required.",
      website_url: "Enter an http or https address.",
    });
  });

  it("refuses a choice that is not offered", () => {
    expect(
      validateFields(
        fields,
        data({ slug: "test-provider-labs", name: "Test Provider Labs", organization_type: "x" }),
      ),
    ).toEqual({ organization_type: "Choose one of the listed options." });
  });

  it("accepts a valid submission", () => {
    expect(
      validateFields(fields, data({ slug: "test-provider-labs", name: "Test Provider Labs" })),
    ).toEqual({});
  });
});

describe("formValues", () => {
  const typed: FormFieldDef[] = [
    { name: "higher_is_better", label: "Higher is better", kind: "boolean" },
    { name: "valid_from", label: "Valid from", kind: "datetime" },
    { name: "tool_access", label: "Tool access", kind: "multi" },
    { name: "allowed_values", label: "Allowed values", kind: "lines" },
    { name: "notes", label: "Notes", kind: "textarea" },
  ];

  it("converts form fields and drops empty optional ones", () => {
    expect(
      formValues(
        typed,
        data({
          higher_is_better: "false",
          valid_from: "2026-01-02T03:04",
          tool_access: ["code_execution", "web_search"],
          allowed_values: "alpha\n\n beta ",
          notes: "  ",
          unexpected: "ignored",
        }),
      ),
    ).toEqual({
      higher_is_better: false,
      valid_from: "2026-01-02T03:04:00Z",
      tool_access: ["code_execution", "web_search"],
      allowed_values: ["alpha", "beta"],
    });
  });

  it("clears emptied optional fields when editing", () => {
    expect(formValues(typed, data({}), { clearEmpty: true })).toEqual({
      higher_is_better: null,
      valid_from: null,
      tool_access: null,
      allowed_values: null,
      notes: null,
    });
  });
});

describe("DraftForm", () => {
  function setup(result: ActionResult = { status: "success", message: "Saved." }) {
    const action = vi.fn<(previous: ActionResult, formData: FormData) => Promise<ActionResult>>(
      async () => result,
    );
    render(
      <DraftForm
        groups={[{ legend: "Provider", fields }]}
        action={action}
        submitLabel="Save draft"
        hidden={{ table: "providers" }}
      />,
    );
    return action;
  }

  it("labels every field and marks required ones", () => {
    setup();
    expect(screen.getByRole("group", { name: "Provider" })).toBeInTheDocument();
    expect(screen.getByLabelText(/^Slug/)).toHaveAttribute("aria-required", "true");
    expect(screen.getByLabelText(/^Website URL/)).not.toHaveAttribute("aria-required");
    expect(screen.getByLabelText(/^Website URL/)).toHaveAccessibleName(/optional/);
  });

  it("shows an error summary linked to each invalid field and does not submit", async () => {
    const user = userEvent.setup();
    const action = setup();
    await user.type(screen.getByLabelText(/^Slug/), "Bad Slug");
    await user.click(screen.getByRole("button", { name: "Save draft" }));

    expect(action).not.toHaveBeenCalled();
    const summary = screen.getByRole("alert");
    expect(summary).toHaveFocus();
    expect(summary).toHaveTextContent("Some fields need attention.");
    expect(screen.getByRole("link", { name: /Name: This field is required/ })).toHaveAttribute(
      "href",
      "#field-name",
    );
    const slug = screen.getByLabelText(/^Slug/);
    expect(slug).toHaveAttribute("aria-invalid", "true");
    expect(slug).toHaveAccessibleDescription(/lowercase letters/);
  });

  it("sends valid input with its hidden table", async () => {
    const user = userEvent.setup();
    const action = setup();
    await user.type(screen.getByLabelText(/^Slug/), "test-provider-labs");
    await user.type(screen.getByLabelText(/^Name/), "Test Provider Labs");
    await user.click(screen.getByRole("button", { name: "Save draft" }));

    const formData = action.mock.calls[0]?.[1] as FormData;
    expect(formData.get("table")).toBe("providers");
    expect(formData.get("slug")).toBe("test-provider-labs");
    expect(await screen.findByRole("status")).toHaveTextContent("Saved.");
  });

  it("shows server field errors and keeps what was typed", async () => {
    const user = userEvent.setup();
    setup({
      status: "error",
      message: "The change conflicts with an existing record or a concurrent change.",
      fieldErrors: { slug: "This slug is already used." },
    });
    await user.type(screen.getByLabelText(/^Slug/), "test-provider-labs");
    await user.type(screen.getByLabelText(/^Name/), "Test Provider Labs");
    await user.click(screen.getByRole("button", { name: "Save draft" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("conflicts with an existing record");
    expect(
      screen.getByRole("link", { name: /Slug: This slug is already used/ }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText(/^Slug/)).toHaveValue("test-provider-labs");
  });
});
