// /api/jobs.js — v4
// Fix: search terms were too specific ("MBA 2026" not in job postings)
// Now uses broad terms, scores for relevance after fetching

const SEVENTY_TWO_HOURS = 72 * 60 * 60 * 1000;

// Broad Reed searches — job boards don't tag posts "MBA 2026"
const REED_SEARCHES = {
  strategy: [
    "strategy intern London",
    "corporate strategy internship London",
    "strategy analyst intern London",
  ],
  ceo_office: [
    "chief of staff London",
    "chief of staff intern London",
    "founder office intern London",
    "business operations intern London startup",
  ],
  pm: [
    "product manager intern London",
    "product management internship London",
    "associate product manager London",
  ],
  vc: [
    "venture capital intern London",
    "investment intern London",
    "VC analyst London",
    "private equity intern London",
  ],
};

// Broad Adzuna searches — same principle
const ADZUNA_SEARCHES = {
  strategy: [
    "strategy intern London",
    "corporate strategy internship London",
  ],
  ceo_office: [
    "chief of staff London",
    "chief of staff internship London",
  ],
  pm: [
    "product manager intern London",
    "product management internship London",
  ],
  vc: [
    "venture capital intern London",
    "investment analyst intern London",
  ],
};

async function reedSearch(keywords, apiKey) {
  const url = new URL("https://www.reed.co.uk/api/1.0/search");
  url.searchParams.set("keywords",             keywords);
  url.searchParams.set("locationName",         "London");
  url.searchParams.set("distancefromlocation", "15");
  url.searchParams.set("resultsToTake",        "10");

  const b64 = Buffer.from(`${apiKey}:`).toString("base64");
  const res = await fetch(url.toString(), {
    headers: { Authorization: `Basic ${b64}`, Accept: "application/json" },
    signal: AbortSignal.timeout(12000),
  });

  if (!res.ok) {
    const t = await res.text();
    throw new Error(`Reed ${res.status}: ${t.slice(0, 200)}`);
  }

  const data = await res.json();
  console.log(`Reed "${keywords}": ${(data.results||[]).length} raw results`);

  return (data.results || []).map(r => ({
    title:   r.jobTitle     || "",
    company: r.employerName || "",
    link:    r.jobUrl       || `https://www.reed.co.uk/jobs/${r.jobId}`,
    snippet: (r.jobDescription || "")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 300),
    salary:  r.minimumSalary
               ? `£${Math.round(r.minimumSalary/1000)}k–£${Math.round((r.maximumSalary||r.minimumSalary)/1000)}k`
               : null,
    date:    r.date   || null,
    source:  "reed",
  }));
}

async function adzunaSearch(what, appId, appKey) {
  const url = new URL("https://api.adzuna.com/v1/api/jobs/gb/search/1");
  url.searchParams.set("app_id",           appId);
  url.searchParams.set("app_key",          appKey);
  url.searchParams.set("what",             what);
  url.searchParams.set("where",            "London");
  url.searchParams.set("max_days_old",     "3");
  url.searchParams.set("results_per_page", "10");
  url.searchParams.set("sort_by",          "date");
  // NO category param — causes 400

  const res = await fetch(url.toString(), {
    signal: AbortSignal.timeout(12000),
  });

  if (!res.ok) {
    const t = await res.text();
    throw new Error(`Adzuna ${res.status}: ${t.slice(0, 200)}`);
  }

  const data = await res.json();
  console.log(`Adzuna "${what}": ${(data.results||[]).length} raw results`);

  return (data.results || []).map(r => ({
    title:   r.title                 || "",
    company: r.company?.display_name || "",
    link:    r.redirect_url          || "",
    snippet: (r.description || "")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 300),
    salary:  r.salary_min
               ? `£${Math.round(r.salary_min/1000)}k–£${Math.round((r.salary_max||r.salary_min)/1000)}k`
               : null,
    date:    r.created || null,
    source:  "adzuna",
  }));
}

function isRecent(dateStr) {
  if (!dateStr) return true; // no date = include it
  try { return (Date.now() - new Date(dateStr).getTime()) < SEVENTY_TWO_HOURS; }
  catch { return true; }
}

function dedupe(items) {
  const links = new Set();
  const keys  = new Set();
  return items.filter(item => {
    if (!item.link || !item.title) return false;
    if (links.has(item.link)) return false;
    links.add(item.link);
    const k = `${(item.company||"").toLowerCase().slice(0,20)}_${item.title.toLowerCase().slice(0,30)}`;
    if (keys.has(k)) return false;
    keys.add(k);
    return true;
  });
}

// Positive signals — we want intern/placement/grad roles
const BOOST  = ["intern","internship","placement","graduate","summer","junior","entry"];
// Negative signals — skip senior/permanent roles
const DEMOTE = ["senior","head of","director","vp ","vice president","manager,","lead,","permanent","full-time permanent"];

function score(item) {
  const t = `${item.title} ${item.snippet}`.toLowerCase();
  let s = 0;
  BOOST.forEach(w  => { if (t.includes(w)) s += 2; });
  DEMOTE.forEach(w => { if (t.includes(w)) s -= 3; });
  if (item.date)   s++;
  if (item.salary) s++;
  return s;
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();

  const { trackId } = req.body;
  if (!trackId) return res.status(400).json({ error: "trackId required" });

  const reedKey   = process.env.REED_API_KEY;
  const adzunaId  = process.env.ADZUNA_APP_ID;
  const adzunaKey = process.env.ADZUNA_APP_KEY;

  const all    = [];
  const errors = [];
  const missing = [];
  if (!reedKey)   missing.push("REED_API_KEY");
  if (!adzunaId)  missing.push("ADZUNA_APP_ID");
  if (!adzunaKey) missing.push("ADZUNA_APP_KEY");

  // Reed — run all queries for this track
  if (reedKey) {
    for (const kw of (REED_SEARCHES[trackId] || [])) {
      try {
        const hits = await reedSearch(kw, reedKey);
        all.push(...hits);
      } catch(e) {
        errors.push(`Reed "${kw}": ${e.message}`);
        console.error("Reed failed:", e.message);
      }
    }
  } else {
    errors.push("Reed skipped — REED_API_KEY not set");
  }

  // Adzuna
  if (adzunaId && adzunaKey) {
    for (const kw of (ADZUNA_SEARCHES[trackId] || [])) {
      try {
        const hits = await adzunaSearch(kw, adzunaId, adzunaKey);
        all.push(...hits);
      } catch(e) {
        errors.push(`Adzuna "${kw}": ${e.message}`);
        console.error("Adzuna failed:", e.message);
      }
    }
  } else {
    errors.push("Adzuna skipped — credentials missing");
  }

  const recent  = all.filter(r => isRecent(r.date));
  const deduped = dedupe(recent);
  const sorted  = deduped.sort((a, b) => score(b) - score(a));
  // Only return results with a positive score (genuinely intern-like)
  const relevant = sorted.filter(r => score(r) > 0);

  return res.status(200).json({
    results: relevant.slice(0, 12),
    debug: {
      trackId,
      missing_keys:     missing,
      errors,
      total_raw:        all.length,
      after_72h_filter: recent.length,
      after_dedupe:     deduped.length,
      after_scoring:    relevant.length,
      returned:         Math.min(relevant.length, 12),
    },
  });
}
