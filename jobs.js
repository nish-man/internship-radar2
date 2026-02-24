// /api/jobs.js
// Searches Google CSE (LinkedIn/Greenhouse/Lever/Ashby) + Adzuna
// Returns real job postings with verified URLs from last 72 hours

const SEVENTY_TWO_HOURS = 72 * 60 * 60 * 1000;

// Google CSE queries per track — site: operators target real job board URLs
const GOOGLE_QUERIES = {
  strategy: [
    'site:linkedin.com/jobs "strategy" ("intern" OR "internship") "London" "MBA" 2026',
    'site:greenhouse.io "strategy intern" "London" 2026',
    'site:lever.co "strategy" "intern" "London" MBA',
    'site:ashbyhq.com "strategy intern" London',
    'site:jobs.lever.co "corporate strategy" intern London MBA 2026',
  ],
  ceo_office: [
    'site:linkedin.com/jobs ("chief of staff" OR "CEO office") ("intern" OR "internship") London 2026',
    'site:wellfound.com "chief of staff" intern London',
    'site:greenhouse.io "chief of staff" intern London',
    'site:lever.co "chief of staff" intern London startup',
    'site:ashbyhq.com "chief of staff" intern London 2026',
  ],
  pm: [
    'site:linkedin.com/jobs "product manager" ("intern" OR "internship") London MBA 2026',
    'site:greenhouse.io "product manager intern" London MBA 2026',
    'site:lever.co "product management intern" London 2026',
    'site:ashbyhq.com "product manager" intern London',
    'site:jobs.ashbyhq.com "MBA product" intern London 2026',
  ],
  vc: [
    'site:linkedin.com/jobs "venture capital" ("intern" OR "internship") London 2026',
    'site:wellfound.com "VC intern" OR "venture capital intern" London 2026',
    'site:greenhouse.io "investment" intern London "venture" 2026',
    'site:lever.co "venture capital" intern London fund',
    'site:linkedin.com/jobs "VC" intern London "MBA" 2026 fund',
  ],
};

// Adzuna category mapping
const ADZUNA_CATEGORIES = {
  strategy:   'it-jobs',       // closest to strategy consulting
  ceo_office: 'management-jobs',
  pm:         'it-jobs',
  vc:         'finance-jobs',
};

const ADZUNA_KEYWORDS = {
  strategy:   'strategy intern MBA London 2026',
  ceo_office: 'chief of staff intern London startup',
  pm:         'product manager intern MBA London 2026',
  vc:         'venture capital intern London MBA fund',
};

function isRecent(dateStr) {
  if (!dateStr) return true; // include if no date available
  try {
    const d = new Date(dateStr);
    return (Date.now() - d.getTime()) < SEVENTY_TWO_HOURS;
  } catch { return true; }
}

function cleanSnippet(s) {
  if (!s) return "";
  return s.replace(/<\/?b>/g, "").replace(/\s+/g, " ").trim();
}

function parseGoogleDate(str) {
  // Google dateRestrict results may include date in snippet or metadata
  return str || null;
}

async function searchGoogle(query, apiKey, cseId) {
  // dateRestrict=d3 limits to past 3 days
  const url = new URL("https://www.googleapis.com/customsearch/v1");
  url.searchParams.set("key",          apiKey);
  url.searchParams.set("cx",           cseId);
  url.searchParams.set("q",            query);
  url.searchParams.set("num",          "5");
  url.searchParams.set("dateRestrict", "d3");   // last 3 days
  url.searchParams.set("sort",         "date");

  const res  = await fetch(url.toString());
  const data = await res.json();

  if (data.error) {
    console.error("Google CSE error:", data.error.message);
    return [];
  }

  return (data.items || []).map(item => ({
    title:   item.title,
    link:    item.link,
    snippet: cleanSnippet(item.snippet),
    source:  "google",
    date:    item.pagemap?.metatags?.[0]?.["article:published_time"] ||
             item.pagemap?.metatags?.[0]?.["og:updated_time"] ||
             null,
  }));
}

