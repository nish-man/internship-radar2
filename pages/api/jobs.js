// /api/jobs.js
// Real job data from Reed.co.uk API + Adzuna UK API
// Both have genuine 72-hour date filtering and London coverage
// No Google CSE — LinkedIn blocking made it useless for job search

const SEVENTY_TWO_HOURS = 72 * 60 * 60 * 1000;

/* ─── REED CONFIG ───────────────────────────────────────
   Reed is the UK's largest job board. Free API, 250 req/day.
   Docs: reed.co.uk/developers/jobseeker
──────────────────────────────────────────────────────── */
const REED_SEARCHES = {
  strategy: [
    { keywords: "strategy intern MBA", locationName: "London" },
    { keywords: "corporate strategy internship MBA 2026", locationName: "London" },
    { keywords: "strategy associate intern summer 2026", locationName: "London" },
  ],
  ceo_office: [
    { keywords: "chief of staff intern", locationName: "London" },
    { keywords: "chief of staff MBA internship", locationName: "London" },
    { keywords: "CEO office intern startup", locationName: "London" },
    { keywords: "business operations intern founder office", locationName: "London" },
  ],
  pm: [
    { keywords: "product manager intern MBA 2026", locationName: "London" },
    { keywords: "product management internship summer 2026", locationName: "London" },
    { keywords: "associate product manager intern", locationName: "London" },
    { keywords: "MBA product intern tech AI", locationName: "London" },
  ],
  vc: [
    { keywords: "venture capital intern summer 2026", locationName: "London" },
    { keywords: "investment intern VC fund MBA", locationName: "London" },
    { keywords: "private equity intern MBA London 2026", locationName: "London" },
    { keywords: "VC analyst intern fund 2026", locationName: "London" },
  ],
};

/* ─── ADZUNA CONFIG ─────────────────────────────────────
   Adzuna aggregates Indeed, Guardian Jobs, company sites.
   Free: 250 calls/day. max_days_old=3 = genuine 72h filter.
   Docs: developer.adzuna.com
──────────────────────────────────────────────────────── */
const ADZUNA_SEARCHES = {
  strategy: [
    { what: "strategy intern MBA summer 2026", category: "management-jobs" },
    { what: "corporate strategy internship London MBA", category: "management-jobs" },
  ],
  ceo_office: [
    { what: "chief of staff intern London startup", category: "management-jobs" },
    { what: "CEO office intern MBA operations", category: "management-jobs" },
  ],
  pm: [
    { what: "product manager intern MBA 2026 London", category: "it-jobs" },
    { what: "associate product manager intern summer 2026", category: "it-jobs" },
  ],
  vc: [
    { what: "venture capital intern MBA London 2026", category: "finance-jobs" },
    { what: "investment intern VC fund London", category: "finance-jobs" },
  ],
};

/* ─── REED FETCH ───────────────────────────────────────── */
async function searchReed(params, apiKey) {
  const url = new URL("https://www.reed.co.uk/api/1.0/search");
  url.searchParams.set("keywords",     params.keywords);
  url.searchParams.set("locationName", params.locationName || "London");
  url.searchParams.set("resultsToTake","10");
  url.searchParams.set("resultsToSkip","0");

  // Reed Basic Auth — API key as username, empty password
  const credentials = Buffer.from(`${apiKey}:`).toString("base64");

  const res = await fetch(url.toString(), {
    headers: {
      Authorization: `Basic ${credentials}`,
      Accept: "application/json",
    },
    signal: AbortSignal.timeout(10000),
  });

  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`Reed ${res.status}: ${txt.slice(0, 120)}`);
  }

  const data = await res.json();
  return (data.results || []).map(r => ({
    title:    r.jobTitle     || "",
    company:  r.employerName || "",
    link:     r.jobUrl       || `https://www.reed.co.uk/jobs/${r.jobId}`,
    snippet:  (r.jobDescription || "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").slice(0, 300),
    location: r.locationName || "London",
    salary:   r.minimumSalary
                ? `£${Math.round(r.minimumSalary/1000)}k–£${Math.round((r.maximumSalary||r.minimumSalary)/1000)}k`
                : null,
    date:     r.date || null,
    source:   "reed",
  }));
}

