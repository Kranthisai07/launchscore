import { describe, expect, it } from "vitest";
import { anchors, linkRels, metaTags, withoutHidden } from "../src/html.js";

describe("metaTags", () => {
  it("reads name, property and content in any attribute order and quote style", () => {
    const html =
      '<meta name="Description" content="A &amp; B"><meta content=\'x\' property="OG:Title"><meta charset="utf-8"><META NAME=robots CONTENT=noindex>';
    expect(metaTags(html)).toEqual([
      { name: "description", property: undefined, content: "A & B" },
      { name: undefined, property: "og:title", content: "x" },
      { name: undefined, property: undefined, content: "" },
      { name: "robots", property: undefined, content: "noindex" },
    ]);
  });

  it("collapses whitespace in content", () => {
    expect(metaTags('<meta name="a" content="  one \n two  ">')[0].content).toBe("one two");
  });
});

describe("linkRels", () => {
  it("splits rel tokens and trims href", () => {
    expect(linkRels('<link rel="Canonical Alternate" href=" /a ">')).toEqual([{ rels: ["canonical", "alternate"], href: "/a" }]);
  });

  it("tolerates missing attributes", () => {
    expect(linkRels("<link>")).toEqual([{ rels: [], href: "" }]);
  });
});

describe("withoutHidden", () => {
  it("removes comments, scripts, styles, noscript and templates but keeps content", () => {
    const html =
      "<!-- c --><h1>Keep</h1><script>var a='<h1>x</h1>'</script><style>h1{}</style><noscript><h1>n</h1></noscript><template><h1>t</h1></template><p>Also</p>";
    const out = withoutHidden(html);
    expect(out).toContain("<h1>Keep</h1>");
    expect(out).toContain("<p>Also</p>");
    expect(out.match(/<h1/g)).toHaveLength(1);
  });
});

describe("anchors", () => {
  it("returns href and visible text, tags and entities handled", () => {
    const html = '<a href="/privacy">Privacy <b>policy</b></a><A HREF=\'/t\'>Terms &amp; Conditions</A><a name="x">no href</a>';
    expect(anchors(html)).toEqual([
      { href: "/privacy", text: "Privacy policy" },
      { href: "/t", text: "Terms & Conditions" },
    ]);
  });

  it("ignores links in comments, scripts, styles, noscript and templates", () => {
    const html = '<!-- <a href="/a">a</a> --><script>"<a href=\'/b\'>b</a>"</script><noscript><a href="/c">c</a></noscript><template><a href="/d">d</a></template><a href="/ok">ok</a>';
    expect(anchors(html)).toEqual([{ href: "/ok", text: "ok" }]);
  });
});
