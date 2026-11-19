(() => {
  "use strict";

  const CFG = window.RB_CONFIG || {};
  const staticCompanies = (window.RB_DATA && window.RB_DATA.companies) || [];
  const staticReviews = (window.RB_DATA && window.RB_DATA.reviews) || [];
  const DEMO_MODE = CFG.demoMode !== false;
  const REPO = (CFG.repo || "").replace(/^\/|\/$/g, "");
  const REPO_URL = REPO ? `https://github.com/${REPO}` : "";
  const BRANCH = CFG.branch || "main";
  const SUPABASE = CFG.supabase || {};
  const SUPABASE_URL = String(SUPABASE.url || "").replace(/\/$/, "");
  const SUPABASE_KEY = String(SUPABASE.anonKey || "");
  const SUPABASE_TABLE = String(SUPABASE.table || "reviews");
  const SUPABASE_ENABLED = Boolean(SUPABASE_URL && SUPABASE_KEY);
  const main = document.getElementById("main");
  const toastRegion = document.getElementById("toast-region");
  let toastTimer = null;
  let companies = staticCompanies.slice();
  let reviews = staticReviews.slice();
  let visibleReviews = [];
  let companyById = new Map();
  let reviewsByCompany = new Map();
  let supabaseReady = false;

  function rebuildIndexes() {
    visibleReviews = reviews.filter(review => DEMO_MODE || !review.demo);
    companyById = new Map(companies.map(company => [company.id, company]));
    reviewsByCompany = new Map();
    visibleReviews.forEach(review => {
      if (!reviewsByCompany.has(review.companyId)) reviewsByCompany.set(review.companyId, []);
      reviewsByCompany.get(review.companyId).push(review);
    });
  }

  rebuildIndexes();

  const esc = value => String(value ?? "").replace(/[&<>"']/g, char => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  }[char]));

  const pad = value => String(value).padStart(2, "0");
  const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
  const average = list => list.length ? list.reduce((sum, item) => sum + item, 0) / list.length : 0;
  const scoreText = value => value ? value.toFixed(1) : "—";

  function reviewsFor(companyId) {
    return (reviewsByCompany.get(companyId) || []).slice().sort((a, b) => String(b.date).localeCompare(String(a.date)));
  }

  function companyStats(companyId) {
    const list = reviewsFor(companyId);
    const salary = average(list.map(review => Number(review.salary) || 0));
    const atmosphere = average(list.map(review => Number(review.atmosphere) || 0));
    const growth = average(list.map(review => Number(review.growth) || 0));
    const overall = list.length ? (salary + atmosphere + growth) / 3 : 0;
    const good = list.filter(review => review.type === "good").length;
    const bad = list.filter(review => review.type === "bad").length;
    const neutral = list.filter(review => review.type === "neutral").length;
    const verdict = !list.length ? "pending" : overall >= 4 ? "red" : overall <= 2.5 ? "black" : "watch";
    return { list, count: list.length, salary, atmosphere, growth, overall, good, bad, neutral, verdict };
  }

  function verdictMeta(verdict) {
    return {
      red: { label: "红榜", className: "is-red", note: "综合 ≥ 4.0" },
      black: { label: "黑榜", className: "is-black", note: "综合 ≤ 2.5" },
      watch: { label: "观察中", className: "is-watch", note: "样本不足或褒贬并存" },
      pending: { label: "待评价", className: "is-pending", note: "还没有第一份评价" }
    }[verdict] || { label: "待评价", className: "is-pending", note: "" };
  }

  function typeMeta(type) {
    return {
      good: { label: "好评", className: "is-good" },
      bad: { label: "差评", className: "is-bad" },
      neutral: { label: "中立", className: "is-neutral" }
    }[type] || { label: "评价", className: "is-neutral" };
  }

  function scoreRow(label, value) {
    return `<div class="score-row"><span>${esc(label)}</span><div class="score-track"><i style="width:${clamp(value / 5 * 100, 0, 100)}%"></i></div><b>${value ? scoreText(value) : "—"}</b></div>`;
  }

  function companyVerdictChip(verdict) {
    const meta = verdictMeta(verdict);
    return `<span class="verdict ${meta.className}">${meta.label}</span>`;
  }

  function isLocalPreview() {
    const host = window.location.hostname;
    return window.location.protocol === "file:" || ["localhost", "127.0.0.1", "0.0.0.0", "[::1]"].includes(host);
  }

  function issueUrl(title, body) {
    if (!REPO_URL) return "";
    return `${REPO_URL}/issues/new?title=${encodeURIComponent(title)}&body=${encodeURIComponent(body)}`;
  }

  function showToast(message) {
    if (!toastRegion) return;
    toastRegion.innerHTML = `<div class="toast"><span class="toast-dot"></span><span>${esc(message)}</span></div>`;
    toastRegion.classList.add("is-visible");
    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => {
      toastRegion.classList.remove("is-visible");
      window.setTimeout(() => { toastRegion.innerHTML = ""; }, 240);
    }, 3400);
  }

  async function copyText(text, message = "已复制到剪贴板") {
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(text);
      } else {
        const area = document.createElement("textarea");
        area.value = text;
        area.setAttribute("readonly", "");
        area.style.position = "fixed";
        area.style.left = "-9999px";
        document.body.appendChild(area);
        area.select();
        document.execCommand("copy");
        area.remove();
      }
      showToast(message);
      return true;
    } catch (_) {
      showToast("复制失败，请手动选择文本");
      return false;
    }
  }

  function allRealCompanies() {
    return companies.filter(company => !company.demo);
  }

  function normalizeCompanyName(value) {
    return String(value || "").toLowerCase().replace(/\s+/g, "").replace(/[·（）()，,。.]/g, "");
  }

  function remoteCompanyId(name) {
    let hash = 0;
    for (const char of String(name)) hash = (hash * 31 + char.codePointAt(0)) >>> 0;
    return `remote-${hash.toString(36)}`;
  }

  function supabaseHeaders(extra = {}) {
    const headers = { apikey: SUPABASE_KEY };
    if (SUPABASE_KEY.startsWith("eyJ")) headers.Authorization = `Bearer ${SUPABASE_KEY}`;
    return { ...headers, ...extra };
  }

  async function loadSupabaseReviews() {
    if (!SUPABASE_ENABLED) {
      supabaseReady = false;
      return false;
    }
    try {
      const response = await fetch(
        `${SUPABASE_URL}/rest/v1/${SUPABASE_TABLE}?select=*&order=created_at.desc`,
        { headers: supabaseHeaders({ Accept: "application/json" }) }
      );
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const rows = await response.json();
      const byName = new Map(staticCompanies.map(company => [normalizeCompanyName(company.name), company]));
      const remoteCompanies = [];
      const remoteReviews = [];
      rows.forEach(row => {
        if (String(row.author || "") === "__qa_dryrun__") return;
        const companyName = String(row.company_name || "").trim();
        const type = ["good", "neutral", "bad"].includes(row.type) ? row.type : null;
        const salary = Number(row.salary);
        const atmosphere = Number(row.atmosphere);
        const growth = Number(row.growth);
        if (!companyName || !type || ![salary, atmosphere, growth].every(value => value >= 1 && value <= 5)) return;
        const normalizedName = normalizeCompanyName(companyName);
        let company = byName.get(normalizedName);
        if (!company) {
          company = {
            id: remoteCompanyId(companyName),
            name: companyName,
            en: "",
            sector: "其他",
            city: row.location && row.location !== "未填写" ? row.location : "未标注",
            stage: "",
            tags: [],
            website: "",
            description: "由社区评价自动生成的公司条目。",
            demo: false
          };
          byName.set(normalizedName, company);
          remoteCompanies.push(company);
        }
        remoteReviews.push({
          id: `sb-${row.id}`,
          companyId: company.id,
          type,
          salary,
          atmosphere,
          growth,
          reason: String(row.reason || ""),
          role: row.role || "未填写",
          tenure: row.tenure || "未填写",
          location: row.location || "未填写",
          date: String(row.created_at || "").slice(0, 10),
          author: row.author || "匿名",
          source: "supabase"
        });
      });
      companies = staticCompanies.concat(remoteCompanies);
      reviews = staticReviews.concat(remoteReviews);
      rebuildIndexes();
      supabaseReady = true;
      return true;
    } catch (error) {
      console.warn("Supabase reviews unavailable:", error);
      companies = staticCompanies.slice();
      reviews = staticReviews.slice();
      rebuildIndexes();
      supabaseReady = false;
      return false;
    }
  }

  function reviewPayload(form) {
    const data = new FormData(form);
    const value = key => String(data.get(key) || "").trim();
    return {
      company_name: value("companyName"),
      type: value("type"),
      salary: Number(value("salary")),
      atmosphere: Number(value("atmosphere")),
      growth: Number(value("growth")),
      reason: value("reason"),
      role: value("role") || null,
      tenure: value("tenure") || null,
      location: value("location") || null,
      author: value("author") || "匿名"
    };
  }

  function demoBanner() {
    if (!DEMO_MODE) return "";
    const demoCount = companies.filter(company => company.demo).length;
    return `<div class="demo-banner wrap">
      <span class="demo-mark">DEMO</span>
      <p>当前包含 ${demoCount} 家虚构示例公司与演示评价，仅用于展示、测试页面，不代表任何真实雇主。真实公司评价从零开始收集。</p>
    </div>`;
  }

  /* --------------------------------------------------------------- home */

  function renderHome() {
    const ranked = companies.filter(company => companyStats(company.id).count > 0);
    const redCompanies = ranked
      .filter(company => companyStats(company.id).verdict === "red")
      .sort((a, b) => companyStats(b.id).overall - companyStats(a.id).overall);
    const blackCompanies = ranked
      .filter(company => companyStats(company.id).verdict === "black")
      .sort((a, b) => companyStats(a.id).overall - companyStats(b.id).overall);
    return `
      <div class="view home-view">
        <section class="hero hero--simple wrap">
          <div class="hero-copy">
            <p class="eyebrow"><span class="eyebrow-dot"></span>ANONYMOUS EXPERIENCE / PUBLIC REASONING</p>
            <h1>具身<br><em>红黑榜</em></h1>
            <p class="hero-lede">薪资待遇、工作氛围、个人收获，三项 5 分制。<br>好评与差评都必须给出理由。这里不替公司下结论，只把真实经历摆上桌。</p>
            <div class="hero-actions">
              <a class="button button--red" href="#/submit">提交一条评价 <span>↗</span></a>
            </div>
            <p class="hero-note">匿名投稿 · 自动发布 · 事后可更正或撤下</p>
          </div>
        </section>

        <section class="home-search wrap" role="search" aria-label="搜索公司">
          <div class="home-search-box">
            <span class="home-search-label">SEARCH / COMPANY</span>
            <div class="home-search-field">
              <i aria-hidden="true">⌕</i>
              <input id="home-search-input" type="search" placeholder="搜索公司、城市或方向" autocomplete="off" aria-label="搜索公司、城市或方向">
              <span id="home-search-count" aria-live="polite"></span>
            </div>
          </div>
        </section>

        <section class="section wrap search-results" id="home-search-results" hidden></section>

        <div id="ranked-lists">
        <section class="section list-section list-section--red wrap" id="red">
          <div class="section-head">
            <div>
              <p class="eyebrow">RED LIST / ${pad(redCompanies.length)} COMPANIES</p>
              <h2>红榜<span>。</span></h2>
            </div>
            <p class="section-aside">综合评分 ≥ 4.0 的公司。点开卡片，查看完整好评与差评原文。</p>
          </div>
          ${redCompanies.length
            ? `<div class="company-list">${redCompanies.map((company, index) => companyCard(company, index + 1)).join("")}</div>`
            : `<div class="empty-state"><span>—</span><h3>红榜暂时为空。</h3><p>等第一份足够具体的评价。</p></div>`}
        </section>

        <section class="section list-section list-section--black wrap" id="black">
          <div class="section-head">
            <div>
              <p class="eyebrow">BLACK LIST / ${pad(blackCompanies.length)} COMPANIES</p>
              <h2>黑榜<span>。</span></h2>
            </div>
            <p class="section-aside">综合评分 ≤ 2.5 的公司。点开卡片，查看完整好评与差评原文。</p>
          </div>
          ${blackCompanies.length
            ? `<div class="company-list">${blackCompanies.map((company, index) => companyCard(company, index + 1)).join("")}</div>`
            : `<div class="empty-state"><span>—</span><h3>黑榜暂时为空。</h3><p>没有足够证据，就不轻易下判断。</p></div>`}
        </section>
        </div>
      </div>`;
  }

  function tabButton(tab, label, count) {
    return `<button class="tab ${state.tab === tab ? "is-active" : ""}" type="button" data-tab="${tab}">${esc(label)} <span>${count}</span></button>`;
  }

  function filteredCompanies() {
    const query = state.query.trim().toLowerCase();
    let list = companies.filter(company => {
      const stats = companyStats(company.id);
      const matchesQuery = !query || [company.name, company.en, company.sector, company.city, ...(company.tags || [])].join(" ").toLowerCase().includes(query);
      if (!matchesQuery) return false;
      if (state.tab === "pending") return stats.count === 0;
      if (state.tab === "red") return stats.verdict === "red";
      if (state.tab === "black") return stats.verdict === "black";
      if (state.tab === "watch") return stats.verdict === "watch";
      return stats.count > 0;
    });
    if (state.tab === "pending") {
      list.sort((a, b) => a.name.localeCompare(b.name, "zh-CN"));
    } else if (state.sort === "reviews") {
      list.sort((a, b) => companyStats(b.id).count - companyStats(a.id).count || companyStats(b.id).overall - companyStats(a.id).overall);
    } else if (state.sort === "name") {
      list.sort((a, b) => a.name.localeCompare(b.name, "zh-CN"));
    } else {
      list.sort((a, b) => companyStats(b.id).overall - companyStats(a.id).overall || companyStats(b.id).count - companyStats(a.id).count);
    }
    return list;
  }

  function renderBoard() {
    const results = document.getElementById("board-results");
    if (!results) return;
    const list = filteredCompanies();
    if (!list.length) {
      const message = state.tab === "pending" ? "没有找到待评价公司。" : "这个分类下还没有公司。";
      results.innerHTML = `<div class="empty-state"><span>∅</span><h3>${message}</h3><p>换一个筛选，或者提交第一份评价。</p><a class="button button--ghost" href="#/submit">提交评价 ↗</a></div>`;
      return;
    }
    results.innerHTML = list.map((company, index) => companyCard(company, state.tab === "pending" ? null : index + 1)).join("");
  }

  function companyCard(company, rank) {
    const stats = companyStats(company.id);
    const verdict = verdictMeta(stats.verdict);
    return `<a class="company-card ${verdict.className}" href="#/company/${encodeURIComponent(company.id)}">
      <div class="company-card-top">
        <span class="company-rank">${rank ? pad(rank) : "—"}</span>
        <span class="company-sector">${esc(company.sector)} · ${esc(company.city)}</span>
        ${company.demo ? '<span class="demo-chip">DEMO</span>' : ""}
      </div>
      <div class="company-card-main">
        <div>
          <h3>${esc(company.name)}</h3>
          <p class="company-en">${esc(company.en)}</p>
        </div>
        <div class="company-score">
          <strong>${stats.count ? scoreText(stats.overall) : "—"}</strong><span>/ 5</span>
          ${companyVerdictChip(stats.verdict)}
        </div>
      </div>
      ${stats.count ? `
        <div class="company-bars">
          ${scoreRow("薪资", stats.salary)}
          ${scoreRow("氛围", stats.atmosphere)}
          ${scoreRow("成长", stats.growth)}
        </div>
        <div class="company-card-foot">
          <span class="review-split"><b>${stats.good}</b> 好评 <i>/</i> <em>${stats.bad}</em> 差评</span>
          <span>${stats.count} 份评价 <i>↗</i></span>
        </div>` : `
        <div class="company-empty">
          <p>还没有人写下第一份评价。</p>
          <span>${company.demo ? "示例公司" : "成为第一个分享者"} <i>↗</i></span>
        </div>`}
    </a>`;
  }

  function reviewCardCompact(review) {
    const company = companyById.get(review.companyId);
    const meta = typeMeta(review.type);
    return `<a class="voice-card" href="#/company/${encodeURIComponent(review.companyId)}">
      <div class="voice-top"><span class="type-chip ${meta.className}">${meta.label}</span><span>${esc(review.date)}</span></div>
      <strong>${esc(company ? company.name : "未知公司")}</strong>
      <p>${esc(review.reason)}</p>
      <div class="voice-scores"><span>薪资 ${review.salary}</span><span>氛围 ${review.atmosphere}</span><span>成长 ${review.growth}</span></div>
    </a>`;
  }

  /* ----------------------------------------------------------- companies */

  function renderCompanies() {
    const humanoidCompanies = companies.filter(c => !c.demo && /人形|具身/.test(c.sector));
    const mobileCompanies = companies.filter(c => !c.demo && /四足|足式|移动/.test(c.sector) && !/人形|具身/.test(c.sector));
    const industrialCompanies = companies.filter(c => !c.demo && /协作|工业/.test(c.sector));
    const groupedIds = new Set([...humanoidCompanies, ...mobileCompanies, ...industrialCompanies].map(c => c.id));
    const otherCompanies = companies.filter(c => !c.demo && !groupedIds.has(c.id));
    return `<div class="view companies-view">
      <section class="page-head wrap">
        <p class="eyebrow"><span class="eyebrow-dot"></span>COMPANY INDEX / ALL COMPANIES</p>
        <h1>公司库<span>。</span></h1>
        <p class="page-lede">收录不代表推荐，也不代表指控。先找到公司，再决定要不要留下你的经验。</p>
        <div class="page-tools">
          <label class="search-field"><span class="sr-only">搜索公司</span><input id="company-search" type="search" placeholder="搜索公司、城市或方向" autocomplete="off"><i>⌕</i></label>
          <a class="button button--red" href="#/submit">提交评价 <span>↗</span></a>
        </div>
      </section>
      ${demoBanner()}
      <section class="section wrap">
        <div class="companies-groups">
          ${groupMarkup("人形与通用具身", humanoidCompanies)}
          ${groupMarkup("移动与足式", mobileCompanies)}
          ${groupMarkup("协作与工业", industrialCompanies)}
          ${groupMarkup("其他与社区新增", otherCompanies)}
          ${DEMO_MODE ? groupMarkup("演示数据", companies.filter(c => c.demo), true) : ""}
        </div>
      </section>
    </div>`;
  }

  function groupMarkup(title, list, isDemo = false) {
    if (!list.length) return "";
    return `<section class="company-group">
      <div class="group-head"><h2>${esc(title)}</h2><span>${list.length} 家</span>${isDemo ? '<span class="demo-chip">DEMO</span>' : ""}</div>
      <div class="company-index-grid">${list.map(company => companyIndexCard(company)).join("")}</div>
    </section>`;
  }

  function companyIndexCard(company) {
    const stats = companyStats(company.id);
    return `<a class="company-index-card" href="#/company/${encodeURIComponent(company.id)}">
      <div class="index-top"><span>${esc(company.sector)}</span><span>${esc(company.city)}</span></div>
      <h3>${esc(company.name)} ${company.demo ? '<i class="demo-chip">DEMO</i>' : ""}</h3>
      <p>${esc(company.description)}</p>
      <div class="index-foot">
        <span>${stats.count ? `${stats.count} 份评价 · ${scoreText(stats.overall)} 分` : "暂无评价"}</span>
        <span>${stats.count ? companyVerdictChip(stats.verdict) : "写第一条 ↗"}</span>
      </div>
    </a>`;
  }

  /* ------------------------------------------------------------ company */

  function renderCompany(company) {
    const stats = companyStats(company.id);
    const meta = verdictMeta(stats.verdict);
    const list = reviewsFor(company.id).filter(review => state.reviewFilter === "all" || review.type === state.reviewFilter);
    return `<div class="view company-view">
      <section class="company-head wrap">
        <a class="back-link" href="#/">← 回到榜单</a>
        <div class="company-head-grid">
          <div>
            <div class="company-kicker"><span>${esc(company.sector)}</span><span>${esc(company.city)}</span>${company.demo ? '<span class="demo-chip">DEMO</span>' : ""}</div>
            <h1>${esc(company.name)}<span>。</span></h1>
            <p class="company-en-large">${esc(company.en)}</p>
            <p class="company-description">${esc(company.description)}</p>
            <div class="company-tags">${(company.tags || []).map(tag => `<span>${esc(tag)}</span>`).join("")}</div>
            ${company.website ? `<a class="external-link" href="${esc(company.website)}" target="_blank" rel="noopener">官方网站 ↗</a>` : ""}
          </div>
          <aside class="score-panel">
            <div class="score-panel-top"><span>OVERALL / ${pad(stats.count)} REVIEWS</span>${companyVerdictChip(stats.verdict)}</div>
            <div class="big-score">${stats.count ? scoreText(stats.overall) : "—"}<span>/ 5</span></div>
            <div class="score-panel-bars">
              ${scoreRow("薪资待遇", stats.salary)}
              ${scoreRow("工作氛围", stats.atmosphere)}
              ${scoreRow("个人收获", stats.growth)}
            </div>
            <div class="score-panel-foot"><span>${stats.good} 好评 · ${stats.bad} 差评${stats.neutral ? ` · ${stats.neutral} 中立` : ""}</span><span>${meta.note}</span></div>
          </aside>
        </div>
      </section>

      <section class="section wrap company-reviews">
        <div class="reviews-head">
          <div>
            <p class="eyebrow">REVIEWS / ${pad(stats.count)} VOICES</p>
            <h2>好评与差评，<br><em>都保留原文。</em></h2>
          </div>
          <div class="review-filters">
            ${reviewFilterButton("all", "全部", stats.count)}
            ${reviewFilterButton("good", "好评", stats.good)}
            ${reviewFilterButton("bad", "差评", stats.bad)}
          </div>
        </div>
        ${stats.count < 3 && stats.count > 0 ? '<p class="sample-warning">样本较少：当前评分只代表已提交的评价，不足以概括整家公司。</p>' : ""}
        <div class="review-list">
          ${list.length ? list.map(reviewCard).join("") : `<div class="empty-state"><span>“</span><h3>这个分类下还没有评价。</h3><p>你的经历可能就是下一个人需要的参考。</p>${company.demo ? '<span class="demo-chip">示例公司不可提交</span>' : '<a class="button button--ghost" href="#/submit?company=' + encodeURIComponent(company.id) + '">写第一条评价 ↗</a>'}</div>`}
        </div>
        ${company.demo ? '<p class="company-submit-note">这是虚构示例公司，不开放真实评价提交。</p>' : `<div class="company-submit"><p>你在这家公司工作过、面试过，或了解它的招聘流程？</p><a class="button button--red" href="#/submit?company=${encodeURIComponent(company.id)}">写下你的评价 <span>↗</span></a></div>`}
      </section>
    </div>`;
  }

  function reviewFilterButton(filter, label, count) {
    return `<button class="review-filter ${state.reviewFilter === filter ? "is-active" : ""}" type="button" data-review-filter="${filter}">${label} <span>${count}</span></button>`;
  }

  function reviewCard(review) {
    const meta = typeMeta(review.type);
    return `<article class="review-card ${meta.className}">
      <div class="review-card-head">
        <span class="type-chip ${meta.className}">${meta.label}</span>
        <span class="review-date">${esc(review.date)}</span>
      </div>
      <div class="review-card-scores">
        <span><b>${review.salary}</b><small>薪资</small></span>
        <span><b>${review.atmosphere}</b><small>氛围</small></span>
        <span><b>${review.growth}</b><small>成长</small></span>
      </div>
      <p class="review-reason">${esc(review.reason)}</p>
      <div class="review-card-foot">
        <span>${esc(review.role || "未填写岗位")} · ${esc(review.tenure || "未填写任期")}${review.location ? ` · ${esc(review.location)}` : ""}</span>
        <span>${esc(review.author || "匿名")}${review.demo ? " · DEMO" : ""}</span>
      </div>
    </article>`;
  }

  /* -------------------------------------------------------------- submit */

  function customSelectMarkup(name, options, selected) {
    const current = options.find(option => option[0] === selected) || options[0];
    return `<div class="custom-select" data-custom-select>
      <button class="custom-select-trigger" type="button" aria-haspopup="listbox" aria-expanded="false">
        <span>${esc(current[1])}</span><i aria-hidden="true">⌄</i>
      </button>
      <input type="hidden" name="${esc(name)}" value="${esc(current[0])}">
      <div class="custom-select-menu" role="listbox" hidden>
        ${options.map(([value, label]) => `<button class="custom-option" type="button" role="option" data-value="${esc(value)}" aria-selected="${value === current[0] ? "true" : "false"}">${esc(label)}</button>`).join("")}
      </div>
    </div>`;
  }

  function renderSubmit() {
    const selectedId = new URLSearchParams((window.location.hash.split("?")[1] || "")).get("company") || "";
    const selected = companyById.get(selectedId);
    const selectedName = selected ? selected.name : "";
    const real = allRealCompanies();
    const directPublish = SUPABASE_ENABLED && supabaseReady;
    return `<div class="view submit-view">
      <section class="page-head wrap">
        <p class="eyebrow"><span class="eyebrow-dot"></span>ANONYMOUS REVIEW / SUBMIT</p>
        <h1>写下你的<br><em>真实体感。</em></h1>
      </section>
      <section class="section wrap submit-layout">
        <form class="review-form" id="review-form" novalidate>
          <div class="form-section">
            <div class="form-section-head"><span>01</span><h2>评价对象</h2></div>
            <div class="field-grid">
              <label class="field field--wide"><span>公司名称 <em>*</em></span>
                <input name="companyName" id="review-company" list="company-options" maxlength="100" required autocomplete="organization" placeholder="直接输入公司全称，或从建议中选择" value="${esc(selectedName)}">
                <datalist id="company-options">${real.map(company => `<option value="${esc(company.name)}"></option>`).join("")}</datalist>
              </label>
            </div>
            <p class="form-hint">公司名可以直接填写；输入时会显示公司库中的建议。</p>
            <div class="field-grid field-grid--three">
              <div class="field"><span>评价类型 <em>*</em></span>
                ${customSelectMarkup("type", [
                  ["good", "好评"],
                  ["neutral", "中立"],
                  ["bad", "差评"]
                ], "neutral")}
              </div>
              <label class="field"><span>岗位 / 职能</span><input type="text" name="role" maxlength="60" placeholder="例如：算法工程师"></label>
              <div class="field"><span>任期</span>
                ${customSelectMarkup("tenure", [
                  ["", "未填写"],
                  ["3–6 个月", "3–6 个月"],
                  ["6–12 个月", "6–12 个月"],
                  ["1–2 年", "1–2 年"],
                  ["2–4 年", "2–4 年"],
                  ["4 年以上", "4 年以上"],
                  ["仅面试", "仅面试"]
                ], "")}
              </div>
            </div>
            <div class="field-grid field-grid--two">
              <label class="field"><span>城市</span><input type="text" name="location" maxlength="40" placeholder="例如：上海"></label>
              <div class="field"><span>身份</span>
                ${customSelectMarkup("relation", [
                  ["不愿透露", "不愿透露"],
                  ["现任员工", "现任员工"],
                  ["前员工", "前员工"],
                  ["面试候选人", "面试候选人"],
                  ["合作方 / 其他", "合作方 / 其他"]
                ], "不愿透露")}
              </div>
            </div>
          </div>

          <div class="form-section">
            <div class="form-section-head"><span>02</span><h2>三项评分</h2></div>
            <p class="form-hint">1 分最低，5 分最高。请按你在这家公司的真实体感打分。</p>
            ${ratingField("salary", "薪资待遇", "现金、期权、福利与投入产出比")}
            ${ratingField("atmosphere", "工作氛围", "协作、管理、节奏与安全感")}
            ${ratingField("growth", "个人收获", "技能、视野、项目质量与成长速度")}
          </div>

          <div class="form-section">
            <div class="form-section-head"><span>03</span><h2>理由</h2></div>
            <label class="field"><span>具体理由 <em>*</em></span>
              <textarea name="reason" rows="7" required placeholder="可以写：你在什么团队、做什么、哪些地方好、哪些地方让你不舒服、你会如何建议下一个人判断。"></textarea>
            </label>
            <p class="form-hint">避免只写「好」「坑」「快跑」。没有理由的评价不会被收录。</p>
          </div>

          <div class="form-section">
            <div class="form-section-head"><span>04</span><h2>署名与声明</h2></div>
            <div class="field-grid">
              <label class="field field--wide"><span>展示名称</span><input type="text" name="author" maxlength="40" placeholder="可留空，默认匿名"></label>
            </div>
            <label class="check-field"><input type="checkbox" name="consent" required><span>我确认内容是自己的真实经历，不包含人身攻击、隐私、未公开信息或商业秘密；同意公开展示，并允许后续更正或撤下。</span></label>
            <p class="form-disclaimer">${directPublish
              ? "提交后会直接写入公开榜单，不需要登录。请不要填写真实姓名、联系方式或可识别他人的信息。编辑会事后抽查，违规内容可被撤下。"
              : "提交会生成一个公开 GitHub Issue，用于留痕与自动发布。请不要填写真实姓名、联系方式或可识别他人的信息。"}</p>
            <div class="form-actions">
              <button class="button button--ghost" type="button" data-copy-review>复制草稿</button>
              <button class="button button--red" type="submit">${directPublish ? "发布评价" : "提交到 GitHub"} <span>↗</span></button>
            </div>
            <p class="form-status" id="review-status">${directPublish
              ? "提交后会直接发布到公开榜单，无需登录。"
              : SUPABASE_ENABLED ? "匿名后端暂未就绪，暂时改用 GitHub Issue。" : REPO ? "提交后会打开 GitHub Issue，自动发布到榜单。" : "当前未配置后端，提交会复制草稿。"}</p>
          </div>
        </form>
      </section>
    </div>`;
  }

  function ratingField(name, title, hint) {
    return `<fieldset class="rating-field">
      <legend>${esc(title)} <small>${esc(hint)}</small></legend>
      <div class="rating-options">
        ${[1,2,3,4,5].map(value => `<label><input type="radio" name="${name}" value="${value}" ${value === 3 ? "checked" : ""} required><span>${value}</span></label>`).join("")}
      </div>
    </fieldset>`;
  }

  function buildReviewDraft(form) {
    const data = new FormData(form);
    const value = key => String(data.get(key) || "").trim();
    const type = typeMeta(value("type")).label;
    return `### 评价对象
${value("companyName") || "待确认"}

### 评价类型
${type}

### 三项评分（1–5）
- 薪资待遇：${value("salary")}
- 工作氛围：${value("atmosphere")}
- 个人收获：${value("growth")}

### 具体理由
${value("reason")}

### 岗位 / 任期 / 城市
${value("role") || "未填写"} / ${value("tenure") || "未填写"} / ${value("location") || "未填写"}

### 投稿身份
${value("relation")}

### 展示名称
${value("author") || "匿名"}

---
*由具身红黑榜提交表单生成。提交者确认内容为个人真实经历，不含人身攻击、隐私或未公开信息。*`;
  }

  function closeCustomSelects(except = null) {
    document.querySelectorAll("[data-custom-select]").forEach(select => {
      if (select === except) return;
      select.querySelector(".custom-select-trigger")?.setAttribute("aria-expanded", "false");
      const menu = select.querySelector(".custom-select-menu");
      if (menu) menu.hidden = true;
    });
  }

  function setupCustomSelects(root) {
    root.querySelectorAll("[data-custom-select]").forEach(select => {
      const trigger = select.querySelector(".custom-select-trigger");
      const menu = select.querySelector(".custom-select-menu");
      const hidden = select.querySelector('input[type="hidden"]');
      if (!trigger || !menu || !hidden) return;
      trigger.addEventListener("click", event => {
        event.stopPropagation();
        const willOpen = menu.hidden;
        closeCustomSelects(select);
        menu.hidden = !willOpen;
        trigger.setAttribute("aria-expanded", String(willOpen));
      });
      menu.querySelectorAll("[data-value]").forEach(option => {
        option.addEventListener("click", event => {
          event.stopPropagation();
          hidden.value = option.dataset.value;
          trigger.querySelector("span").textContent = option.textContent;
          menu.querySelectorAll("[data-value]").forEach(item => item.setAttribute("aria-selected", String(item === option)));
          menu.hidden = true;
          trigger.setAttribute("aria-expanded", "false");
          trigger.focus();
        });
      });
      select.addEventListener("keydown", event => {
        if (event.key === "Escape") {
          menu.hidden = true;
          trigger.setAttribute("aria-expanded", "false");
          trigger.focus();
        }
      });
    });
  }

  async function submitToSupabase(form) {
    const status = document.getElementById("review-status");
    const button = form.querySelector('button[type="submit"]');
    const payload = reviewPayload(form);
    if (button) button.disabled = true;
    if (status) status.textContent = "正在发布…";
    try {
      const response = await fetch(`${SUPABASE_URL}/rest/v1/${SUPABASE_TABLE}`, {
        method: "POST",
        headers: supabaseHeaders({
          "Content-Type": "application/json",
          Prefer: "return=minimal"
        }),
        body: JSON.stringify(payload)
      });
      if (!response.ok) {
        let detail = "";
        try {
          const errorBody = await response.json();
          detail = errorBody.message || errorBody.hint || "";
        } catch (_) {}
        throw new Error(detail || `HTTP ${response.status}`);
      }
      await loadSupabaseReviews();
      const company = companies.find(item => normalizeCompanyName(item.name) === normalizeCompanyName(payload.company_name));
      if (status) status.textContent = "评价已发布。";
      showToast("评价已发布");
      window.location.hash = company ? `#/company/${encodeURIComponent(company.id)}` : "#/";
    } catch (error) {
      if (status) status.textContent = `发布失败：${error.message}`;
      showToast("评价发布失败，请稍后重试");
    } finally {
      if (button) button.disabled = false;
    }
  }

  function setupSubmit() {
    const form = document.getElementById("review-form");
    if (!form) return;
    setupCustomSelects(form);
    form.querySelector("[data-copy-review]")?.addEventListener("click", () => {
      if (!form.reportValidity()) return;
      copyText(buildReviewDraft(form), "评价草稿已复制");
    });
    form.addEventListener("submit", async event => {
      event.preventDefault();
      if (!form.reportValidity()) return;
      if (SUPABASE_ENABLED && supabaseReady) {
        await submitToSupabase(form);
        return;
      }
      const draft = buildReviewDraft(form);
      const companyName = form.querySelector('[name="companyName"]').value.trim() || "新公司";
      const type = typeMeta(form.querySelector('[name="type"]').value).label;
      const title = `[评价] ${companyName} / ${type}`;
      const link = issueUrl(title, draft);
      const status = document.getElementById("review-status");
      if (link && !isLocalPreview()) {
        window.open(link, "_blank", "noopener");
        if (status) status.textContent = "已打开 GitHub Issue，请确认后提交。";
        showToast("已打开 GitHub 评价 Issue");
      } else {
        copyText(draft, "评价草稿已复制；发布后可自动打开 GitHub Issue");
        if (status) status.textContent = "本地预览：评价草稿已复制。";
      }
    });
  }

  function renderNotFound() {
    return `<div class="view notfound-view"><div class="wrap"><p class="eyebrow">404 / NOT FOUND</p><h1>这条记录<br><em>还没有被写下。</em></h1><p>可能是链接过期，也可能是这家公司还没有进入公司库。</p><a class="button button--red" href="#/">回到榜单 <span>↗</span></a></div></div>`;
  }

  /* --------------------------------------------------------------- state */

  const state = {
    tab: "all",
    query: "",
    sort: "score",
    reviewFilter: "all"
  };

  function setActiveNav(name) {
    document.querySelectorAll("[data-nav]").forEach(link => link.classList.toggle("is-active", link.dataset.nav === name));
  }

  function closeMenu() {
    document.getElementById("site-header")?.classList.remove("is-open");
    document.querySelector("[data-menu-toggle]")?.setAttribute("aria-expanded", "false");
  }

  function parseRoute() {
    const hash = window.location.hash || "#/";
    const [path, queryString] = hash.replace(/^#\/?/, "").split("?");
    const parts = path.split("/").filter(Boolean);
    const query = new URLSearchParams(queryString || "");
    if (!parts.length) return { name: "home" };
    if (parts[0] === "companies") return { name: "companies" };
    if (parts[0] === "submit") return { name: "submit", query };
    if (parts[0] === "company" && parts[1]) {
      const company = companyById.get(decodeURIComponent(parts[1]));
      return company ? { name: "company", company } : { name: "notfound" };
    }
    return { name: "notfound" };
  }

  function bindShared() {
    setActiveNav(parseRoute().name);
    document.querySelector("[data-menu-toggle]")?.addEventListener("click", event => {
      const header = document.getElementById("site-header");
      const open = header.classList.toggle("is-open");
      event.currentTarget.setAttribute("aria-expanded", String(open));
    });
    document.querySelectorAll("#mobile-menu a").forEach(link => link.addEventListener("click", closeMenu));
    document.querySelector("[data-year]")?.replaceChildren(document.createTextNode(new Date().getFullYear()));
    document.addEventListener("click", () => closeCustomSelects());
  }

  function render() {
    const route = parseRoute();
    const titles = {
      home: "具身红黑榜 · 具身智能公司匿名评价",
      companies: "公司库 · 具身红黑榜",
      submit: "提交评价 · 具身红黑榜",
      notfound: "页面不存在 · 具身红黑榜"
    };
    document.title = route.name === "company" ? `${route.company.name} · 具身红黑榜` : titles[route.name] || titles.notfound;
    closeMenu();
    if (route.name === "home") {
      main.innerHTML = renderHome();
      bindHomeSearch();
    } else if (route.name === "companies") {
      main.innerHTML = renderCompanies();
      setActiveNav("companies");
      bindCompanyIndex();
    } else if (route.name === "company") {
      main.innerHTML = renderCompany(route.company);
      setActiveNav("home");
      bindCompanyPage();
    } else if (route.name === "submit") {
      main.innerHTML = renderSubmit();
      setActiveNav("submit");
      setupSubmit();
    } else {
      main.innerHTML = renderNotFound();
    }
    window.scrollTo(0, 0);
  }

  function bindHomeSearch() {
    const input = document.getElementById("home-search-input");
    const results = document.getElementById("home-search-results");
    const lists = document.getElementById("ranked-lists");
    const count = document.getElementById("home-search-count");
    if (!input || !results || !lists) return;
    input.addEventListener("input", () => {
      const query = input.value.trim().toLowerCase();
      if (!query) {
        results.hidden = true;
        lists.hidden = false;
        if (count) count.textContent = "";
        return;
      }
      const matches = companies.filter(company =>
        [company.name, company.en, company.sector, company.city, ...(company.tags || [])]
          .join(" ").toLowerCase().includes(query)
      );
      lists.hidden = true;
      results.hidden = false;
      if (count) count.textContent = `${matches.length} 家`;
      results.innerHTML = `
        <div class="section-head">
          <div>
            <p class="eyebrow">SEARCH / ${pad(matches.length)} RESULTS</p>
            <h2>搜索结果</h2>
          </div>
          <p class="section-aside">点击公司卡片查看已有评价，或直接写下你的经历。</p>
        </div>
        ${matches.length
          ? `<div class="company-index-grid search-index-grid">${matches.map(companyIndexCard).join("")}</div>`
          : `<div class="empty-state"><span>∅</span><h3>没有找到这家公司。</h3><p>可以直接在提交页填写公司名称。</p><a class="button button--ghost" href="#/submit">提交评价 ↗</a></div>`}`;
    });
  }

  function bindBoard() {
    document.querySelectorAll("[data-tab]").forEach(button => {
      button.addEventListener("click", () => {
        state.tab = button.dataset.tab;
        document.querySelectorAll("[data-tab]").forEach(item => item.classList.toggle("is-active", item.dataset.tab === state.tab));
        renderBoard();
      });
    });
    document.querySelectorAll("[data-tab-link]").forEach(link => {
      link.addEventListener("click", event => {
        event.preventDefault();
        state.tab = link.dataset.tabLink;
        document.querySelectorAll("[data-tab]").forEach(item => item.classList.toggle("is-active", item.dataset.tab === state.tab));
        renderBoard();
        document.getElementById("board")?.scrollIntoView({ behavior: "smooth", block: "start" });
      });
    });
    document.getElementById("company-search")?.addEventListener("input", event => {
      state.query = event.target.value;
      renderBoard();
      bindSearchJump();
    });
    document.getElementById("board-sort")?.addEventListener("change", event => {
      state.sort = event.target.value;
      renderBoard();
      bindSearchJump();
    });
    renderBoard();
    bindSearchJump();
  }

  function bindSearchJump() {
    // preserve focus/selection when the board is re-rendered after typing
    const input = document.getElementById("company-search");
    if (input && document.activeElement !== input && input.value) {
      input.focus();
      input.setSelectionRange(input.value.length, input.value.length);
    }
  }

  function bindCompanyIndex() {
    document.getElementById("company-search")?.addEventListener("input", event => {
      const query = event.target.value.toLowerCase();
      document.querySelectorAll(".company-index-card").forEach(card => {
        card.style.display = card.innerText.toLowerCase().includes(query) ? "" : "none";
      });
    });
  }

  function bindCompanyPage() {
    document.querySelectorAll("[data-review-filter]").forEach(button => {
      button.addEventListener("click", () => {
        state.reviewFilter = button.dataset.reviewFilter;
        render();
        document.querySelector(".company-reviews")?.scrollIntoView({ behavior: "instant", block: "start" });
      });
    });
  }

  window.addEventListener("hashchange", () => {
    state.reviewFilter = "all";
    render();
  });

  async function init() {
    await loadSupabaseReviews();
    bindShared();
    render();
  }

  init();
})();
