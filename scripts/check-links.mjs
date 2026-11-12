import vm from "node:vm";
import fs from "node:fs";

const source = fs.readFileSync("assets/js/data.js", "utf8");
const context = { window: {} };
vm.runInNewContext(source, context, { filename: "data.js" });
const companies = context.window.RB_DATA.companies.filter(company => company.website);

const results = await Promise.all(companies.map(async company => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12000);
  try {
    const response = await fetch(company.website, {
      redirect: "follow",
      signal: controller.signal,
      headers: { "User-Agent": "Mozilla/5.0 EmbodiedRankLinkCheck" }
    });
    return { company: company.name, url: company.website, status: response.status };
  } catch (error) {
    return { company: company.name, url: company.website, status: error.name === "AbortError" ? "TIMEOUT" : "ERR" };
  } finally {
    clearTimeout(timer);
  }
}));

for (const result of results) {
  console.log(`${String(result.status).padEnd(7)} ${result.company.padEnd(22)} ${result.url}`);
}
console.log(`\n${results.filter(result => result.status === 200).length}/${results.length} reachable (200).`);
