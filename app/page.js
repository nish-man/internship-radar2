
"use client";
import { useState, useEffect, useRef, useCallback } from "react";

/* ════════════════════════════════════════════════════════════
   CONSTANTS
════════════════════════════════════════════════════════════ */
const PROFILE = {
  name: "Nishant",
  sig: "Nishant\nMBA 2027, London Business School (Vodafone Foundation Scholar)\nnishantm.mba2027@london.edu",
  bg: `6 years at Schneider Electric — most recently Strategy & Governance Lead: built 5-year digital strategy, $100M productivity roadmap, $55M savings across 80+ initiatives, architected AI transformation roadmap with the CSO's office (20+ use cases, 45% AI adoption increase). Before that Product Manager: global intelligence platform 100K+ users across 80 countries generating $24M annual value, redesigned the $30B Energy Management platform (MAU +20%, conversion +12%, 80% faster time-to-market). Also Chief of Staff at MEOBYR (AI retail startup London): built investor strategy, extended runway 12 months, £120K pipeline. LBS: leads VC & Incubator Treks for the Entrepreneurship Club, Chief of Staff at Consulting Club, INSEAD Product Games finalist (top 4 of 80+). Engineering undergrad in Electronics & Communications from VIT India. Deep expertise in Enterprise AI, B2B SaaS, Energy/Climate Tech, Industrial Automation, Emerging Markets.`,
};

const TRACKS = [
  { id: "strategy",   label: "Strategy",         short: "STR", icon: "◈", color: "#5B8DEF", rgb: "91,141,239",  tagline: "Corporate & MBB" },
  { id: "ceo_office", label: "CEO Office / CoS", short: "COS", icon: "⚡", color: "#9B7EDE", rgb: "155,126,222", tagline: "Startups & Scale-ups" },
  { id: "pm",         label: "Product",          short: "PM",  icon: "⬡", color: "#2EC4B6", rgb: "46,196,182",  tagline: "Tech & AI" },
  { id: "vc",         label: "Venture Capital",  short: "VC",  icon: "◎", color: "#F5A623", rgb: "245,166,35",  tagline: "Funds & Firms" },
];

const STATUSES = [
  { label: "To Apply",    color: "#5B8DEF", bg: "rgba(91,141,239,0.1)"  },
  { label: "Reached Out", color: "#F5A623", bg: "rgba(245,166,35,0.1)"  },
  { label: "Interview",   color: "#2EC4B6", bg: "rgba(46,196,182,0.1)"  },
  { label: "Offer",       color: "#3DBA8F", bg: "rgba(61,186,143,0.1)"  },
  { label: "Rejected",    color: "#444",    bg: "rgba(68,68,68,0.1)"    },
];

const NOTION_DB_ID = "fd3725f2-e3cb-479d-ba9e-1b022ec2e12f";

/* ════════════════════════════════════════════════════════════
   API
════════════════════════════════════════════════════════════ */
async function askClaude(messages, useSearch = false) {
  const res = await fetch("/api/claude", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ messages, useSearch }),
  });
  const data = await res.json();
  if (data.error) throw new Error(data.error);
  return data.text;
}

async function searchTrack(track) {
  const date = new Date().toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
  const kw = {
    strategy:   "MBA corporate strategy intern summer 2026 London",
    ceo_office: "chief of staff intern MBA startup 2026 London founder",
    pm:         "MBA product manager intern summer 2026 London tech AI",
    vc:         "venture capital intern summer 2026 London MBA fund",
  }[track.id];

  const msg = `Today is ${date}.

Search for internship job postings live right now on LinkedIn, Wellfound, Otta, Glassdoor, and company career pages. Focus on postings published in the last 72 hours.
.

Search terms: ${kw}
Target: MBA-level or postgraduate internship roles suitable for summer 2026 or flexible start dates, London or remote-friendly, suitable for a student graduating 2027.

Return ONLY a raw JSON array — no markdown, no code fences, no explanation:

IMPORTANT:
The "link" MUST be the actual job posting page URL where the role is publicly listed.
DO NOT generate or guess apply links.
DO NOT link to the company homepage.
Use only:
• LinkedIn job post URLs
• Otta job pages
• Wellfound role listings
• Official company careers pages
If a verified posting URL cannot be found, return an empty string "" for link.

[{"company":"Name","role":"Exact Job Title","link":"Verified public posting URL","contact":"recruiter or founder name if found, else empty string","details":"2-3 sentences about the company and what this role involves","sector":"e.g. Enterprise AI / Fintech / Climate Tech","vcThesis":"if VC fund, their stated investment thesis, else empty string"}]

Only include postings that appear recently open and currently accepting applications. Maximum 15 results. If none found return [].`;

  const raw = await askClaude([{ role: "user", content: msg }], true);
  try {
    const s = raw.indexOf("["), e = raw.lastIndexOf("]");
    if (s === -1) return [];
    return JSON.parse(raw.slice(s, e + 1)).slice(0, 5);
  } catch { return []; }
}

