import fs from "node:fs";
import vm from "node:vm";
import crypto from "node:crypto";

const dataFile = "assets/js/data.js";
const outputFile = process.env.GITHUB_OUTPUT;
const issueNumber = String(process.env.ISSUE_NUMBER || "").trim();
const issueTitle = String(process.env.ISSUE_TITLE || "").trim();
const rawBody = String(process.env.ISSUE_BODY || "").replace(/\r\n/g, "\n");
const createdAt = process.env.ISSUE_CREATED_AT || "";

function emit(key, value) {
  const line = `${key}=${String(value).replace(/\r?\n/g, " ")}\n`;
  if (outputFile) fs.appendFileSync(outputFile, line, "utf8");
  else console.log(line.trim());
}

function finish(published, message) {
  emit("published", published ? "true" : "false");
  emit("message", message);
  process.exit(0);
}

if (!issueTitle.startsWith("[评价]")) {
  emit("published", "false");
  emit("message", "");
  process.exit(0);
}

function section(heading) {
  const marker = `### ${heading}`;
  const start = rawBody.indexOf(marker);
  if (start < 0) return "";
  const after = rawBody.slice(start + marker.length);
  const next = after.search(/\n### /);
  return (next < 0 ? after : after.slice(0, next)).trim();
}

try {
  if (!issueNumber) throw new Error("缺少 Issue 编号");
  const companyName = section("评价对象").replace(/\s+/g, " ").trim().slice(0, 100);
  const typeLabel = section("评价类型").trim();
  const ratings = section("三项评分（1–5）");
  const reason = section("具体理由").trim();
  const profile = section("岗位 / 任期 / 城市");
  const author = section("展示名称").trim().slice(0, 40) || "匿名";

  const typeMap = { "好评": "good", "中立": "neutral", "差评": "bad" };
  const type = typeMap[typeLabel];
  const rating = label => {
    const match = ratings.match(new RegExp(`-\\s*${label}\\s*[：:]\\s*([1-5])`));
    return match ? Number(match[1]) : null;
  };
  const salary = rating("薪资待遇");
  const atmosphere = rating("工作氛围");
  const growth = rating("个人收获");

  if (!companyName) throw new Error("缺少公司名称");
  if (!type) throw new Error("评价类型无效");
  if (!salary || !atmosphere || !growth) throw new Error("三项评分必须是 1–5 分");
  if (!reason) throw new Error("缺少具体理由");

  const profileParts = profile ? profile.split(/\s+\/\s+/).map(part => part.trim()) : [];
  const role = profileParts[0] && profileParts[0] !== "未填写" ? profileParts[0] : "未填写";
  const tenure = profileParts[1] && profileParts[1] !== "未填写" ? profileParts[1] : "未填写";
  const location = profileParts[2] && profileParts[2] !== "未填写" ? profileParts[2] : "未填写";

  const ctx = { window: {} };
  vm.runInNewContext(fs.readFileSync(dataFile, "utf8"), ctx, { timeout: 1000 });
  const data = ctx.window.RB_DATA;
  if (!data || !Array.isArray(data.companies) || !Array.isArray(data.reviews)) {
    throw new Error("无法读取 data.js");
  }

  const id = `issue-${issueNumber}`;
  if (data.reviews.some(review => review.id === id)) {
    finish(false, "这条 Issue 已经发布过，没有重复写入。");
  }

  const normalize = value => String(value).toLowerCase().replace(/\s+/g, "").replace(/[·（）()，,。.]/g, "");
  let company = data.companies.find(item => normalize(item.name) === normalize(companyName));
  let createdCompany = false;
  if (!company) {
    const suffix = crypto.createHash("sha1").update(companyName).digest("hex").slice(0, 10);
    let companyId = `custom-${suffix}`;
    while (data.companies.some(item => item.id === companyId)) companyId += "x";
    company = {
      id: companyId,
      name: companyName,
      en: "",
      sector: "其他",
      city: location !== "未填写" ? location : "未标注",
      stage: "",
      tags: [],
      website: "",
      description: "由社区投稿新增的公司条目。",
      demo: false
    };
    data.companies.push(company);
    createdCompany = true;
  }

  let date = new Date().toISOString().slice(0, 10);
  if (createdAt) {
    const parsed = new Date(createdAt);
    if (!Number.isNaN(parsed.getTime())) date = parsed.toISOString().slice(0, 10);
  }

  data.reviews.push({
    id,
    companyId: company.id,
    type,
    salary,
    atmosphere,
    growth,
    reason,
    role,
    tenure,
    location: location === "未填写" ? "未填写" : location,
    date,
    author,
    source: "github-issue"
  });
  data.updated = new Date().toISOString().slice(0, 7).replace("-", ".");

  const serialized = `window.RB_DATA = (() => {
  const companies = ${JSON.stringify(data.companies, null, 2)};
  const reviews = ${JSON.stringify(data.reviews, null, 2)};
  return { companies, reviews, updated: ${JSON.stringify(data.updated)} };
})();
`;
  fs.writeFileSync(dataFile, serialized, "utf8");
  const prefix = createdCompany ? "已新增公司并发布" : "已发布";
  finish(true, `${prefix}：${company.name} · ${typeLabel}。页面通常会在 1–2 分钟内更新。`);
} catch (error) {
  finish(false, `自动发布失败：${error.message}`);
}
