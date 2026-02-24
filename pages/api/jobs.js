// /api/jobs.js — v3 FIXED
// Fixed: removed Adzuna category param (was causing all 400 errors)
// Fixed: graceful failures — one broken source won't kill everything
// Fixed: always returns 200 with debug info so you can diagnose from browser
// Sources: Reed UK API + Adzuna UK API

const SEVENTY_TWO_HOURS = 72 * 60 * 60 * 1000;

const REED_SEARCHES = {
  strategy: [
    "strategy intern MBA London 2026",
    "corporate strategy internship summer 2026 London",
  ],
  ceo_office: [
    "chief of staff intern London",
    "CEO office intern startup London",
  ],
  pm: [
    "product manager intern MBA London 2026",
    "associate product manager internship London 2026",
  ],
  vc: [
    "venture capital intern London 2026",
    "investment intern VC fund London MBA",
  ],
};

// NOTE: No category param — it was causing Adzuna to return 400 HTML error pages
const ADZUNA_SEARCHES = {
  strategy: [
    "strategy intern MBA London 2026",
    "corporate strategy internship London",
  ],
  ceo_office: [
    "chief of staff intern London startup",
    "chief of staff MBA internship London",
  ],
  pm: [
    "product manager intern MBA London 2026",
    "product management internship summer 2026 London",
  ],
  vc: [
    "venture capital intern London MBA 2026",
    "VC investment intern fund London",
  ],
};

async function reedSearch(keywords, apiKey) {
  const url = new URL("https://www.reed.co.uk/api/1.0/search");
  url.searchParams.set("keywords",             keywords);
  url.searchParams.set("locationName",         "London");
  url.searchParams.set("distancefromlocation", "10");
  url.searchParams.set("resultsToTake",        "8");

  const b64 = Buffer.from(`${apiKey}:`).toString("base64");
  const res = await fetch(url.toString(), {
    headers: { Authorization: `Basic ${b64}`, Accept: "application/json" },
    signal: AbortSignal.timeout(12000),
  });

  if (!res.ok) {
    const t = await res.text();
    throw new Error(`Reed ${res.status}: ${t.slice(0, 150)}`);
  }

  const data = await res.json();
  return (data.results || []).map(r => ({
    title:   r.jobTitle     || "",
    company: r.employerName || "",
    link:    r.jobUrl       || `https://www.reed.co.uk/jobs/${r.jobId}`,
    snippet: (r.jobDescription || "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 300),
    salary:  r.minimumSalary
               ? `£${Math.round(r.minimumSalary/1000)}k–£${Math.round((r.maximumSalary||r.minimumSalary)/1000)}k`
               : null,
    date:    r.date  || null,
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
  url.searchParams.set("results_per_page", "8");
  url.searchParams.set("sort_by",          "date");
  // NO category param — this was the bug causing 400 errors

  const res = await fetch(url.toString(), {
    signal: AbortSignal.timeout(12000),
  });

  if (!res.ok) {
    const t = await res.text();
    throw new Error(`Adzuna ${res.status}: ${t.slice(0, 150)}`);
  }

  const data = await res.json();
  return (data.results || []).map(r => ({
    title:   r.title                 || "",
    company: r.company?.display_name || "",
    link:    r.redirect_url          || "",
    snippet: (r.description || "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 300),
    salary:  r.salary_min
               ? `£${Math.round(r.salary_min/1000)}k–£${Math.round((r.salary_max||r.salary_min)/1000)}k`
               : null,
    date:    r.created || null,
    source:  "adzuna",
  }));
}

function isRecent(dateStr) {
  if (!dateStr) return true;
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

const GOOD = ["intern","internship","placement","summer","mba","graduate","2026"];
function score(item) {
  const t = `${item.title} ${item.snippet}`.toLowerCase();
  let s = 0;
  GOOD.forEach(w => { if (t.includes(w)) s++; });
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

  // Reed
  if (reedKey) {
    for (const kw of (REED_SEARCHES[trackId] || []).slice(0, 2)) {
      try {
        const hits = await reedSearch(kw, reedKey);
        all.push(...hits);
        console.log(`Reed "${kw}": ${hits.length} hits`);
      } catch(e) {
        errors.push(`Reed: ${e.message}`);
        console.error("Reed failed:", e.message);
      }
    }
  } else {
    errors.push("Reed skipped — REED_API_KEY missing");
  }

  // Adzuna
  if (adzunaId && adzunaKey) {
    for (const kw of (ADZUNA_SEARCHES[trackId] || [])) {
      try {
        const hits = await adzunaSearch(kw, adzunaId, adzunaKey);
        all.push(...hits);
        console.log(`Adzuna "${kw}": ${hits.length} hits`);
      } catch(e) {
        errors.push(`Adzuna: ${e.message}`);
        console.error("Adzuna failed:", e.message);
      }
    }
  } else {
    errors.push("Adzuna skipped — credentials missing");
  }

  const recent  = all.filter(r => isRecent(r.date));
  const deduped = dedupe(recent);
  const sorted  = deduped.sort((a, b) => score(b) - score(a));

  // Always 200 — debug block tells you exactly what happened
  return res.status(200).json({
    results: sorted.slice(0, 12),
    debug: {
      trackId,
      missing_keys:     missing,
      errors,
      total_raw:        all.length,
      after_72h_filter: recent.length,
      after_dedupe:     deduped.length,
      returned:         Math.min(sorted.length, 12),
    },
  });
}
