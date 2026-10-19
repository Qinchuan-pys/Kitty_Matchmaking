/* 猫耳剧集价格筛选器
 * CSV 文件路径：data/dramas.csv
 * 支持 UTF-8 / UTF-8 BOM、双引号字段、字段内逗号与换行。
 */
const CSV_PATH = "data/dramas.csv";
let dramas = [];
let filtered = [];

const $ = (id) => document.getElementById(id);
const FIELD_ALIASES = {
  id: ["id", "剧集id", "剧集 ID", "剧集ID"],
  title: ["剧名", "名称", "title", "name"],
  author: ["作者", "author"],
  type: ["剧集类型", "类型", "type"],
  needPay: ["need_pay", "need pay", "是否付费"],
  payMethod: ["付费方式", "付费类型", "pay_method"],
  price: ["价格", "price", "原价"],
  member: ["是否会员剧", "会员剧", "member"],
  hasDiscount: ["是否有会员折扣", "有无会员折扣", "has_discount"],
  plays: ["播放量", "播放数", "plays", "play_count"],
  episodes: ["总集数", "集数", "episodes"],
  tags: ["tags", "标签", "tag"],
  age: ["age", "年龄分级", "适龄"],
  discountRate: ["会员折扣率", "折扣率", "discount_rate"],
  discountPrice: ["会员折后价格", "会员折后价", "折后价格", "discount_price"],
  cv1: ["CV1", "cv1", "配音1"],
  cv2: ["CV2", "cv2", "配音2"]
};
const LABELS = {
  id: "ID", title: "剧名", author: "作者", type: "剧集类型", needPay: "need_pay",
  payMethod: "付费方式", price: "价格", member: "是否会员剧", hasDiscount: "是否有会员折扣",
  plays: "播放量", episodes: "总集数", tags: "tags", age: "age",
  discountRate: "会员折扣率", discountPrice: "会员折后价格", cv1: "CV1", cv2: "CV2"
};

