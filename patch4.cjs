const fs = require("fs");
let s = fs.readFileSync("tests/html-report.test.ts", "utf8");
const rep = (a, b) => { if (!s.includes(a)) throw new Error("missing: " + a); s = s.replace(a, b); };
rep(`    expect(row).toContain('aria-label="Security: 50 out of 100"'); // critical 60 + medium 15 = 75 off: 25, see below`, `    expect(row).toContain('aria-label="Security: 25 out of 100"'); // 100 - critical 60 - medium 15
    expect(row.match(/<i class="on">/g)).toHaveLength(5); // 25 of 100 fills 5 of 20 segments
    expect(row.match(/<i/g)).toHaveLength(20);`);
rep("    expect(html).not.toMatch(/onerror=alert/i === undefined ? /$^/ : /<[^>]*\sonerror=/i);", "    expect(html).not.toMatch(/<[^>]*\sonerror=/i);");
fs.writeFileSync("tests/html-report.test.ts", s);
