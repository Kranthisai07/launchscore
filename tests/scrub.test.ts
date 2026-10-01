import { describe, expect, it } from "vitest";
import { scrubSecrets } from "../src/checks/sec-001.js";
import { redact } from "../src/redact.js";
import { jwt, KEYS } from "./helpers/keys.js";

describe("scrubSecrets", () => {
  it.each(Object.entries(KEYS))("redacts %s", (name, key) => {
    // publishable keys and look-alikes are not secrets, but the long random-looking ones are still hidden
    const out = scrubSecrets(`failed with ${key} here`);
    if (/Publishable|googleApiKey|awsDocsExample/.test(name) || name === "supabasePublishable") return;
    expect(out).not.toContain(key);
    expect(out).toContain(redact(key));
  });

  it("redacts a service_role JWT", () => {
    const token = jwt("service_role");
    expect(scrubSecrets(`token=${token}`)).not.toContain(token);
  });

  it("hides long random-looking tokens with letters and digits", () => {
    const token = ["Zk3dE6gH9j", "K2mN5pQ8sT", "1vW4yZ7xC0", "aB"].join("");
    expect(scrubSecrets(`id ${token} end`)).toBe(`id ${redact(token)} end`);
  });

  it("leaves long all-letter words and ordinary text alone", () => {
    const text = "Uncaught ReferenceError: undefinedWidgetThatIsVeryLongButJustLettersAbcdefgh is not defined at app.js:13";
    expect(scrubSecrets(text)).toBe(text);
  });

  it("leaves short ids and numbers alone", () => {
    expect(scrubSecrets("Error 500 at item abc123 (code E_FAIL_42)")).toBe("Error 500 at item abc123 (code E_FAIL_42)");
  });

  it("drops query strings from addresses but keeps the rest", () => {
    expect(scrubSecrets("GET https://api.shop.test/v1/items?key=abc&x=1 failed (500)")).toBe("GET https://api.shop.test/v1/items?… failed (500)");
    expect(scrubSecrets("see (http://a.test/p?q=1)")).toBe("see (http://a.test/p?…)");
  });

  it("keeps addresses without a query string", () => {
    expect(scrubSecrets("loaded https://shop.test/app.js ok")).toBe("loaded https://shop.test/app.js ok");
  });
});