function buildEmailPrompt(trackId, company, role, details) {
  const rules = `CANDIDATE: ${PROFILE.bg}

STRICT RULES — follow every one:
• No em dashes anywhere
• No colon mid-sentence
• DO NOT open with asking for an internship. Lead with their world first.
• The internship ask appears naturally 2/3 through the email, never as the opener
• Direct, confident, human tone — no corporate filler, no "I hope this finds you well"
• Numbers written as words (e.g. "six years" not "6 years")
• End with: Would a 20-minute call work?
• Sign off EXACTLY: ${PROFILE.sig}

OUTPUT FORMAT — nothing before or after:
SUBJECT: [your subject line here]

[email body here]`;

  const p = {
    strategy: `${rules}

Write a cold email to someone in the strategy team at ${company} about a ${role} internship.
COMPANY CONTEXT: ${details}

STRUCTURE:
1. One crisp, specific observation about ${company}'s recent strategic move, expansion or challenge. It must come from the context. Feel like you've been genuinely watching them.
2. Connect to Nishant's Schneider strategy experience in 2 fluid sentences — no bullet points.
3. LBS MBA brief mention. Offer to share a short written perspective on one specific area before the call.
4. Close with: Would a 20-minute call work?

SUBJECT LINE STYLE: "A thought on [Company]'s [specific move or challenge]"`,

    ceo_office: `${rules}

Write a cold email to the founder or CEO of ${company} about a ${role} internship.
COMPANY CONTEXT: ${details}

STRUCTURE:
1. Open with a specific, researched observation about where ${company} is right now — their stage, a challenge, a milestone. Feel like you've read their recent writing or interviews.
2. "I've been in that room." Then weave in: CoS at MEOBYR (AI startup London, built investor strategy, extended runway 12 months) AND Schneider (aligned 15 global leaders on a hundred-million-dollar roadmap — the politics were harder than the analysis). Fluid prose, not a list.
3. One crisp sentence on what he's actually good at in that role.
4. LBS MBA brief mention. Offer one specific idea around a ${company} challenge. 
5. Close with: Would a 20-minute call work?

SUBJECT LINE OPTIONS: "Re: ${company} and something I noticed" OR "${company} — a thought from the inside out"`,

    pm: `${rules}

Write a cold email to the PM or product lead at ${company} about a ${role} internship.
COMPANY CONTEXT: ${details}

STRUCTURE:
1. Open with a specific product observation from genuinely studying ${company}'s product — a friction point, a design gap, a user journey tension. Name your hypothesis about why it exists.
2. Connect to Schneider PM experience in 2 fluid sentences (four years, global intelligence platform, hundred thousand users across eighty countries, twenty-four million dollars in annual value).
3. INSEAD Product Games finalist. Offer to write up the observation as a note before the call. Brief LBS MBA mention.
4. Close with: Would a 20-minute conversation work?

SUBJECT LINE STYLE: "A user journey I kept getting stuck on in [Product name]"`,

    vc: `${rules}

Write a cold email to a partner or principal at ${company} about a summer internship.
COMPANY CONTEXT: ${details}

First determine this fund's investment thesis from context. Then pick the single most relevant operator lens from these options:
- Enterprise AI / B2B SaaS: evaluated 20+ AI use cases at Schneider, understands what gets bought vs killed in committee
- Climate / Energy Tech: owned the thirty-billion-dollar Schneider Energy Management platform, knows enterprise energy buyer psychology firsthand
- Deep Tech / Hardware: ECE engineering background, built industrial automation systems at Schneider
- Emerging Markets / India: ran India market entry for a European enterprise firm, fifty million in identified revenue opportunities

STRUCTURE:
1. Open with a sharp market insight specific to THIS fund's thesis — must feel like genuine operator knowledge, not a pitch. Mention one specific portfolio company or recent investment.
2. Relevant background parts only. LBS MBA + VC & Incubator Treks Lead — one sentence.
3. Summer contribution angle: sourcing, diligence, founder support. Operator lens.
4. Close with: Would a 20-minute call be worth it?

SUBJECT LINE STYLE: "A pattern I keep seeing in [their specific sector]"`,
  };
  return (p[trackId] || p.strategy);
}

async function genEmail(trackId, p) {
  const ctx = `${p.details} Sector: ${p.sector}.${p.vcThesis ? " Fund thesis: " + p.vcThesis : ""}`;
  const raw = await askClaude([{ role: "user", content: buildEmailPrompt(trackId, p.company, p.role, ctx) }]);
  const lines = raw.split("\n");
  const si = lines.findIndex(l => l.startsWith("SUBJECT:"));
  const subject = si >= 0 ? lines[si].replace("SUBJECT:", "").trim() : `MBA Internship – ${p.company}`;
  const body = lines.slice(si >= 0 ? si + 1 : 0).join("\n").replace(/^\s*\n/, "").trimEnd();
  return { subject, body };
}

async function pushNotion(token, dbId, item) {
  const r = await fetch("https://api.notion.com/v1/pages", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", "Notion-Version": "2022-06-28" },
    body: JSON.stringify({
      parent: { database_id: dbId },
      properties: {
        "Role Title":       { title:     [{ text: { content: item.role    } }] },
        "Company":          { rich_text: [{ text: { content: item.company } }] },
        "Track":            { select:    { name: item.trackLabel } },
        "Application Link": { url: item.link || null },
        "Contact Name":     { rich_text: [{ text: { content: item.contact || "" } }] },
        "Sector Thesis":    { rich_text: [{ text: { content: item.sector  || "" } }] },
        "Subject Line":     { rich_text: [{ text: { content: item.subject } }] },
        "Draft Email":      { rich_text: [{ text: { content: item.body.slice(0, 2000) } }] },
        "Status":           { select:    { name: "To Apply" } },
      },
    }),
  });
  if (!r.ok) { const e = await r.json(); throw new Error(e.message || "Notion write failed"); }
}

