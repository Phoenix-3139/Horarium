// Pure-helper tests for the modal component. The DOM-touching show*
// functions are exercised in the manual walkthrough — happy DOM tests
// would need a jsdom setup which the project deliberately avoids.

import { describe, it, expect } from "vitest";
import { buildModalHtml, buildPromptHtml } from "./modal.js";

describe("buildModalHtml", () => {
  it("includes title, body paragraphs, and buttons in order", () => {
    const html = buildModalHtml({
      title: "Stage closed section?",
      body: "Section is closed.\n\nYou can stage for planning.",
      buttons: [
        { label: "Cancel", style: "secondary" },
        { label: "Stage anyway", style: "primary" },
      ],
    });
    expect(html).toMatch(/Stage closed section\?/);
    expect(html).toMatch(/Section is closed\./);
    expect(html).toMatch(/You can stage for planning\./);
    // Two distinct paragraphs (split on \n\n).
    expect((html.match(/<p>/g) || []).length).toBe(2);
    // Buttons in order with correct styles.
    const btnIdxCancel = html.indexOf("Cancel");
    const btnIdxStage = html.indexOf("Stage anyway");
    expect(btnIdxCancel).toBeLessThan(btnIdxStage);
    expect(html).toMatch(/mdl-btn-secondary[^>]*data-mdl-button="0"/);
    expect(html).toMatch(/mdl-btn-primary[^>]*data-mdl-button="1"/);
  });
  it("escapes HTML in title and body", () => {
    const html = buildModalHtml({
      title: "<script>alert(1)</script>",
      body: "Tag <script>alert(1)</script> here.",
      buttons: [],
    });
    // Should NOT contain a literal opening script tag.
    expect(html).not.toMatch(/<script>/);
    expect(html).toMatch(/&lt;script&gt;/);
  });
  it("supports HTML body via {html: '...'} when caller needs em / strong", () => {
    const html = buildModalHtml({
      title: "T",
      body: { html: "<p>Has <em>emphasis</em>.</p>" },
      buttons: [],
    });
    expect(html).toMatch(/<em>emphasis<\/em>/);
  });
  it("danger button gets the danger class", () => {
    const html = buildModalHtml({
      title: "Delete?",
      buttons: [{ label: "Delete", style: "danger" }],
    });
    expect(html).toMatch(/mdl-btn-danger/);
  });
});

describe("buildPromptHtml", () => {
  it("renders an input with default value and placeholder", () => {
    const html = buildPromptHtml({
      title: "Name your plan",
      defaultValue: "Plan B",
      placeholder: "e.g. lighter load",
      confirmLabel: "Create",
    });
    expect(html).toMatch(/Name your plan/);
    expect(html).toMatch(/value="Plan B"/);
    expect(html).toMatch(/placeholder="e\.g\. lighter load"/);
    expect(html).toMatch(/Create/);
  });
  it("escapes default value to prevent attribute injection", () => {
    const html = buildPromptHtml({
      title: "T",
      defaultValue: '" autofocus onfocus="alert(1)" x="',
    });
    // The text "onfocus=" still appears (as harmless attribute-value
    // text), but no UNESCAPED quote breaks out of the value="..."
    // wrapping. The escape converts user-supplied " into &quot;, so
    // any onfocus="..." in the input becomes onfocus=&quot;...&quot;
    // which is just data inside the value attribute, not a new tag.
    expect(html).not.toMatch(/onfocus="/); // unescaped quote → would be an injection
    expect(html).toMatch(/onfocus=&quot;/); // escaped form is fine
    expect(html).toMatch(/&quot;/);
  });
  it("body is optional", () => {
    const html = buildPromptHtml({ title: "Ask" });
    // When no body, no .mdl-body div should appear.
    expect(html).not.toMatch(/class="mdl-body"/);
  });
});