function normalizeHeader(s) {
  return String(s ?? "").replace(/^\uFEFF/, "").trim().toLowerCase().replace(/[ _\-（）()]/g, "");
}
function parseCSV(text) {
  text = text.replace(/^\uFEFF/, "");
  const rows = [];
  let row = [], cell = "", quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (c === '"') quoted = false;
      else cell += c;
    } else {
      if (c === '"' && cell === "") quoted = true;
      else if (c === ",") { row.push(cell); cell = ""; }
      else if (c === "\n") { row.push(cell.replace(/\r$/, "")); rows.push(row); row = []; cell = ""; }
      else cell += c;
    }
  }
  if (cell.length || row.length) { row.push(cell.replace(/\r$/, "")); rows.push(row); }
  return rows.filter(r => r.some(v => String(v).trim() !== ""));
}
function numberValue(value) {
  if (value === null || value === undefined) return null;
  let s = String(value).trim().replace(/[,\s￥¥元]/g, "");
  if (!s || ["-", "--", "无", "未知", "null", "nan"].includes(s.toLowerCase())) return null;
  let multiplier = 1;
  if (/亿$/.test(s)) { multiplier = 100000000; s = s.slice(0, -1); }
  else if (/万$/.test(s)) { multiplier = 10000; s = s.slice(0, -1); }
  else if (/千$/.test(s)) { multiplier = 1000; s = s.slice(0, -1); }
  s = s.replace(/%$/, "");
  const n = Number(s);
  return Number.isFinite(n) ? n * multiplier : null;
}
function findColumn(headers, aliases) {
  const normHeaders = headers.map(normalizeHeader);
  for (const alias of aliases) {
    const idx = normHeaders.indexOf(normalizeHeader(alias));
    if (idx >= 0) return idx;
  }
  return -1;
}
function getCell(row, index) { return index >= 0 ? String(row[index] ?? "").trim() : ""; }
function splitMulti(value) {
  return String(value ?? "").split(/[、,，;；|/]+/).map(s => s.trim()).filter(Boolean);
}
function truthy(value) {
  const s = String(value ?? "").trim().toLowerCase();
  if (["1", "true", "yes", "y", "是", "有", "会员", "会员剧"].includes(s)) return true;
  if (["0", "false", "no", "n", "否", "无", "非会员", "非会员剧"].includes(s)) return false;
  return null;
}
function readBool(primary, fallback) {
  const a = truthy(primary);
  return a === null ? truthy(fallback) : a;
}
function fmtNumber(n) {
  if (n === null || n === undefined || !Number.isFinite(n)) return "—";
  return new Intl.NumberFormat("zh-CN", { maximumFractionDigits: 2 }).format(n);
}
function fmtPrice(n) { return n === null || n === undefined ? "—" : `¥${fmtNumber(n)}`; }
function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
function normalizeDrama(row, headers, indexes) {
  const raw = {};
  for (const [key, idx] of Object.entries(indexes)) raw[key] = getCell(row, idx);
  const price = numberValue(raw.price);
  const discountPrice = numberValue(raw.discountPrice);
  const plays = numberValue(raw.plays);
  const episodes = numberValue(raw.episodes);
  const discountRate = numberValue(raw.discountRate);
  const id = raw.id || "";
  const title = raw.title || "(未填写剧名)";
  const member = readBool(raw.member, raw.needPay);
  const hasDiscount = readBool(raw.hasDiscount, (discountPrice !== null && price !== null && discountPrice < price) ? "yes" : null);
  return {
    ...raw, id, title, price, discountPrice, plays, episodes, discountRate,
    member, hasDiscount,
    cvList: [...splitMulti(raw.cv1), ...splitMulti(raw.cv2)],
    tagList: splitMulti(raw.tags),
    raw
  };
}
function getSelectedValues(select) {
  return [...select.selectedOptions].map(o => o.value).filter(Boolean);
}
function fillMultiSelect(id, values, placeholder) {
  const select = $(id);
  select.innerHTML = "";
  const sorted = [...new Set(values.map(v => String(v).trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b, "zh-CN"));
  if (!sorted.length) {
    const option = document.createElement("option");
    option.disabled = true; option.textContent = `数据中没有${placeholder}`;
    select.appendChild(option); return;
  }
  for (const value of sorted) {
    const option = document.createElement("option");
    option.value = value; option.textContent = value;
    select.appendChild(option);
  }
}
function populateFilters() {
  fillMultiSelect("authors", dramas.map(d => d.author), "作者选项");
  fillMultiSelect("cvs", dramas.flatMap(d => d.cvList), "CV选项");
  fillMultiSelect("types", dramas.map(d => d.type), "类型选项");
}
function hasPreference() {
  return getSelectedValues($("authors")).length > 0 ||
    getSelectedValues($("cvs")).length > 0 ||
    getSelectedValues($("types")).length > 0 ||
    $("tagKeyword").value.trim() !== "";
}
function getPreferenceMatches(d) {
  const matched = [];
  const authors = getSelectedValues($("authors"));
  const cvs = getSelectedValues($("cvs"));
  const types = getSelectedValues($("types"));
  const tag = $("tagKeyword").value.trim().toLowerCase();
  if (authors.length && authors.some(a => d.author === a)) matched.push("作者");
  if (cvs.length && cvs.some(cv => d.cvList.includes(cv))) matched.push("CV");
  if (types.length && types.some(t => d.type === t)) matched.push("类型");
  if (tag && (d.tags || "").toLowerCase().includes(tag)) matched.push("标签");
  return matched;
}
function runFilter() {
  $("errorMessage").hidden = true;
  const minRaw = $("minPrice").value.trim(), maxRaw = $("maxPrice").value.trim();
  const min = minRaw === "" ? null : numberValue(minRaw);
  const max = maxRaw === "" ? null : numberValue(maxRaw);
  if (minRaw !== "" && min === null || maxRaw !== "" && max === null) {
    showError("价格请输入有效数字。"); return;
  }
  if (min !== null && max !== null && min > max) {
    showError("最低价格不能高于最高价格。"); return;
  }
  const keyword = $("keyword").value.trim().toLowerCase();
  const memberFilter = $("memberFilter").value;
  const discountFilter = $("discountFilter").value;
  const preferredSort = $("preferenceMode").value === "on" && hasPreference();
  const sortBy = $("sortBy").value;

  filtered = dramas.filter(d => {
    // 价格筛选使用原始「价格」字段；没有价格的数据不会被误认为在价格区间内。
    if (min !== null || max !== null) {
      if (d.price === null) return false;
      if (min !== null && d.price < min) return false;
      if (max !== null && d.price > max) return false;
    }
    if (keyword && !d.title.toLowerCase().includes(keyword)) return false;
    if (memberFilter === "yes" && d.member !== true) return false;
    if (memberFilter === "no" && d.member !== false) return false;
    if (discountFilter === "yes" && d.hasDiscount !== true) return false;
    if (discountFilter === "no" && d.hasDiscount !== false) return false;
    return true;
  }).map(d => ({ ...d, preferenceMatches: getPreferenceMatches(d) }));

  // 类型、作者、CV、标签作为偏好，不会剔除价格范围内的其他剧。
  filtered.sort((a, b) => {
    if (preferredSort && b.preferenceMatches.length !== a.preferenceMatches.length) {
      return b.preferenceMatches.length - a.preferenceMatches.length;
    }
    const [field, direction] = sortBy.split("-");
    let av, bv;
    if (field === "plays") { av = a.plays; bv = b.plays; }
    else if (field === "price") { av = a.price; bv = b.price; }
    else if (field === "discount") { av = a.discountPrice; bv = b.discountPrice; }
    else if (field === "episodes") { av = a.episodes; bv = b.episodes; }
    else { av = numberValue(a.age); bv = numberValue(b.age); }
    if (av === null && bv !== null) return 1;
    if (av !== null && bv === null) return -1;
    if (av !== null && bv !== null && av !== bv) return direction === "asc" ? av - bv : bv - av;
    return a.title.localeCompare(b.title, "zh-CN");
  });
  renderResults();
}
function runPairFilter() {
  const error = $("pairErrorMessage");
  error.hidden = true;
  const minRaw = $("pairMinPrice").value.trim();
  const maxRaw = $("pairMaxPrice").value.trim();
  const min = minRaw === "" ? null : numberValue(minRaw);
  const max = maxRaw === "" ? null : numberValue(maxRaw);
  if ((minRaw !== "" && min === null) || (maxRaw !== "" && max === null)) {
    error.textContent = "组合总价请输入有效数字。"; error.hidden = false; return;
  }
  if (min !== null && max !== null && min > max) {
    error.textContent = "组合总价最低值不能高于最高值。"; error.hidden = false; return;
  }
  if (min === null && max === null) {
    $("pairResultCount").textContent = "0";
    $("pairResults").innerHTML = "";
    $("pairEmptyState").hidden = false;
    return;
  }

  // 只使用有有效原价的剧；i < j 保证两部剧不同且同一组合不会重复出现。
  const priced = dramas.filter(d => d.price !== null && d.price >= 0);
  const pairs = [];
  for (let i = 0; i < priced.length; i++) {
    for (let j = i + 1; j < priced.length; j++) {
      const a = priced[i], b = priced[j];
      const total = Math.round((a.price + b.price) * 100) / 100;
      if (min !== null && total < min) continue;
      if (max !== null && total > max) continue;
      pairs.push({ a, b, total });
    }
  }
  pairs.sort((x, y) => x.total - y.total || x.a.title.localeCompare(y.a.title, "zh-CN") || x.b.title.localeCompare(y.b.title, "zh-CN"));
  $("pairResultCount").textContent = fmtNumber(pairs.length);
  $("pairResults").innerHTML = pairs.map((pair, index) => `
    <article class="pair-card">
      <div class="pair-rank">${String(index + 1).padStart(2, "0")}</div>
      <div class="pair-drama">
        <div class="pair-drama-title">${esc(pair.a.title)}</div>
        <div class="pair-drama-meta">${esc(pair.a.author || "作者未知")} · ${esc(pair.a.type || "类型未填写")}</div>
        <div class="pair-price">${fmtPrice(pair.a.price)}</div>
      </div>
      <div class="pair-operator" aria-label="加">＋</div>
      <div class="pair-drama">
        <div class="pair-drama-title">${esc(pair.b.title)}</div>
        <div class="pair-drama-meta">${esc(pair.b.author || "作者未知")} · ${esc(pair.b.type || "类型未填写")}</div>
        <div class="pair-price">${fmtPrice(pair.b.price)}</div>
      </div>
      <div class="pair-total"><span>合计原价</span><strong>${fmtPrice(pair.total)}</strong></div>
    </article>`).join("");
  $("pairEmptyState").hidden = pairs.length > 0;
}

function showError(message) { $("errorMessage").textContent = message; $("errorMessage").hidden = false; }
function detail(label, value) {
  return `<div class="detail"><div class="detail-label">${esc(label)}</div><div class="detail-value">${esc(value || "—")}</div></div>`;
}
function renderCard(d, index) {
  const matched = d.preferenceMatches || [];
  const preferred = matched.length > 0;
  const tags = [];
  if (d.type) tags.push(`<span class="tag">${esc(d.type)}</span>`);
  if (d.member === true) tags.push('<span class="tag gold">会员剧</span>');
  if (d.hasDiscount === true) tags.push('<span class="tag gold">会员折扣</span>');
  if (d.payMethod) tags.push(`<span class="tag">${esc(d.payMethod)}</span>`);
  const matchText = preferred ? `偏好匹配：${matched.map(esc).join("、")}` : (hasPreference() ? "未命中已选偏好，仍保留在结果中" : "未设置偏好条件");
  return `<article class="drama-card ${preferred ? "is-preferred" : ""}">
    <div class="card-top">
      <div class="rank-number">${String(index + 1).padStart(2, "0")}</div>
      <div class="card-title-wrap">
        <h3 class="drama-title">${esc(d.title)}</h3>
        <div class="drama-meta">${esc(d.author || "作者未知")} · ${esc([d.cv1, d.cv2].filter(Boolean).join(" / ") || "CV 未填写")}</div>
      </div>
      <div class="price-block">
        <div class="price">${fmtPrice(d.price)}</div>
        <div class="discount-price">会员折后 ${fmtPrice(d.discountPrice)}</div>
      </div>
    </div>
    <div class="tag-row">${tags.join("") || '<span class="tag">暂无分类信息</span>'}</div>
    <div class="match-line ${preferred ? "" : "muted"}">${matchText}</div>
    <div class="metrics">
      <div><div class="metric-label">播放量</div><div class="metric-value">${fmtNumber(d.plays)}</div></div>
      <div><div class="metric-label">总集数</div><div class="metric-value">${fmtNumber(d.episodes)}</div></div>
      <div><div class="metric-label">会员折扣率</div><div class="metric-value">${d.discountRate === null ? "—" : `${fmtNumber(d.discountRate)}${String(d.raw.discountRate || "").includes("%") ? "%" : ""}`}</div></div>
    </div>
    <div class="card-details">
      ${detail("剧集 ID", d.id)}
      ${detail("付费方式 / need_pay", [d.payMethod, d.needPay ? `need_pay=${d.needPay}` : ""].filter(Boolean).join(" · "))}
      ${detail("年龄分级", d.age)}
      ${detail("标签", d.tags)}
    </div>
  </article>`;
}
function renderResults() {
  $("resultCount").textContent = fmtNumber(filtered.length);
  $("results").innerHTML = filtered.map(renderCard).join("");
  $("emptyState").hidden = filtered.length !== 0;
}
function resetFilters() {
  ["minPrice", "maxPrice", "keyword", "tagKeyword"].forEach(id => $(id).value = "");
  ["authors", "cvs", "types"].forEach(id => [...$(id).options].forEach(o => o.selected = false));
  $("memberFilter").value = "";
  $("discountFilter").value = "";
  $("preferenceMode").value = "on";
  $("sortBy").value = "plays-desc";
  runFilter();
}
async function loadData() {
  try {
    const response = await fetch(CSV_PATH, { cache: "no-store" });
    if (!response.ok) throw new Error(`读取 ${CSV_PATH} 失败（HTTP ${response.status}）`);
    const text = await response.text();
    const rows = parseCSV(text);
    if (rows.length < 2) throw new Error("CSV 没有数据行，请检查 data/dramas.csv。");
    const headers = rows[0];
    const indexes = {};
    for (const [key, aliases] of Object.entries(FIELD_ALIASES)) indexes[key] = findColumn(headers, aliases);
    if (indexes.title < 0) throw new Error("CSV 中找不到「剧名」列，请检查表头。");
    if (indexes.price < 0) throw new Error("CSV 中找不到「价格」列，请检查表头。");
    dramas = rows.slice(1).map(row => normalizeDrama(row, headers, indexes)).filter(d => d.title && d.title !== "(未填写剧名)");
    populateFilters();
    $("dataStatus").textContent = `已读取 ${fmtNumber(dramas.length)} 部剧`;
    runFilter();
    runPairFilter();
  } catch (error) {
    $("dataStatus").textContent = "数据读取失败";
    showError(`${error.message}。请确认 CSV 已提交到仓库的 data/dramas.csv，并通过 GitHub Pages 地址访问网页。`);
    $("emptyState").hidden = false;
    $("emptyState").querySelector("h3").textContent = "暂时无法加载剧集数据";
    $("emptyState").querySelector("p").textContent = "请检查 CSV 路径、表头和 GitHub Pages 部署状态。";
  }
}

$("applyButton").addEventListener("click", runFilter);
$("pairApplyButton").addEventListener("click", runPairFilter);
["pairMinPrice", "pairMaxPrice"].forEach(id => {
  $(id).addEventListener("input", () => {
    window.clearTimeout(window.__pairFilterTimer);
    window.__pairFilterTimer = window.setTimeout(runPairFilter, 160);
  });
  $(id).addEventListener("change", runPairFilter);
});
$("resetButton").addEventListener("click", resetFilters);
["minPrice", "maxPrice", "keyword", "tagKeyword", "memberFilter", "discountFilter", "preferenceMode", "sortBy", "authors", "cvs", "types"].forEach(id => {
  $(id).addEventListener("change", runFilter);
});
["minPrice", "maxPrice", "keyword", "tagKeyword"].forEach(id => {
  $(id).addEventListener("input", () => {
    window.clearTimeout(window.__filterTimer);
    window.__filterTimer = window.setTimeout(runFilter, 160);
  });
});
loadData();
