// /api/jobs.js — v5
// Searches exact MBA-level job titles across Reed + Adzuna
// Covers: VC, Strategy, CoS, PM, Growth, GTM, Program Manager

const SEVENTY_TWO_HOURS = 72 * 60 * 60 * 1000;

// Exact job titles that actually appear in MBA internship postings
const REED_SEARCHES = {
  strategy: [
    "strategy intern",
    "strategy internship",
    "corporate strategy intern",
    "strategy associate intern",
    "business strategy intern",
    "strategic planning intern",
    "management consulting intern",
    "consulting intern",
  ],
  ceo_office: [
    "chief of staff intern",
    "chief of staff internship",
    "CEO office intern",
    "founder office intern",
    "chief of staff associate",
    "operations intern startup",
    "program manager intern",
    "programme manager intern",
    "business operations intern",
    "growth intern",
    "GTM intern",
    "go to market intern",
  ],
  pm: [
    "product manager intern",
    "product management intern",
    "product management internship",
    "associate product manager",
    "product intern",
    "product strategy intern",
    "product operations intern",
    "growth product manager intern",
  ],
  vc: [
    "venture capital intern",
    "venture capital internship",
    "VC intern",
    "investment analyst intern",
    "investment associate intern",
    "venture analyst intern",
    "startup investor intern",
    "private equity intern",
    "growth equity intern",
  ],
};

const ADZUNA_SEARCHES = {
  strategy: [
    "strategy intern",
    "corporate strategy intern",
    "management consulting intern",
    "strategic planning intern",
    "strategy associate intern",
  ],
  ceo_office: [
    "chief of staff intern",
    "chief of staff internship",
    "program manager intern",
    "growth intern",
    "GTM intern",
    "business operations intern startup",
    "CEO office intern",
  ],
  pm: [
    "product manager intern",
    "product management internship",
    "associate product manager",
    "product intern",
    "product strategy intern",
  ],
  vc: [
    "venture capital intern",
    "VC intern",
    "investment analyst intern",
    "investment associate intern",
    "private equity intern",
  ],
};

// If a result contains ANY of these in the title it's immediately relevant
const TITLE_MUST_INCLUDE = [
  "intern","internship","placement","graduate scheme","associate",
  "junior","analyst","trainee",
];

// Strong positive signals in title or snippet
const BOOST_TITLE  = ["intern","internship","placement","summer","graduate","associate","junior","trainee","scheme"];
const BOOST_TEXT   = ["mba","business school","graduate","summer 2026","internship","placement"];

// These in the TITLE mean it's a senior perm role — skip it
const DEMOTE_TITLE = [
  "senior","head of","director","vp ","vice president",
  "principal","partner","managing","cto","coo","cfo","ceo ",
  "lead,","lead -","lead –","manager,","manager -",
  "permanent","full-time","contract","freelance",
];

async function reedSearch(keywords, apiKey) {
  const url = new URL("https://www.reed.co.uk/api/1.0/search");
  url.searchParams.set("keywords",             keywords);
  url.searchParams.set("locationName",         "London");
  url.searchParams.set("distancefromlocation", "20");
  url.searchParams.set("resultsToTake",        "10");
  // graduated=true filters for graduate/intern posts on Reed
  url.searchParams.set("graduate",             "true");

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
  console.log(`Reed "${keywords}": ${(data.results||[]).length} raw`);

  return (data.results || []).map(r => ({
    title:   r.jobTitle     || "",
    company: r.employerName || "",
    link:    r.jobUrl       || `https://www.reed.co.uk/jobs/${r.jobId}`,
    snippet: (r.jobDescription || "")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 400),
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
  // what_or for broader matching
  url.searchParams.set("what_or",          "intern internship placement graduate");

  const res = await fetch(url.toString(), {
    signal: AbortSignal.timeout(12000),
  });

  if (!res.ok) {
    const t = await res.text();
    throw new Error(`Adzuna ${res.status}: ${t.slice(0, 200)}`);
  }

  const data = await res.json();
  console.log(`Adzuna "${what}": ${(data.results||[]).length} raw`);

  return (data.results || []).map(r => ({
    title:   r.title                 || "",
    company: r.company?.display_name || "",
    link:    r.redirect_url          || "",
    snippet: (r.description || "")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 400),
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
    const k = `${(item.company||"").toLowerCase().slice(0,20)}_${item.title.toLowerCase().slice(0,35)}`;
    if (keys.has(k)) return false;
    keys.add(k);
    return true;
  });
}

function score(item) {
  const title   = (item.title   || "").toLowerCase();
  const snippet = (item.snippet || "").toLowerCase();
  const full    = `${title} ${snippet}`;
  let s = 0;

  // Hard demote — title signals it's a senior/perm role
  if (DEMOTE_TITLE.some(w => title.includes(w))) return -99;

  // Title boosts are worth more
  BOOST_TITLE.forEach(w => { if (title.includes(w))   s += 3; });
  // Text boosts
  BOOST_TEXT.forEach(w  => { if (snippet.includes(w)) s += 1; });

  // London signal
  if (full.includes("london")) s += 1;

  // Has real data
  if (item.date)   s++;
  if (item.salary) s++;

  return s;
}

function isRelevantTitle(title) {
  const t = title.toLowerCase();
  return TITLE_MUST_INCLUDE.some(w => t.includes(w));
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

  // Filter pipeline
  const recent   = all.filter(r => isRecent(r.date));
  const deduped  = dedupe(recent);
  const scored   = deduped
    .map(r => ({ ...r, _score: score(r) }))
    .filter(r => r._score > 0 && isRelevantTitle(r.title))
    .sort((a, b) => b._score - a._score);

  return res.status(200).json({
    results: scored.slice(0, 15),
    debug: {
      trackId,
      missing_keys:     missing,
      errors,
      total_raw:        all.length,
      after_72h_filter: recent.length,
      after_dedupe:     deduped.length,
      after_scoring:    scored.length,
      returned:         Math.min(scored.length, 15),
      // Show top 5 titles so you can see what's coming through
      sample_titles:    scored.slice(0, 5).map(r => `[${r._score}] ${r.title} @ ${r.company}`),
    },
  });
}