/* ─── ADZUNA FETCH ─────────────────────────────────────── */
async function searchAdzuna(params, appId, appKey) {
  const url = new URL("https://api.adzuna.com/v1/api/jobs/gb/search/1");
  url.searchParams.set("app_id",           appId);
  url.searchParams.set("app_key",          appKey);
  url.searchParams.set("what",             params.what);
  url.searchParams.set("where",            "London");
  url.searchParams.set("max_days_old",     "3");
  url.searchParams.set("results_per_page", "8");
  url.searchParams.set("sort_by",          "date");
  if (params.category) url.searchParams.set("category", params.category);

  const res = await fetch(url.toString(), {
    signal: AbortSignal.timeout(10000),
  });

  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`Adzuna ${res.status}: ${txt.slice(0, 120)}`);
  }

  const data = await res.json();
  return (data.results || []).map(r => ({
    title:    r.title                     || "",
    company:  r.company?.display_name     || "",
    link:     r.redirect_url              || "",
    snippet:  (r.description || "").slice(0, 300),
    location: r.location?.display_name   || "London",
    salary:   r.salary_min
                ? `£${Math.round(r.salary_min/1000)}k–£${Math.round((r.salary_max||r.salary_min)/1000)}k`
                : null,
    date:     r.created || null,
    source:   "adzuna",
  }));
}

/* ─── DATE FILTER ──────────────────────────────────────── */
function isWithin72Hours(dateStr) {
  if (!dateStr) return true; // include if no date — better to show than miss
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return true;
    return (Date.now() - d.getTime()) < SEVENTY_TWO_HOURS;
  } catch { return true; }
}

/* ─── DEDUPE ───────────────────────────────────────────── */
function dedupe(items) {
  const seenLinks    = new Set();
  const seenTitles   = new Set();
  return items.filter(item => {
    if (!item.link || !item.title) return false;
    // Dedupe by exact link
    if (seenLinks.has(item.link)) return false;
    seenLinks.add(item.link);
    // Dedupe by "company + role title" to catch same job on multiple boards
    const key = `${item.company?.toLowerCase()}_${item.title?.toLowerCase().slice(0,40)}`;
    if (seenTitles.has(key)) return false;
    seenTitles.add(key);
    return true;
  });
}

/* ─── SCORE (surface most relevant first) ─────────────── */
const INTERN_TERMS = ["intern", "internship", "placement", "graduate", "summer", "mba"];
const MBA_TERMS    = ["mba", "graduate", "postgraduate", "masters"];

function scoreResult(item) {
  const t = (item.title + " " + item.snippet).toLowerCase();
  let score = 0;
  if (INTERN_TERMS.some(w => t.includes(w))) score += 3;
  if (MBA_TERMS.some(w => t.includes(w)))    score += 2;
  if (item.date)                             score += 1; // has a date = confirmed real listing
  if (item.salary)                           score += 1;
  return score;
}

/* ─── MAIN HANDLER ─────────────────────────────────────── */
export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();

  const { trackId } = req.body;
  if (!trackId) return res.status(400).json({ error: "trackId required" });

  const reedKey   = process.env.REED_API_KEY;
  const adzunaId  = process.env.ADZUNA_APP_ID;
  const adzunaKey = process.env.ADZUNA_APP_KEY;

  // Report which keys are missing so Vercel logs show exact problem
  const missing = [];
  if (!reedKey)   missing.push("REED_API_KEY");
  if (!adzunaId)  missing.push("ADZUNA_APP_ID");
  if (!adzunaKey) missing.push("ADZUNA_APP_KEY");
  if (missing.length) {
    return res.status(500).json({
      error: `Missing environment variables: ${missing.join(", ")}. Add these in Vercel → Settings → Environment Variables then redeploy.`
    });
  }

  const reedSearches   = REED_SEARCHES[trackId]   || [];
  const adzunaSearches = ADZUNA_SEARCHES[trackId]  || [];
  const all            = [];
  const errors         = [];

  // ── Reed searches (run first 2 to conserve quota) ──
  for (const params of reedSearches.slice(0, 2)) {
    try {
      const hits = await searchReed(params, reedKey);
      all.push(...hits);
    } catch(e) {
      errors.push(`Reed: ${e.message}`);
      console.error("Reed search failed:", e.message);
    }
  }

  // ── Adzuna searches ──
  for (const params of adzunaSearches) {
    try {
      const hits = await searchAdzuna(params, adzunaId, adzunaKey);
      all.push(...hits);
    } catch(e) {
      errors.push(`Adzuna: ${e.message}`);
      console.error("Adzuna search failed:", e.message);
    }
  }

  if (all.length === 0 && errors.length > 0) {
    return res.status(500).json({ error: errors.join(" | ") });
  }

  // Filter, dedupe, score, return top 12
  const filtered = all.filter(r => isWithin72Hours(r.date));
  const deduped  = dedupe(filtered);
  const scored   = deduped.sort((a, b) => scoreResult(b) - scoreResult(a));

  return res.status(200).json({
    results: scored.slice(0, 12),
    debug: {
      total_before_filter: all.length,
      after_72h_filter:    filtered.length,
      after_dedupe:        deduped.length,
      errors:              errors,
    },
  });
}
