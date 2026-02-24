// /api/wellfound.js
// Fetches real Wellfound (AngelList) RSS feeds — no auth required
// Best source for CEO Office / CoS / VC roles at startups

const WELLFOUND_FEEDS = {
  strategy: [
    "https://wellfound.com/jobs/roles/strategy/locations/london.rss",
    "https://wellfound.com/jobs/roles/business-development/locations/london.rss",
  ],
  ceo_office: [
    "https://wellfound.com/jobs/roles/chief-of-staff/locations/london.rss",
    "https://wellfound.com/jobs/roles/operations/locations/london.rss",
    "https://wellfound.com/jobs/roles/business-operations/locations/london.rss",
  ],
  pm: [
    "https://wellfound.com/jobs/roles/product-manager/locations/london.rss",
  ],
  vc: [
    "https://wellfound.com/jobs/roles/venture-capital/locations/london.rss",
    "https://wellfound.com/jobs/roles/investments/locations/london.rss",
  ],
};

const SEVENTY_TWO_HOURS = 72 * 60 * 60 * 1000;

function parseRSSDate(str) {
  if (!str) return null;
  try { return new Date(str); } catch { return null; }
}

function isRecent(dateStr) {
  if (!dateStr) return true;
  const d = parseRSSDate(dateStr);
  if (!d) return true;
  return (Date.now() - d.getTime()) < SEVENTY_TWO_HOURS;
}

function extractBetween(xml, tag) {
  const re = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, "i");
  const m  = xml.match(re);
  return m ? m[1].replace(/<!\[CDATA\[|\]\]>/g, "").trim() : "";
}

function parseItems(xml) {
  const items = [];
  const itemRe = /<item>([\s\S]*?)<\/item>/gi;
  let m;
  while ((m = itemRe.exec(xml)) !== null) {
    const block   = m[1];
    const title   = extractBetween(block, "title");
    const link    = extractBetween(block, "link") || extractBetween(block, "guid");
    const desc    = extractBetween(block, "description").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").slice(0, 250);
    const pubDate = extractBetween(block, "pubDate");
    const company = extractBetween(block, "company") || "";

    if (title && link) {
      items.push({ title, link, snippet: desc, date: pubDate, company, source: "wellfound" });
    }
  }
  return items;
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();
  const { trackId } = req.body;
  if (!trackId) return res.status(400).json({ error: "trackId required" });

  const feeds  = WELLFOUND_FEEDS[trackId] || [];
  const all    = [];

  for (const feedUrl of feeds) {
    try {
      const r = await fetch(feedUrl, {
        headers: { "User-Agent": "Mozilla/5.0 (compatible; InternshipRadar/2.0)" },
        signal: AbortSignal.timeout(8000),
      });
      if (!r.ok) continue;
      const xml   = await r.text();
      const items = parseItems(xml);
      all.push(...items);
    } catch(e) {
      console.error(`Wellfound feed failed (${feedUrl}):`, e.message);
    }
  }

  // Filter to recent, dedupe by link
  const seen    = new Set();
  const results = all
    .filter(item => isRecent(item.date))
    .filter(item => {
      if (seen.has(item.link)) return false;
      seen.add(item.link);
      return true;
    })
    .slice(0, 8);

  return res.status(200).json({ results });
}