/* ════════════════════════════════════════════════════════════
   ROOT APP
════════════════════════════════════════════════════════════ */
export default function RadarApp() {
  const [results,     setResults]     = useState([]);
  const [loading,     setLoading]     = useState(false);
  const [logs,        setLogs]        = useState([]);
  const [activeTab,   setActiveTab]   = useState("all");
  const [view,        setView]        = useState("cards");
  const [expanded,    setExpanded]    = useState(null);
  const [copied,      setCopied]      = useState({});
  const [pushing,     setPushing]     = useState({});
  const [pushed,      setPushed]      = useState({});
  const [statusMap,   setStatusMap]   = useState({});
  const [showSetup,   setShowSetup]   = useState(false);
  const [notionToken, setNotionToken] = useState("");
  const [notionDb,    setNotionDb]    = useState(NOTION_DB_ID);
  const [lastRun,     setLastRun]     = useState("");
  const [mounted,     setMounted]     = useState(false);
  const logRef = useRef(null);

  useEffect(() => {
    setMounted(true);
    setNotionToken(localStorage.getItem("n_tok") || "");
    setNotionDb(localStorage.getItem("n_db")  || NOTION_DB_ID);
    setLastRun(localStorage.getItem("n_last") || "");
    try { setStatusMap(JSON.parse(localStorage.getItem("n_status") || "{}")); } catch {}
  }, []);

  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [logs]);

  const log = (msg, type = "info") =>
    setLogs(p => [...p, { msg, type, ts: new Date().toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", second: "2-digit" }) }]);

  const saveSetup = () => {
    localStorage.setItem("n_tok", notionToken);
    localStorage.setItem("n_db",  notionDb);
    setShowSetup(false);
    log("Notion connected", "ok");
  };

  const run = async () => {
    setLoading(true); setResults([]); setLogs([]); setExpanded(null);
    const all = [];

    for (const track of TRACKS) {
      log(`Scanning ${track.label}...`);
      let postings = [];
      try {
        postings = await searchTrack(track);
        if (postings.length) log(`${postings.length} ${track.label} posting${postings.length > 1 ? "s" : ""} found`, "ok");
        else log(`No new ${track.label} postings today`, "dim");
      } catch(e) { log(`${track.label} search failed — ${e.message}`, "err"); }

      for (const p of postings) {
        log(`Drafting email for ${p.company}...`);
        try {
          const email = await genEmail(track.id, p);
          const item = {
            id: `${track.id}_${Date.now()}_${Math.random().toString(36).slice(2,5)}`,
            trackId: track.id, trackLabel: track.label, trackColor: track.color,
            trackRgb: track.rgb, trackIcon: track.icon,
            company: p.company, role: p.role, link: p.link,
            contact: p.contact, sector: p.sector,
            subject: email.subject, body: email.body,
          };
          all.push(item);
          setResults([...all]);
          log(`${p.company} ready`, "ok");
        } catch(e) { log(`Email draft failed for ${p.company}`, "err"); }
      }
    }

    const ts = new Date().toLocaleString("en-GB", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
    localStorage.setItem("n_last", ts);
    setLastRun(ts);
    log(all.length ? `${all.length} opportunit${all.length > 1 ? "ies" : "y"} ready` : "No new postings found. Check back tomorrow.", all.length ? "ok" : "dim");
    setLoading(false);
  };

  const copy = (id, text) => {
    navigator.clipboard.writeText(text);
    setCopied(p => ({ ...p, [id]: true }));
    setTimeout(() => setCopied(p => ({ ...p, [id]: false })), 1800);
  };

  const push = useCallback(async (item) => {
    if (!notionToken) { setShowSetup(true); return; }
    setPushing(p => ({ ...p, [item.id]: true }));
    try {
      await pushNotion(notionToken, notionDb, item);
      setPushed(p => ({ ...p, [item.id]: true }));
      log(`${item.company} → Notion`, "ok");
    } catch(e) { log(`Notion error — ${e.message}`, "err"); }
    setPushing(p => ({ ...p, [item.id]: false }));
  }, [notionToken, notionDb]);

  const pushAll = async () => {
    const pending = filtered.filter(r => !pushed[r.id]);
    for (const item of pending) await push(item);
  };

  const setStatus = (id, s) => {
    const next = { ...statusMap, [id]: s };
    setStatusMap(next);
    localStorage.setItem("n_status", JSON.stringify(next));
  };

  const filtered = activeTab === "all" ? results : results.filter(r => r.trackId === activeTab);
  const countFor = id => results.filter(r => r.trackId === id).length;
  const today = mounted ? new Date().toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" }) : "";

  return (
    <>
     

      {/* ── NOISE TEXTURE overlay ── */}
      <div style={{
        position: "fixed", inset: 0, zIndex: 0, pointerEvents: "none",
        backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)' opacity='0.035'/%3E%3C/svg%3E")`,
        opacity: 0.4,
      }}/>

      <div style={{ position: "relative", zIndex: 1, minHeight: "100vh", display: "flex", flexDirection: "column" }}>

        {/* ══ TOP BAR ══ */}
        <header style={{
          position: "sticky", top: 0, zIndex: 50,
          background: "rgba(7,7,9,0.88)",
          backdropFilter: "blur(20px) saturate(180%)",
          borderBottom: "1px solid rgba(255,255,255,0.07)",
          height: 56, display: "flex", alignItems: "center",
          padding: "0 28px", gap: 16,
        }}>
          {/* Logo */}
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
            <div style={{
              width: 28, height: 28, borderRadius: 7,
              background: "linear-gradient(135deg, rgba(91,141,239,0.3), rgba(155,126,222,0.3))",
              border: "1px solid rgba(91,141,239,0.3)",
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 14,
            }}>◈</div>
            <span style={{ fontFamily: "'Manrope'", fontWeight: 800, fontSize: 15, color: "#fff", letterSpacing: -0.3 }}>
              Radar
            </span>
            <div style={{ display: "flex", alignItems: "center", gap: 5, marginLeft: 4 }}>
              <div style={{
                width: 6, height: 6, borderRadius: "50%",
                background: loading ? "#F5A623" : "#3DBA8F",
                boxShadow: loading ? "0 0 6px #F5A623aa" : "0 0 6px #3DBA8Faa",
                animation: loading ? "pulse 0.9s ease infinite" : "none",
              }}/>
              <span style={{ fontSize: 11, color: "var(--text3)", fontFamily: "var(--mono)" }}>
                {loading ? "scanning" : "ready"}
              </span>
            </div>
          </div>

          {/* Date */}
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginLeft: 4 }}>
            <div style={{ width: 1, height: 16, background: "var(--line)" }}/>
            <span style={{ fontSize: 12, color: "var(--text3)", fontFamily: "var(--mono)" }}>{today}</span>
            {lastRun && <span style={{ fontSize: 11, color: "var(--text4)" }}>· {lastRun}</span>}
          </div>

          {/* Spacer */}
          <div style={{ flex: 1 }}/>

          {/* Right controls */}
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>

            {/* View toggle */}
            <div style={{
              display: "flex", background: "var(--bg2)",
              border: "1px solid var(--line)", borderRadius: 8, padding: 3, gap: 2,
            }}>
              {[["cards","⊞ Cards"], ["pipeline","☰ Pipeline"]].map(([v, lbl]) => (
                <button key={v} onClick={() => setView(v)} style={{
                  padding: "4px 11px", borderRadius: 5, fontSize: 12, fontWeight: 500,
                  background: view === v ? "rgba(255,255,255,0.08)" : "transparent",
                  color: view === v ? "var(--text)" : "var(--text3)",
                  border: "none", transition: "all 0.15s",
                }}>{lbl}</button>
              ))}
            </div>

            {results.length > 0 && !loading && (
              <TopBtn onClick={pushAll}>Push all → Notion</TopBtn>
            )}

            <TopBtn onClick={() => setShowSetup(s => !s)} active={showSetup}>
              ⚙ Setup
            </TopBtn>

            {/* RUN button */}
            <button
              onClick={run} disabled={loading}
              style={{
                display: "flex", alignItems: "center", gap: 8,
                padding: "8px 20px", borderRadius: 9,
                background: loading ? "rgba(91,141,239,0.1)" : "linear-gradient(135deg, #5B8DEF 0%, #9B7EDE 100%)",
                color: loading ? "#5B8DEF" : "#fff", border: "none",
                fontSize: 13, fontWeight: 700, letterSpacing: -0.2,
                boxShadow: loading ? "none" : "0 2px 14px rgba(91,141,239,0.3)",
                cursor: loading ? "not-allowed" : "pointer",
                transition: "all 0.2s",
              }}
            >
              {loading
                ? <><Spinner/> Scanning live postings…</>
                : "▶  Run Today's Search"
              }
            </button>
          </div>
        </header>

        {/* ══ SETUP PANEL ══ */}
        {showSetup && (
          <div style={{
            background: "var(--bg1)", borderBottom: "1px solid var(--line)",
            padding: "20px 28px", animation: "in-up 0.2s ease",
          }}>
            <div style={{ maxWidth: 740 }}>
              <div style={{ fontFamily: "var(--serif)", fontStyle: "italic", fontSize: 15, color: "var(--text2)", marginBottom: 16 }}>
                Connect Notion to push opportunities directly to your pipeline database.
              </div>
              <div style={{ display: "flex", gap: 14, alignItems: "flex-end", flexWrap: "wrap" }}>
                <div style={{ flex: "2 1 240px" }}>
                  <FieldLabel>Notion Integration Token</FieldLabel>
                  <input type="password" placeholder="secret_xxxxxxxxxxxxxxxxxxxx"
                    value={notionToken} onChange={e => setNotionToken(e.target.value)}/>
                </div>
                <div style={{ flex: "1 1 200px" }}>
                  <FieldLabel>Database ID</FieldLabel>
                  <input type="text" placeholder={NOTION_DB_ID}
                    value={notionDb} onChange={e => setNotionDb(e.target.value)}/>
                  <div style={{ fontSize: 11, color: "var(--text4)", marginTop: 5, fontFamily: "var(--mono)" }}>
                    Pre-filled from your Notion workspace ✓
                  </div>
                </div>
                <button onClick={saveSetup} style={{
                  padding: "9px 20px", borderRadius: 8,
                  background: "rgba(61,186,143,0.12)", border: "1px solid rgba(61,186,143,0.25)",
                  color: "#3DBA8F", fontSize: 13, fontWeight: 600,
                  flexShrink: 0,
                }}>Save</button>
              </div>
              {!notionToken && (
                <div style={{ marginTop: 12, fontSize: 12, color: "var(--text3)", lineHeight: 1.6 }}>
                  Get your token at{" "}
                  <a href="https://www.notion.so/my-integrations" target="_blank" rel="noreferrer"
                    style={{ color: "var(--blue)" }}>notion.so/my-integrations ↗</a>
                  {" "}→ New integration → Internal → copy the token starting with{" "}
                  <code style={{ fontFamily: "var(--mono)", color: "var(--text2)" }}>secret_</code>
                  . Then open your Internship Pipeline page in Notion → ••• menu → Connections → add your integration.
                </div>
              )}
            </div>
          </div>
        )}

        {/* ══ TRACK TABS ══ */}
        <div style={{
          display: "flex", borderBottom: "1px solid var(--line)",
          background: "var(--bg)",
          overflowX: "auto",
        }}>
          {[{ id: "all", label: "All", icon: "◈", color: "var(--blue)", rgb: "91,141,239", short: "ALL", tagline: "Every track" }, ...TRACKS].map(t => {
            const cnt = t.id === "all" ? results.length : countFor(t.id);
            const active = activeTab === t.id;
            return (
              <button key={t.id} onClick={() => setActiveTab(t.id)} style={{
                display: "flex", alignItems: "center", gap: 8,
                padding: "0 24px", height: 46,
                background: "transparent", border: "none",
                borderBottom: `2px solid ${active ? t.color : "transparent"}`,
                color: active ? t.color : "var(--text3)",
                fontSize: 13, fontWeight: active ? 600 : 400,
                whiteSpace: "nowrap", cursor: "pointer",
                transition: "all 0.15s",
              }}>
                <span style={{ fontSize: 10, opacity: 0.9 }}>{t.icon}</span>
                {t.label}
                <span style={{
                  fontFamily: "var(--mono)", fontSize: 11,
                  padding: "1px 7px", borderRadius: 20,
                  background: active ? `rgba(${t.rgb},0.15)` : "rgba(255,255,255,0.04)",
                  color: active ? t.color : "var(--text4)",
                }}>{cnt}</span>
              </button>
            );
          })}
        </div>

        {/* ══ PROGRESS LOG ══ */}
        {logs.length > 0 && (
          <div ref={logRef} style={{
            margin: "16px 28px 0",
            background: "var(--bg1)", border: "1px solid var(--line)",
            borderRadius: 10, padding: "11px 16px",
            maxHeight: 90, overflowY: "auto",
          }}>
            {logs.map((l, i) => {
              const clr = { ok: "#3DBA8F", err: "#E05C7A", dim: "var(--text4)", info: "var(--text3)" }[l.type] || "var(--text3)";
              return (
                <div key={i} style={{ display: "flex", gap: 16, marginBottom: 3, fontSize: 12, fontFamily: "var(--mono)" }}>
                  <span style={{ color: "var(--text4)", minWidth: 70, fontVariantNumeric: "tabular-nums" }}>{l.ts}</span>
                  <span style={{ color: clr }}>{l.msg}</span>
                </div>
              );
            })}
          </div>
        )}

        {/* ══ EMPTY STATE ══ */}
        {!loading && results.length === 0 && logs.length === 0 && <EmptyState onRun={run} />}

        {/* ══ CARDS VIEW ══ */}
        {view === "cards" && filtered.length > 0 && (
          <div style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(390px, 1fr))",
            gap: 16, padding: "20px 28px 64px",
          }}>
            {filtered.map((item, i) => (
              <Card key={item.id} item={item} index={i}
                open={expanded === item.id}
                onToggle={() => setExpanded(e => e === item.id ? null : item.id)}
                copied={copied} onCopy={copy}
                pushing={pushing[item.id]} pushed={pushed[item.id]} onPush={push}
                status={statusMap[item.id] || "To Apply"} onStatus={s => setStatus(item.id, s)}
              />
            ))}
          </div>
        )}

        {/* ══ PIPELINE VIEW ══ */}
        {view === "pipeline" && results.length > 0 && (
          <Pipeline results={results} statusMap={statusMap} onStatus={setStatus}
            copied={copied} onCopy={copy}
            pushing={pushing} pushed={pushed} onPush={push}
          />
        )}
      </div>

      <style>{`
        @keyframes in-up  { from{opacity:0;transform:translateY(12px)} to{opacity:1;transform:translateY(0)} }
        @keyframes in-fade{ from{opacity:0} to{opacity:1} }
        @keyframes pulse  { 0%,100%{opacity:1} 50%{opacity:0.2} }
        @keyframes spin   { to{transform:rotate(360deg)} }
        ::-webkit-scrollbar{width:3px;height:3px}
        ::-webkit-scrollbar-thumb{background:var(--bg3);border-radius:2px}
      `}</style>
    </>
  );
}

