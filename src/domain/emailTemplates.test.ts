import { describe, expect, it } from "vitest";
import { fill, SAMPLE, TEMPLATES, templateDef, validateTemplate } from "@/domain/emailTemplates";

describe("email templates", () => {
  it("every default is valid, uses only its own placeholders and fills completely from the sample", () => {
    for (const t of TEMPLATES) {
      expect(validateTemplate(t, t), t.id).toEqual({});
      expect(fill(t.subject, SAMPLE), t.id).not.toContain("{{");
      expect(fill(t.body, SAMPLE), t.id).not.toContain("{{");
    }
  });
  it("fills a placeholder and leaves an unknown one visible", () => {
    expect(fill("Hi {{first_name}} {{nope}}", { first_name: "Priya" })).toBe("Hi Priya {{nope}}");
    expect(fill(templateDef("renewal_reminder")!.subject, SAMPLE)).toBe("Your Monthly ends on 17 Dec 2026");
  });
  it("says what is wrong in words", () => {
    const d = templateDef("payment_reminder")!;
    expect(validateTemplate(d, { subject: "", body: "x" }).subject).toBe("Write a subject.");
    expect(validateTemplate(d, { subject: "x", body: " " }).body).toBe("Write the email.");
    expect(validateTemplate(d, { subject: "x".repeat(121), body: "x" }).subject).toBe("Use 120 characters or fewer.");
    expect(validateTemplate(d, { subject: "Hi {{plan}}", body: "x" }).subject).toBe("{{plan}} isn’t available in this email. Use one of the placeholders listed.");
    expect(validateTemplate(d, { subject: "x", body: "Hi {{first_name" }).body).toBe("A placeholder is missing its closing braces. Write it like {{first_name}}.");
    expect(validateTemplate(d, { subject: "x", body: "Hi {{first_name}}" })).toEqual({});
  });
});
