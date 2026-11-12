(() => {
  "use strict";

  const CFG = window.RB_CONFIG || {};
  const { companies = [], reviews = [] } = window.RB_DATA || {};
  const DEMO_MODE = CFG.demoMode !== false;
  const REPO = (CFG.repo || "").replace(/^\/|\/$/g, "");
  const REPO_URL = REPO ? `https://github.com/${REPO}` : "";
  const BRANCH = CFG.branch || "main";
  const main = document.getElementById("main");
  const toastRegion = document.getElementById("toast-region");
  let toastTimer = null;

  const visibleReviews = reviews.filter(review => DEMO_MODE || !review.demo);
  const companyById = new Map(companies.map(company => [company.id, company]));
  const reviewsByCompany = new Map();
  visibleReviews.forEach(review => {
    if (!reviewsByCompany.has(review.companyId)) reviewsByCompany.set(review.companyId, []);
    reviewsByCompany.get(review.companyId).push(review);
  });

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
    const verdict = !list.length ? "pending" : list.length < 2 ? "watch" : overall >= 4 ? "red" : overall <= 2.5 ? "black" : "watch";
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

  function demoBanner() {
    if (!DEMO_MODE) return "";
    const demoCount = companies.filter(company => company.demo).length;
    return `<div class="demo-banner wrap">
      <span class="demo-mark">DEMO</span>
      <p>当前包含 ${demoCount} 家虚构示例公司与演示评价，仅用于展示、测试页面，不代表任何真实雇主。真实公司评价从零开始收集。</p>
      <a href="#/about">查看规则 ↗</a>
    </div>`;
  }

  /* --------------------------------------------------------------- home */

  function renderHome() {
    const ranked = companies.filter(company => companyStats(company.id).count > 0);
    const redCount = ranked.filter(company => companyStats(company.id).verdict === "red").length;
    const blackCount = ranked.filter(company => companyStats(company.id).verdict === "black").length;
    const overall = average(visibleReviews.map(review => (review.salary + review.atmosphere + review.growth) / 3));
    return `
      <div class="view home-view">
        <section class="hero wrap">
          <div class="hero-copy">
            <p class="eyebrow"><span class="eyebrow-dot"></span>ANONYMOUS EXPERIENCE / PUBLIC REASONING</p>
            <h1>具身<br><em>红黑榜</em></h1>
            <p class="hero-lede">薪资待遇、工作氛围、个人收获，三项 5 分制。<br>好评与差评都必须给出理由。这里不替公司下结论，只把真实经历摆上桌。</p>
            <div class="hero-actions">
              <a class="button button--red" href="#/submit">提交一条评价 <span>↗</span></a>
              <a class="button button--ghost" href="#/about">先看评价规则</a>
            </div>
            <p class="hero-note">匿名投稿 · 社区审核 · 不收录人身攻击与未公开信息</p>
          </div>
          <div class="hero-board" aria-label="榜单概览">
            <div class="board-top"><span>LIVE BOARD / 2026</span><span class="board-live"><i></i>UPDATED</span></div>
            <div class="board-numbers">
              <div><strong>${pad(companies.length)}</strong><span>收录公司</span></div>
              <div><strong>${pad(visibleReviews.length)}</strong><span>有效评价</span></div>
              <div><strong>${scoreText(overall)}</strong><span>综合均分</span></div>
            </div>
            <div class="board-split">
              <a class="board-half board-half--red" href="#/" data-tab-link="red">
                <span>RED LIST</span><strong>${pad(redCount)}</strong><small>综合 ≥ 4.0</small>
              </a>
              <a class="board-half board-half--black" href="#/" data-tab-link="black">
                <span>BLACK LIST</span><strong>${pad(blackCount)}</strong><small>综合 ≤ 2.5</small>
              </a>
            </div>
            <div class="board-foot"><span>三个维度等权平均</span><span>样本不足会标记为「观察中」</span></div>
          </div>
        </section>

        ${demoBanner()}

        <section class="section board-section wrap" id="board">
          <div class="section-head">
            <div>
              <p class="eyebrow">01 / THE BOARD</p>
              <h2>先看分数，<br><em>再看理由。</em></h2>
            </div>
            <div class="section-aside">
              <p>榜单只汇总公开投稿的个人经验，不代表公司事实。每张卡片都可以进入公司页，查看好评与差评的原始理由。</p>
              <a class="text-link" href="#/companies">浏览全部公司 <span>↗</span></a>
            </div>
          </div>

          <div class="board-tools">
            <div class="tabs" role="tablist" aria-label="榜单分类">
              ${tabButton("all", "全部", ranked.length)}
              ${tabButton("red", "红榜", redCount)}
              ${tabButton("black", "黑榜", blackCount)}
              ${tabButton("watch", "观察中", ranked.filter(company => companyStats(company.id).verdict === "watch").length)}
              ${tabButton("pending", "待评价", companies.length - ranked.length)}
            </div>
            <div class="board-controls">
              <label class="search-field"><span class="sr-only">搜索公司</span><input id="company-search" type="search" placeholder="搜索公司、城市或方向" autocomplete="off"><i>⌕</i></label>
              <select id="board-sort" aria-label="排序方式">
                <option value="score">按综合评分</option>
                <option value="reviews">按评价数量</option>
                <option value="name">按公司名称</option>
              </select>
            </div>
          </div>
          <div id="board-results" class="company-list" aria-live="polite"></div>
        </section>

        <section class="section latest-section wrap">
          <div class="section-head section-head--compact">
            <div>
              <p class="eyebrow">02 / LATEST VOICES</p>
              <h2 class="section-title section-title--small">最近的声音</h2>
            </div>
            <p class="section-aside section-aside--inline">匿名，但不匿名理由。</p>
          </div>
          <div class="latest-grid">
            ${visibleReviews.slice().sort((a, b) => String(b.date).localeCompare(String(a.date))).slice(0, 4).map(reviewCardCompact).join("")}
          </div>
        </section>

        <section class="method-band">
          <div class="wrap method-band-inner">
            <div>
              <p class="eyebrow">03 / HOW IT WORKS</p>
              <h2>不是投票，<br><em>是可追溯的经验。</em></h2>
            </div>
            <div class="method-steps">
              <div><span>01</span><strong>三项评分</strong><p>薪资待遇、工作氛围、个人收获，各 1–5 分。</p></div>
              <div><span>02</span><strong>必须写理由</strong><p>没有理由的高分或低分，不入榜。</p></div>
              <div><span>03</span><strong>审核后发布</strong><p>通过 GitHub Issue 提交，编辑核对后写入榜单。</p></div>
            </div>
            <a class="button button--ghost" href="#/about">阅读完整规则 <span>↗</span></a>
          </div>
        </section>

        <section class="section submit-strip wrap">
          <div>
            <p class="eyebrow">YOUR TURN</p>
            <h2>你待过的地方，<br><em>值得被下一个人看见。</em></h2>
          </div>
          <div>
            <p>不需要实名，也不要求完美措辞。把薪资、氛围、成长分开打分，写清楚你的角色和时间范围。</p>
            <a class="button button--red" href="#/submit">写一条评价 <span>↗</span></a>
          </div>
        </section>
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
          ${groupMarkup("人形与通用具身", companies.filter(c => /人形|具身/.test(c.sector) && !c.demo))}
          ${groupMarkup("移动与足式", companies.filter(c => /四足|足式|移动/.test(c.sector) && !/人形|具身/.test(c.sector) && !c.demo))}
          ${groupMarkup("协作与工业", companies.filter(c => /协作|工业/.test(c.sector) && !c.demo))}
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

  function renderSubmit() {
    const selectedCompany = new URLSearchParams((window.location.hash.split("?")[1] || "")).get("company") || "";
    const real = allRealCompanies();
    return `<div class="view submit-view">
      <section class="page-head wrap">
        <p class="eyebrow"><span class="eyebrow-dot"></span>ANONYMOUS REVIEW / SUBMIT</p>
        <h1>写下你的<br><em>真实体感。</em></h1>
        <p class="page-lede">不需要实名，但需要具体。把薪资、氛围、成长分开打分，写清楚你的岗位、任期和判断依据。</p>
      </section>
      <section class="section wrap submit-layout">
        <form class="review-form" id="review-form" novalidate>
          <div class="form-section">
            <div class="form-section-head"><span>01</span><h2>评价对象</h2></div>
            <div class="field-grid">
              <label class="field field--wide"><span>公司 <em>*</em></span>
                <select name="company" id="review-company" required>
                  <option value="">选择一家公司</option>
                  ${real.map(company => `<option value="${esc(company.id)}" ${company.id === selectedCompany ? "selected" : ""}>${esc(company.name)} · ${esc(company.sector)}</option>`).join("")}
                  <option value="__new">其他 / 建议新增公司</option>
                </select>
              </label>
              <label class="field field--wide is-hidden" id="new-company-field"><span>公司名称 <em>*</em></span><input type="text" name="newCompany" maxlength="80" placeholder="请填写公司全称"></label>
            </div>
            <div class="field-grid field-grid--three">
              <label class="field"><span>评价类型 <em>*</em></span>
                <select name="type" required>
                  <option value="good">好评</option>
                  <option value="neutral" selected>中立</option>
                  <option value="bad">差评</option>
                </select>
              </label>
              <label class="field"><span>岗位 / 职能</span><input type="text" name="role" maxlength="60" placeholder="例如：算法工程师"></label>
              <label class="field"><span>任期</span>
                <select name="tenure">
                  <option value="">未填写</option>
                  <option>3–6 个月</option>
                  <option>6–12 个月</option>
                  <option>1–2 年</option>
                  <option>2–4 年</option>
                  <option>4 年以上</option>
                  <option>仅面试</option>
                </select>
              </label>
            </div>
            <div class="field-grid field-grid--two">
              <label class="field"><span>城市</span><input type="text" name="location" maxlength="40" placeholder="例如：上海"></label>
              <label class="field"><span>身份</span>
                <select name="relation">
                  <option value="不愿透露">不愿透露</option>
                  <option>现任员工</option>
                  <option>前员工</option>
                  <option>面试候选人</option>
                  <option>合作方 / 其他</option>
                </select>
              </label>
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
              <textarea name="reason" rows="7" minlength="36" maxlength="1600" required placeholder="至少写 36 个字。可以写：你在什么团队、做什么、哪些地方好、哪些地方让你不舒服、你会如何建议下一个人判断。"></textarea>
            </label>
            <p class="form-hint">避免只写「好」「坑」「快跑」。没有理由的评价不会被收录。</p>
          </div>

          <div class="form-section">
            <div class="form-section-head"><span>04</span><h2>署名与声明</h2></div>
            <div class="field-grid field-grid--two">
              <label class="field"><span>展示名称</span><input type="text" name="author" maxlength="40" placeholder="可留空，默认匿名"></label>
              <label class="field"><span>补充链接</span><input type="url" name="link" placeholder="可选：招聘页 / 项目页"></label>
            </div>
            <label class="check-field"><input type="checkbox" name="consent" required><span>我确认内容是自己的真实经历，不包含人身攻击、隐私、未公开信息或商业秘密；同意在审核通过后公开展示。</span></label>
            <p class="form-disclaimer">提交会生成一个公开 GitHub Issue，用于审核与留痕。平台不会自动发布，编辑核对后会写入榜单。请不要填写真实姓名、联系方式或可识别他人的信息。</p>
            <div class="form-actions">
              <button class="button button--ghost" type="button" data-copy-review>复制草稿</button>
              <button class="button button--red" type="submit">提交到 GitHub <span>↗</span></button>
            </div>
            <p class="form-status" id="review-status">${REPO ? "提交后会在 GitHub 打开审核 Issue。" : "当前未配置仓库，提交会复制草稿。"}</p>
          </div>
        </form>
        <aside class="submit-aside">
          <div class="aside-block">
            <span class="eyebrow">BEFORE YOU WRITE</span>
            <h3>写之前，<br>先确认三件事。</h3>
            <ol>
              <li>你评价的是自己的经历，不是听来的传闻。</li>
              <li>你愿意让下一个人看到具体依据，而不只是情绪。</li>
              <li>你没有泄露他人隐私、客户信息或未公开项目。</li>
            </ol>
          </div>
          <div class="aside-block aside-block--red">
            <span class="eyebrow">NOT ALLOWED</span>
            <h3>以下内容会被删除。</h3>
            <ul>
              <li>人身攻击、侮辱、歧视或未经证实的指控</li>
              <li>真实姓名、联系方式、工号等个人信息</li>
              <li>未公开的薪酬表、客户名单或商业秘密</li>
            </ul>
          </div>
          <div class="aside-block">
            <span class="eyebrow">AFTER SUBMIT</span>
            <p>评价会进入公开审核队列。编辑核对格式与边界后，写入 <code>data.js</code> 并重新发布；公司也可以提交事实性回应。</p>
            <a href="#/about">完整评价规则 ↗</a>
          </div>
        </aside>
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
    const companyId = value("company");
    const company = companyId === "__new" ? null : companyById.get(companyId);
    const type = typeMeta(value("type")).label;
    return `### 评价对象
${company ? company.name : value("newCompany") || "待确认"}

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

### 补充链接
${value("link") || "（未填写）"}

---
*由具身红黑榜提交表单生成。提交者确认内容为个人真实经历，不含人身攻击、隐私或未公开信息。*`;
  }

  function setupSubmit() {
    const form = document.getElementById("review-form");
    if (!form) return;
    const companySelect = document.getElementById("review-company");
    const newCompanyField = document.getElementById("new-company-field");
    companySelect?.addEventListener("change", () => {
      newCompanyField?.classList.toggle("is-hidden", companySelect.value !== "__new");
      const newInput = form.querySelector('[name="newCompany"]');
      if (newInput) newInput.required = companySelect.value === "__new";
    });
    form.querySelector("[data-copy-review]")?.addEventListener("click", () => {
      if (!form.reportValidity()) return;
      copyText(buildReviewDraft(form), "评价草稿已复制");
    });
    form.addEventListener("submit", event => {
      event.preventDefault();
      if (!form.reportValidity()) return;
      const draft = buildReviewDraft(form);
      const companyId = form.querySelector('[name="company"]').value;
      const company = companyId === "__new" ? null : companyById.get(companyId);
      const type = typeMeta(form.querySelector('[name="type"]').value).label;
      const title = `[评价] ${company ? company.name : "新公司"} / ${type}`;
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

  /* --------------------------------------------------------------- about */

  function renderAbout() {
    return `<div class="view about-view">
      <section class="page-head wrap">
        <p class="eyebrow"><span class="eyebrow-dot"></span>WHY THIS EXISTS / RULES</p>
        <h1>不是法庭，<br><em>是一张经验地图。</em></h1>
        <p class="page-lede">具身智能行业变化很快，招聘信息却很少包含真实的组织体验。这里收集匿名、具体、可讨论的评价，让后来者在接受 offer 前多一个参照。</p>
      </section>
      <section class="section wrap about-grid">
        <article class="about-main">
          <h2>我们为什么做这件事</h2>
          <p>薪资可以比较，工作氛围和个人收获却常常只在私下流传。信息不对称让求职者只能依赖面试感受，也让认真做事的团队难以被看见。</p>
          <p>具身红黑榜不试图给公司发奖杯或判决书。它做的是一件更小的事：把「我在那里工作过」拆成三个可比较的维度，并要求每个分数都附带理由。</p>

          <h2>评分怎么算</h2>
          <div class="rule-table">
            <div><span>薪资待遇</span><p>现金、期权、福利与投入产出比。不是绝对薪资排名，而是投稿者感受到的公平与可持续性。</p></div>
            <div><span>工作氛围</span><p>协作、管理、节奏、安全感与沟通质量。允许不同团队之间存在差异，但要求写清具体情境。</p></div>
            <div><span>个人收获</span><p>技能、视野、项目质量与成长速度。不是「忙不忙」，而是忙完之后得到了什么。</p></div>
          </div>
          <p>三项等权平均为综合分。单家公司少于 2 份评价时标记「观察中」；综合 ≥ 4.0 进入红榜，≤ 2.5 进入黑榜。样本不足时，标签只描述现有样本，不构成对公司的整体判断。</p>

          <h2>审核边界</h2>
          <ul class="about-list">
            <li><strong>只收第一人称经验。</strong>「听说」「朋友说」不能作为独立评价；可以补充在理由里，但必须有投稿者自己的经历。</li>
            <li><strong>禁止人身攻击。</strong>可以批评管理方式和制度，但不能点名羞辱、歧视或威胁个人。</li>
            <li><strong>不泄露隐私与商业秘密。</strong>真实姓名、联系方式、工号、未公开薪酬表、客户名单和 NDA 内容都会被删除。</li>
            <li><strong>公司可以回应。</strong>如果公司认为某条评价存在事实错误，可以通过 GitHub Issue 提交可核对的事实性回应。</li>
            <li><strong>编辑会保留修改痕迹。</strong>审核通过的评价写入仓库，修改与撤回都留在 Git 历史里。</li>
          </ul>

          <h2>数据与匿名性</h2>
          <p>站点是静态页面。提交表单会生成一个公开 GitHub Issue；编辑审核后，将评价写入 <code>data.js</code> 并重新部署。平台不收集账号、联系方式或浏览行为。</p>
          <p>匿名不等于无责任。请不要把 GitHub Issue 当作可以随意指控的空间；所有公开内容都可能被公司、同行和后来者看到。</p>

          <h2>免责声明</h2>
          <p class="about-disclaimer">所有评价仅代表投稿者个人经历与判断，不构成对任何公司的事实认定或法律结论。平台不保证评价真实、完整或最新。读者应自行交叉验证，并把评价放回具体岗位、团队与时间背景中理解。</p>
          ${DEMO_MODE ? '<div class="demo-callout"><span class="demo-chip">DEMO</span><p>当前榜单中的「示例·北辰」「示例·砺行」「示例·潮汐」及其评价均为虚构内容，仅用于展示页面结构，不代表任何真实公司。</p></div>' : ""}
        </article>
        <aside class="about-aside">
          <div class="aside-block aside-block--red">
            <span class="eyebrow">QUICK RULES</span>
            <h3>写评价前</h3>
            <ul>
              <li>第一人称经历</li>
              <li>三项评分 + 具体理由</li>
              <li>不写真实姓名与联系方式</li>
              <li>不写未公开信息</li>
              <li>允许编辑核对与修改</li>
            </ul>
          </div>
          <div class="aside-block">
            <span class="eyebrow">CONTACT</span>
            <p>规则建议、公司回应或内容申诉，请通过 GitHub Issues 提交。</p>
            <a href="${REPO_URL || "#"}/issues" target="_blank" rel="noopener">打开 Issues ↗</a>
          </div>
        </aside>
      </section>
    </div>`;
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
    if (parts[0] === "about") return { name: "about" };
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
  }

  function render() {
    const route = parseRoute();
    const titles = {
      home: "具身红黑榜 · 具身智能公司匿名评价",
      companies: "公司库 · 具身红黑榜",
      submit: "提交评价 · 具身红黑榜",
      about: "方法论 · 具身红黑榜",
      notfound: "页面不存在 · 具身红黑榜"
    };
    document.title = route.name === "company" ? `${route.company.name} · 具身红黑榜` : titles[route.name] || titles.notfound;
    closeMenu();
    if (route.name === "home") {
      main.innerHTML = renderHome();
      state.tab = "all";
      bindBoard();
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
    } else if (route.name === "about") {
      main.innerHTML = renderAbout();
      setActiveNav("about");
    } else {
      main.innerHTML = renderNotFound();
    }
    window.scrollTo(0, 0);
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

  bindShared();
  render();
})();