/* ════════════════════════════════════════════════════════════
   CARD COMPONENT
════════════════════════════════════════════════════════════ */
function Card({ item, index, open, onToggle, copied, onCopy, pushing, pushed, onPush, status, onStatus }) {
  const { trackColor: c, trackRgb: r } = item;
  return (
    <div style={{
      background: open ? "var(--bg2)" : "var(--bg1)",
      border: `1px solid ${open ? `rgba(${r},0.35)` : "rgba(255,255,255,0.07)"}`,
      borderRadius: 14, overflow: "hidden",
      boxShadow: open ? `0 8px 40px rgba(${r},0.07), 0 2px 8px rgba(0,0,0,0.3)` : "0 1px 4px rgba(0,0,0,0.2)",
      transition: "border-color 0.25s, box-shadow 0.25s",
      animation: `in-up 0.4s cubic-bezier(0.16,1,0.3,1) ${index * 0.06}s both`,
    }}>

      {/* ── Header ── */}
      <div onClick={onToggle} style={{ padding: "18px 20px 16px", cursor: "pointer", userSelect: "none" }}>

        {/* top row */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
          <TrackChip item={item}/>
          <StatusBadge status={status} onChange={onStatus}/>
        </div>

        {/* Company name */}
        <div style={{
          fontFamily: "var(--serif)", fontStyle: "italic",
          fontSize: 22, color: "#fff", lineHeight: 1.15, marginBottom: 4,
        }}>
          {item.company}
        </div>

        {/* Role */}
        <div style={{ fontSize: 13, color: "var(--text2)", marginBottom: 14, fontWeight: 400 }}>
          {item.role}
        </div>

        {/* Meta row */}
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          {item.sector && (
            <span style={{
              fontSize: 11, padding: "2px 9px", borderRadius: 5,
              background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)",
              color: "var(--text3)", fontFamily: "var(--mono)",
            }}>{item.sector}</span>
          )}
          {item.contact && (
            <span style={{ fontSize: 11, color: "var(--text3)" }}>👤 {item.contact}</span>
          )}
          <div style={{ marginLeft: "auto", display: "flex", gap: 12, alignItems: "center" }}>
            {item.link && item.link.startsWith("http") && (
              <a href={item.link} target="_blank" rel="noreferrer"
                onClick={e => e.stopPropagation()}
                style={{ fontSize: 12, color: c, fontWeight: 600, opacity: 0.9 }}>
                View posting ↗
              </a>
            )}
            <span style={{ fontSize: 11, color: "var(--text4)" }}>{open ? "▲" : "▼"}</span>
          </div>
        </div>
      </div>

      {/* ── Expanded body ── */}
      {open && (
        <div style={{
          borderTop: "1px solid rgba(255,255,255,0.06)",
          padding: "18px 20px",
          animation: "in-up 0.25s cubic-bezier(0.16,1,0.3,1)",
        }}>
          {/* Subject line */}
          <MicroLabel>Subject Line</MicroLabel>
          <div style={{
            background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)",
            borderRadius: 9, padding: "11px 14px",
            fontFamily: "var(--mono)", fontSize: 12, color: "var(--text)",
            lineHeight: 1.55, marginBottom: 16,
          }}>
            {item.subject}
          </div>

          {/* Email body */}
          <MicroLabel>Draft Email</MicroLabel>
          <div style={{
            background: "rgba(0,0,0,0.35)", border: "1px solid rgba(255,255,255,0.05)",
            borderRadius: 9, padding: "13px 15px",
            fontFamily: "var(--mono)", fontSize: 12, color: "var(--text2)",
            lineHeight: 1.85, whiteSpace: "pre-wrap",
            maxHeight: 300, overflowY: "auto",
            marginBottom: 16,
          }}>
            {item.body}
          </div>

          {/* Action buttons */}
          <div style={{ display: "flex", gap: 8 }}>
            <Btn onClick={() => onCopy(`s_${item.id}`, item.subject)}
              done={copied[`s_${item.id}`]} doneLabel="✓ Copied" label="Copy subject"/>
            <Btn onClick={() => onCopy(`e_${item.id}`, `Subject: ${item.subject}\n\n${item.body}`)}
              done={copied[`e_${item.id}`]} doneLabel="✓ Copied" label="Copy full email" highlight/>
            <Btn
              onClick={() => !pushed && !pushing && onPush(item)}
              done={pushed} doneLabel="✓ In Notion"
              loading={pushing} loadLabel="Sending…"
              label="→ Push to Notion" notion
            />
          </div>
        </div>
      )}
    </div>
  );
}

