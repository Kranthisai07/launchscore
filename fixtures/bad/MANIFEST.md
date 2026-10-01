# fixtures/bad: planted issues

One planted issue per passive v1 finding check. `fixtures/markers.ts` holds the machine-readable marker for each row, and `tests/fixtures.test.ts` proves every marker is present here and absent from `fixtures/good`. Fake keys are assembled at serve time from `fixtures/secrets.ts`.

Not planted here: SEC-004 (localhost has no TLS, covered by unit tests in M4), SEC-006 and SEC-007 (active checks, deferred to M12).

| Check ID | What was planted | File or route |
|---|---|---|
| SEC-001 | Fake `sk_live_…` Stripe key and a Supabase `service_role` JWT. The `pk_test_` key and anon JWT beside them are decoys that must not be flagged. | `site/app.js` (`/app.js`) |
| SEC-002 | Source map served and referenced from the bundle. | `site/app.js.map`, `sourceMappingURL` in `site/app.js` |
| SEC-003 | No security headers at all (good sends all five). | `headers.ts` |
| SEO-001 | No `<title>` and no meta description. | `site/index.html` |
| SEO-002 | No Open Graph or Twitter card tags. | `site/index.html` |
| SEO-003 | `robots.txt` and `sitemap.xml` do not exist (404). | `/robots.txt`, `/sitemap.xml` |
| SEO-004 | `<meta name="robots" content="noindex, nofollow">`. | `site/index.html` |
| SEO-005 | Two `h1` elements and no canonical link. | `site/index.html` |
| A11Y-001 | Image without `alt`, low-contrast text, input without a label. | `site/index.html`, `site/style.css` (`.muted`) |
| PERF-001 | About 1.5 MB script loaded without `defer` or `async`, and an oversized image. | `/big.js` (`site/big.js`), `/hero.svg` (`site/hero.svg`) |
| HYG-001 | No privacy policy link. | `site/index.html` |
| HYG-002 | No terms link. | `site/index.html` |
| HYG-003 | "Lorem ipsum", "Your Company", "John Doe", `test@example.com`. | `site/index.html` |
| HYG-004 | Default framework favicon (`vite.svg`). | `site/index.html`, `site/vite.svg` |
| HYG-005 | Script calls an undefined object on load, which logs a console error. | `site/app.js` |
| HYG-006 | Link to an internal page that does not exist. | `site/index.html` (`/missing-page`) |

## Detections (not findings)

SEC-005 is a detection, not a planted issue. It goes in the report's `detected` array, is never scored, and is present in both fixtures, so it is tested separately from the table above.

| Check ID | What is present | File or route |
|---|---|---|
| SEC-005 | Supabase project URL (`https://fakeproject.supabase.co`) in the bundle, beside the anon JWT. | `site/app.js` (also in `fixtures/good`) |