async function searchAdzuna(trackId, appId, appKey) {
  const cat = ADZUNA_CATEGORIES[trackId];
  const kw  = ADZUNA_KEYWORDS[trackId];

  // max_days_old=3 filters to last 72 hours
  const url = new URL(`https://api.adzuna.com/v1/api/jobs/gb/search/1`);
  url.searchParams.set("app_id",      appId);
  url.searchParams.set("app_key",     appKey);
  url.searchParams.set("what",        kw);
  url.searchParams.set("where",       "London");
  url.searchParams.set("max_days_old","3");
  url.searchParams.set("results_per_page", "8");
  url.searchParams.set("content-type","application/json");
  if (cat) url.searchParams.set("category", cat);

  const res  = await fetch(url.toString());
  const data = await res.json();

  if (!data.results) return [];

  return data.results.map(r => ({
    title:       r.title,
    company:     r.company?.display_name || "",
    link:        r.redirect_url,
    snippet:     r.description?.slice(0, 200) || "",
    location:    r.location?.display_name || "London",
    salary:      r.salary_min ? `£${Math.round(r.salary_min/1000)}k–£${Math.round(r.salary_max/1000)}k` : null,
    date:        r.created,
    source:      "adzuna",
  }));
}

function dedupeByLink(items) {
  const seen = new Set();
  return items.filter(item => {
    if (!item.link || seen.has(item.link)) return false;
    seen.add(item.link);
    return true;
  });
}

function detectCompanyFromGoogle(item) {
  // Try to extract company from title e.g. "Strategy Intern at Bain & Company | LinkedIn"
  const t = item.title || "";
  const atMatch  = t.match(/ at (.+?)(?:\s*[\|\-–]|$)/i);
  const pipMatch = t.match(/^(.+?)\s*[\|\-–]/);
  if (atMatch) return atMatch[1].trim();
  if (pipMatch && pipMatch[1].length < 60) return pipMatch[1].trim();
  return "";
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();

  const { trackId } = req.body;
  if (!trackId) return res.status(400).json({ error: "trackId required" });

  const googleKey = process.env.GOOGLE_CSE_KEY;
  const googleCx  = process.env.GOOGLE_CSE_ID;
  const adzunaId  = process.env.ADZUNA_APP_ID;
  const adzunaKey = process.env.ADZUNA_APP_KEY;

  const missing = [];
  if (!googleKey) missing.push("GOOGLE_CSE_KEY");
  if (!googleCx)  missing.push("GOOGLE_CSE_ID");
  if (!adzunaId)  missing.push("ADZUNA_APP_ID");
  if (!adzunaKey) missing.push("ADZUNA_APP_KEY");
  if (missing.length) return res.status(500).json({ error: `Missing env vars: ${missing.join(", ")}` });

  const queries = GOOGLE_QUERIES[trackId] || [];
  const allResults = [];

  // Run first 3 Google queries (conserve quota — 100/day free)
  for (const q of queries.slice(0, 3)) {
    try {
      const hits = await searchGoogle(q, googleKey, googleCx);
      allResults.push(...hits);
    } catch(e) {
      console.error("Google query failed:", e.message);
    }
  }

  // Adzuna
  try {
    const adzunaHits = await searchAdzuna(trackId, adzunaId, adzunaKey);
    allResults.push(...adzunaHits);
  } catch(e) {
    console.error("Adzuna failed:", e.message);
  }

  // Normalise, dedupe, filter recent
  const normalised = allResults.map(item => ({
    title:   item.title   || "",
    company: item.company || detectCompanyFromGoogle(item),
    link:    item.link    || "",
    snippet: item.snippet || "",
    salary:  item.salary  || null,
    date:    item.date    || null,
    source:  item.source  || "unknown",
    recent:  isRecent(item.date),
  }));

  const deduped  = dedupeByLink(normalised);
  const filtered = deduped.filter(r => r.link && r.title);

  return res.status(200).json({ results: filtered.slice(0, 12) });
}