/* ════════════════════════════════════════════════════════════
   PIPELINE VIEW
════════════════════════════════════════════════════════════ */
function Pipeline({ results, statusMap, onStatus, copied, onCopy, pushing, pushed, onPush }) {
  return (
    <div style={{
      display: "flex", gap: 14,
      padding: "20px 28px 64px",
      overflowX: "auto", alignItems: "flex-start",
    }}>
      {STATUSES.map(st => {
        const items = results.filter(r => (statusMap[r.id] || "To Apply") === st.label);
        return (
          <div key={st.label} style={{ width: 300, flexShrink: 0 }}>
            {/* Column header */}
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12, padding: "0 2px" }}>
              <div style={{ width: 7, height: 7, borderRadius: "50%", background: st.color, boxShadow: `0 0 5px ${st.color}99` }}/>
              <span style={{ fontSize: 12, fontWeight: 700, color: st.color, letterSpacing: 0.2 }}>{st.label}</span>
              <span style={{ fontFamily: "var(--mono)", fontSize: 11, color: "var(--text4)", marginLeft: "auto" }}>{items.length}</span>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {items.map(item => (
                <MiniCard key={item.id} item={item}
                  onStatus={s => onStatus(item.id, s)}
                  copied={copied} onCopy={onCopy}
                  pushing={pushing[item.id]} pushed={pushed[item.id]} onPush={onPush}
                />
              ))}
              {items.length === 0 && (
                <div style={{
                  padding: "20px", textAlign: "center",
                  background: "var(--bg1)", border: "1px dashed var(--line)",
                  borderRadius: 10, color: "var(--text4)", fontSize: 12,
                }}>Empty</div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function MiniCard({ item, onStatus, copied, onCopy, pushing, pushed, onPush }) {
  const [open, setOpen] = useState(false);
  return (
    <div style={{
      background: "var(--bg1)", border: `1px solid rgba(${item.trackRgb},0.15)`,
      borderRadius: 10, overflow: "hidden", transition: "border-color 0.2s",
    }}>
      <div onClick={() => setOpen(o => !o)} style={{ padding: "13px 15px", cursor: "pointer" }}>
        <div style={{ fontSize: 11, color: item.trackColor, marginBottom: 6, fontWeight: 600 }}>
          {item.trackIcon} {item.trackLabel}
        </div>
        <div style={{ fontFamily: "var(--serif)", fontStyle: "italic", fontSize: 15, color: "#fff", marginBottom: 2 }}>
          {item.company}
        </div>
        <div style={{ fontSize: 12, color: "var(--text3)" }}>{item.role}</div>
        <div style={{ display: "flex", justifyContent: "space-between", marginTop: 8, alignItems: "center" }}>
          {item.link ? <a href={item.link} target="_blank" rel="noreferrer" onClick={e => e.stopPropagation()} style={{ fontSize: 11, color: item.trackColor }}>Apply ↗</a> : <span/>}
          <span style={{ color: "var(--text4)", fontSize: 11 }}>{open ? "▲" : "▼"}</span>
        </div>
      </div>
      {open && (
        <div style={{ borderTop: "1px solid var(--line)", padding: "12px 15px", animation: "in-up 0.15s ease" }}>
          <div style={{ fontFamily: "var(--mono)", fontSize: 11, color: "var(--text3)", marginBottom: 10, lineHeight: 1.5 }}>
            {item.subject}
          </div>
          <div style={{ display: "flex", gap: 6, marginBottom: 10 }}>
            <Btn small onClick={() => onCopy(`s_${item.id}`, item.subject)} done={copied[`s_${item.id}`]} doneLabel="✓" label="Subject"/>
            <Btn small onClick={() => onCopy(`e_${item.id}`, `Subject: ${item.subject}\n\n${item.body}`)} done={copied[`e_${item.id}`]} doneLabel="✓" label="Email" highlight/>
            <Btn small onClick={() => !pushed && !pushing && onPush(item)} done={pushed} doneLabel="✓" loading={pushing} loadLabel="…" label="Notion" notion/>
          </div>
          {/* Status picker */}
          <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
            {STATUSES.map(s => (
              <button key={s.label} onClick={() => onStatus(s.label)} style={{
                padding: "3px 9px", borderRadius: 6, fontSize: 10,
                background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)",
                color: "var(--text3)", cursor: "pointer",
                fontFamily: "var(--sans)",
              }}>{s.label}</button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/* ════════════════════════════════════════════════════════════
   EMPTY STATE
════════════════════════════════════════════════════════════ */
function EmptyState({ onRun }) {
  return (
    <div style={{
      flex: 1, display: "flex", flexDirection: "column",
      alignItems: "center", justifyContent: "center",
      padding: "80px 28px", gap: 24, textAlign: "center",
    }}>
      {/* Track icons */}
      <div style={{ display: "flex", gap: 32, marginBottom: 8 }}>
        {TRACKS.map((t, i) => (
          <div key={t.id} style={{
            animation: `in-up 0.5s cubic-bezier(0.16,1,0.3,1) ${i * 0.08}s both`,
            display: "flex", flexDirection: "column", alignItems: "center", gap: 8,
          }}>
            <div style={{
              width: 48, height: 48, borderRadius: 13,
              background: `rgba(${t.rgb},0.1)`, border: `1px solid rgba(${t.rgb},0.2)`,
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 20, color: t.color,
            }}>{t.icon}</div>
            <div style={{ fontSize: 11, color: t.color, fontWeight: 600 }}>{t.short}</div>
            <div style={{ fontSize: 10, color: "var(--text4)", fontFamily: "var(--mono)" }}>{t.tagline}</div>
          </div>
        ))}
      </div>

      {/* Headline */}
      <div>
        <div style={{
          fontFamily: "var(--serif)", fontStyle: "italic",
          fontSize: 32, color: "#fff", marginBottom: 10, lineHeight: 1.15,
          animation: "in-up 0.5s cubic-bezier(0.16,1,0.3,1) 0.3s both",
        }}>
          Good morning, Nishant.
        </div>
        <div style={{
          fontSize: 14, color: "var(--text2)", maxWidth: 440, lineHeight: 1.7,
          animation: "in-up 0.5s cubic-bezier(0.16,1,0.3,1) 0.4s both",
        }}>
          Hit run and we'll scan LinkedIn, Wellfound, Otta, and company career pages for roles posted in the last 24 hours across all four tracks — with a personalised draft email for each one.
        </div>
      </div>

      <button onClick={onRun} style={{
        padding: "12px 28px", borderRadius: 10,
        background: "linear-gradient(135deg, #5B8DEF 0%, #9B7EDE 100%)",
        color: "#fff", border: "none", fontSize: 14, fontWeight: 700,
        boxShadow: "0 4px 24px rgba(91,141,239,0.35)",
        cursor: "pointer", letterSpacing: -0.2,
        animation: "in-up 0.5s cubic-bezier(0.16,1,0.3,1) 0.5s both",
      }}>
        ▶  Run Today's Search
      </button>

      {/* Tip */}
      <div style={{
        fontSize: 12, color: "var(--text4)", fontFamily: "var(--mono)",
        animation: "in-up 0.5s cubic-bezier(0.16,1,0.3,1) 0.6s both",
      }}>
        tip — connect Notion in ⚙ Setup to push opportunities to your pipeline with one click
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════
   SMALL COMPONENTS
════════════════════════════════════════════════════════════ */
function TrackChip({ item }) {
  return (
    <div style={{
      display: "inline-flex", alignItems: "center", gap: 5,
      padding: "3px 10px", borderRadius: 20,
      background: `rgba(${item.trackRgb},0.1)`,
      border: `1px solid rgba(${item.trackRgb},0.22)`,
      color: item.trackColor, fontSize: 11, fontWeight: 600,
    }}>
      <span style={{ fontSize: 9 }}>{item.trackIcon}</span>
      {item.trackLabel}
    </div>
  );
}

function StatusBadge({ status, onChange }) {
  const [open, setOpen] = useState(false);
  const cfg = STATUSES.find(s => s.label === status) || STATUSES[0];
  return (
    <div style={{ position: "relative" }}>
      <button onClick={e => { e.stopPropagation(); setOpen(o => !o); }} style={{
        display: "flex", alignItems: "center", gap: 5,
        padding: "3px 10px", borderRadius: 20,
        background: cfg.bg, border: `1px solid ${cfg.color}33`,
        color: cfg.color, fontSize: 11, fontWeight: 600,
        cursor: "pointer",
      }}>
        <span style={{ width: 5, height: 5, borderRadius: "50%", background: cfg.color, flexShrink: 0 }}/>
        {status}
      </button>
      {open && (
        <div style={{
          position: "absolute", top: "calc(100% + 6px)", right: 0, zIndex: 60,
          background: "var(--bg2)", border: "1px solid var(--line2)",
          borderRadius: 10, padding: 6, minWidth: 160,
          boxShadow: "0 12px 40px rgba(0,0,0,0.6)",
          animation: "in-up 0.15s ease",
        }}>
          {STATUSES.map(s => (
            <button key={s.label} onClick={e => { e.stopPropagation(); onChange(s.label); setOpen(false); }} style={{
              display: "flex", alignItems: "center", gap: 8,
              width: "100%", padding: "7px 10px", borderRadius: 7,
              background: s.label === status ? "rgba(255,255,255,0.06)" : "transparent",
              color: s.label === status ? "#fff" : "var(--text2)",
              fontSize: 12, fontWeight: 500, cursor: "pointer", textAlign: "left",
              border: "none",
            }}>
              <span style={{ width: 6, height: 6, borderRadius: "50%", background: s.color, flexShrink: 0 }}/>
              {s.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function Btn({ onClick, done, doneLabel, loading, loadLabel, label, highlight, notion, small }) {
  const bg = done     ? "rgba(61,186,143,0.1)"
           : notion   ? "rgba(91,141,239,0.08)"
           : highlight ? "rgba(255,255,255,0.07)"
           : "rgba(255,255,255,0.04)";
  const border = done     ? "rgba(61,186,143,0.25)"
               : notion   ? "rgba(91,141,239,0.2)"
               : highlight ? "rgba(255,255,255,0.12)"
               : "rgba(255,255,255,0.07)";
  const color  = done ? "#3DBA8F" : loading ? "var(--text4)" : notion ? "#5B8DEF" : highlight ? "var(--text)" : "var(--text2)";
  return (
    <button onClick={onClick} disabled={done || loading} style={{
      flex: 1, background: bg, border: `1px solid ${border}`, color,
      padding: small ? "5px 8px" : "8px 10px", borderRadius: 8,
      fontSize: small ? 11 : 12, fontWeight: 500,
      cursor: done || loading ? "default" : "pointer",
      transition: "all 0.15s",
    }}>
      {done ? doneLabel : loading ? (loadLabel || "…") : label}
    </button>
  );
}

function TopBtn({ children, onClick, active }) {
  return (
    <button onClick={onClick} style={{
      padding: "6px 14px", borderRadius: 8,
      background: active ? "rgba(255,255,255,0.07)" : "transparent",
      border: "1px solid rgba(255,255,255,0.1)",
      color: active ? "var(--text)" : "var(--text3)",
      fontSize: 12, fontWeight: 500,
    }}>
      {children}
    </button>
  );
}

function MicroLabel({ children }) {
  return (
    <div style={{
      fontSize: 10, letterSpacing: 1.2, textTransform: "uppercase",
      color: "var(--text4)", marginBottom: 7, fontFamily: "var(--mono)",
    }}>{children}</div>
  );
}

function FieldLabel({ children }) {
  return (
    <div style={{
      fontSize: 11, color: "var(--text3)", marginBottom: 6,
      fontWeight: 500, letterSpacing: 0.3,
    }}>{children}</div>
  );
}

function Spinner() {
  return (
    <span style={{
      display: "inline-block", width: 12, height: 12,
      border: "2px solid rgba(255,255,255,0.2)",
      borderTopColor: "#fff", borderRadius: "50%",
      animation: "spin 0.65s linear infinite",
    }}/>
  );
}
