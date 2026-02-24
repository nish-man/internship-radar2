import Head from "next/head";
import { useState, useEffect, useRef } from "react";

/* ═══════════════════════════════════════════
   CONSTANTS
═══════════════════════════════════════════ */
const TRACKS = [
  { id:"strategy",   label:"Strategy",        short:"STR", icon:"◈", color:"#5B8DEF", rgb:"91,141,239",   tagline:"MBB & Corporate" },
  { id:"ceo_office", label:"CEO Office / CoS", short:"CoS", icon:"⚡", color:"#9B7EDE", rgb:"155,126,222", tagline:"Startups & Scale-ups" },
  { id:"pm",         label:"Product",          short:"PM",  icon:"⬡", color:"#2EC4B6", rgb:"46,196,182",   tagline:"Tech & AI" },
  { id:"vc",         label:"VC",               short:"VC",  icon:"◎", color:"#F5A623", rgb:"245,166,35",   tagline:"Funds & Firms" },
];

const STATUSES = [
  { label:"To Apply",    color:"#5B8DEF", bg:"rgba(91,141,239,0.1)"  },
  { label:"Reached Out", color:"#F5A623", bg:"rgba(245,166,35,0.1)"  },
  { label:"Interview",   color:"#2EC4B6", bg:"rgba(46,196,182,0.1)"  },
  { label:"Offer",       color:"#3DBA8F", bg:"rgba(61,186,143,0.1)"  },
  { label:"Rejected",    color:"#3A3A4A", bg:"rgba(58,58,74,0.2)"    },
];

const SOURCE_LABEL = { google:"Google / LinkedIn", adzuna:"Adzuna", wellfound:"Wellfound", unknown:"Web" };
const NOTION_DB    = "fd3725f2-e3cb-479d-ba9e-1b022ec2e12f";

/* ═══════════════════════════════════════════
   API HELPERS
═══════════════════════════════════════════ */
async function fetchJobs(trackId) {
  const [jobsRes, wfRes] = await Promise.all([
    fetch("/api/jobs",      { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({ trackId }) }),
    fetch("/api/wellfound", { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({ trackId }) }),
  ]);

  const jobsData = await jobsRes.json();
  const wfData   = await wfRes.json();

  if (jobsData.error && wfData.error) throw new Error(jobsData.error);

  const combined = [
    ...(jobsData.results  || []),
    ...(wfData.results    || []),
  ];

  // Dedupe by link
  const seen = new Set();
  return combined.filter(r => {
    if (!r.link || seen.has(r.link)) return false;
    seen.add(r.link); return true;
  });
}

async function fetchEmail(trackId, company, role, snippet, salary) {
  const res  = await fetch("/api/email", {
    method: "POST",
    headers: { "Content-Type":"application/json" },
    body: JSON.stringify({ trackId, company, role, snippet, salary }),
  });
  const data = await res.json();
  if (data.error) throw new Error(data.error);
  return data;
}

async function pushNotion(token, dbId, item) {
  const r = await fetch("https://api.notion.com/v1/pages", {
    method: "POST",
    headers: { Authorization:`Bearer ${token}`, "Content-Type":"application/json", "Notion-Version":"2022-06-28" },
    body: JSON.stringify({
      parent: { database_id: dbId },
      properties: {
        "Role Title":       { title:     [{ text:{ content: item.role    } }] },
        "Company":          { rich_text: [{ text:{ content: item.company } }] },
        "Track":            { select:    { name: item.trackLabel } },
        "Application Link": { url: item.link || null },
        "Contact Name":     { rich_text: [{ text:{ content: item.contact || "" } }] },
        "Sector Thesis":    { rich_text: [{ text:{ content: item.sector  || "" } }] },
        "Subject Line":     { rich_text: [{ text:{ content: item.subject } }] },
        "Draft Email":      { rich_text: [{ text:{ content: item.body.slice(0,2000) } }] },
        "Status":           { select:    { name: "To Apply" } },
      },
    }),
  });
  if (!r.ok) { const e = await r.json(); throw new Error(e.message || "Notion error"); }
}

function extractCompany(raw) {
  // "Strategy Intern at Bain & Company | LinkedIn" → "Bain & Company"
  const atMatch = raw.title?.match(/ at (.+?)(?:\s*[\|\-–]|$)/i);
  if (atMatch) return atMatch[1].trim();
  if (raw.company) return raw.company;
  return raw.title?.split(/[\|\-–]/)[0]?.trim() || "";
}

function extractRole(raw) {
  const t = raw.title || "";
  return t.split(/ at /i)[0].split(/[\|\-–]/)[0].trim();
}

/* ═══════════════════════════════════════════
   APP
═══════════════════════════════════════════ */
export default function App() {
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
  const [notionDb,    setNotionDb]    = useState(NOTION_DB);
  const [lastRun,     setLastRun]     = useState("");
  const [mounted,     setMounted]     = useState(false);
  const logRef = useRef(null);

  useEffect(() => {
    setMounted(true);
    setNotionToken(localStorage.getItem("n_tok")    || "");
    setNotionDb(localStorage.getItem("n_db")        || NOTION_DB);
    setLastRun(localStorage.getItem("n_last")       || "");
    try { setStatusMap(JSON.parse(localStorage.getItem("n_status") || "{}")); } catch {}
  }, []);

  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [logs]);

  const log = (msg, type="info") =>
    setLogs(p => [...p, { msg, type, ts: new Date().toLocaleTimeString("en-GB",{hour:"2-digit",minute:"2-digit",second:"2-digit"}) }]);

  const saveSetup = () => {
    localStorage.setItem("n_tok",  notionToken);
    localStorage.setItem("n_db",   notionDb);
    setShowSetup(false);
    log("Settings saved", "ok");
  };

  const run = async () => {
    setLoading(true); setResults([]); setLogs([]); setExpanded(null);
    const all = [];

    for (const track of TRACKS) {
      log(`Fetching real postings — ${track.label}...`);
      let rawJobs = [];
      try {
        rawJobs = await fetchJobs(track.id);
        if (rawJobs.length) log(`${rawJobs.length} verified ${track.label} posting${rawJobs.length>1?"s":""} found`, "ok");
        else { log(`No ${track.label} postings in last 72 hours`, "dim"); continue; }
      } catch(e) { log(`${track.label} search error — ${e.message}`, "err"); continue; }

      for (const raw of rawJobs.slice(0, 4)) {
        const company = extractCompany(raw);
        const role    = extractRole(raw);
        if (!company || !role) continue;

        log(`Drafting email — ${company}...`);
        try {
          const email = await fetchEmail(track.id, company, role, raw.snippet, raw.salary);
          const item  = {
            id:         `${track.id}_${Date.now()}_${Math.random().toString(36).slice(2,5)}`,
            trackId:    track.id, trackLabel: track.label,
            trackColor: track.color, trackRgb: track.rgb, trackIcon: track.icon,
            company, role,
            link:       raw.link,
            contact:    raw.contact || "",
            sector:     raw.sector  || "",
            salary:     raw.salary  || null,
            source:     raw.source  || "unknown",
            date:       raw.date    || null,
            subject:    email.subject,
            body:       email.body,
          };
          all.push(item);
          setResults([...all]);
          log(`${company} ready`, "ok");
        } catch(e) { log(`Email failed for ${company} — ${e.message}`, "err"); }
      }
    }

    const ts = new Date().toLocaleString("en-GB",{weekday:"short",day:"numeric",month:"short",hour:"2-digit",minute:"2-digit"});
    localStorage.setItem("n_last", ts); setLastRun(ts);
    log(all.length ? `Done — ${all.length} opportunit${all.length>1?"ies":"y"} ready` : "No postings found in last 72 hours. Try again tomorrow.", all.length?"ok":"dim");
    setLoading(false);
  };

  const copy = (id, text) => {
    navigator.clipboard.writeText(text);
    setCopied(p => ({...p,[id]:true}));
    setTimeout(() => setCopied(p => ({...p,[id]:false})), 1800);
  };

  const push = async (item) => {
    if (!notionToken) { setShowSetup(true); return; }
    setPushing(p => ({...p,[item.id]:true}));
    try {
      await pushNotion(notionToken, notionDb, item);
      setPushed(p => ({...p,[item.id]:true}));
      log(`${item.company} → Notion`, "ok");
    } catch(e) { log(`Notion error — ${e.message}`, "err"); }
    setPushing(p => ({...p,[item.id]:false}));
  };

  const pushAll  = async () => { for (const i of filtered.filter(r=>!pushed[r.id])) await push(i); };
  const setStatus = (id,s)  => { const n={...statusMap,[id]:s}; setStatusMap(n); localStorage.setItem("n_status",JSON.stringify(n)); };

  const filtered = activeTab==="all" ? results : results.filter(r=>r.trackId===activeTab);
  const cntFor   = id => results.filter(r=>r.trackId===id).length;
  const today    = mounted ? new Date().toLocaleDateString("en-GB",{weekday:"long",day:"numeric",month:"long"}) : "";

  return (
    <>
      <Head>
        <title>Internship Radar · Nishant</title>
        <meta name="viewport" content="width=device-width,initial-scale=1"/>
      </Head>

      {/* noise bg */}
      <div style={{position:"fixed",inset:0,zIndex:0,pointerEvents:"none",
        backgroundImage:`url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='0.04'/%3E%3C/svg%3E")`,opacity:.45}}/>

      <div style={{position:"relative",zIndex:1,minHeight:"100vh",display:"flex",flexDirection:"column"}}>

        {/* ── HEADER ── */}
        <header style={{
          position:"sticky",top:0,zIndex:50,
          background:"rgba(7,7,9,0.9)",backdropFilter:"blur(20px) saturate(180%)",
          borderBottom:"1px solid rgba(255,255,255,0.07)",
          height:56,display:"flex",alignItems:"center",padding:"0 28px",gap:16,
        }}>
          {/* Logo */}
          <div style={{display:"flex",alignItems:"center",gap:10,flexShrink:0}}>
            <div style={{
              width:30,height:30,borderRadius:8,
              background:"linear-gradient(135deg,rgba(91,141,239,0.25),rgba(155,126,222,0.25))",
              border:"1px solid rgba(91,141,239,0.3)",
              display:"flex",alignItems:"center",justifyContent:"center",fontSize:14,
            }}>◈</div>
            <span style={{fontFamily:"var(--serif)",fontStyle:"italic",fontSize:18,color:"#fff",letterSpacing:-0.3}}>
              Internship Radar
            </span>
          </div>

          {/* Status dot */}
          <div style={{display:"flex",alignItems:"center",gap:6}}>
            <div style={{width:1,height:16,background:"var(--line)"}}/>
            <div style={{width:6,height:6,borderRadius:"50%",
              background:loading?"#F5A623":"#3DBA8F",
              boxShadow:loading?"0 0 6px #F5A623aa":"0 0 6px #3DBA8Faa",
              animation:loading?"pulse 0.9s ease infinite":"none"}}/>
            <span style={{fontSize:11,color:"var(--text3)",fontFamily:"var(--mono)"}}>
              {loading?"scanning live postings…":"ready"}
            </span>
            {today && <><div style={{width:1,height:14,background:"var(--line)"}}/><span style={{fontSize:11,color:"var(--text3)"}}>{today}</span></>}
            {lastRun && <span style={{fontSize:11,color:"var(--text4)"}}>· last run {lastRun}</span>}
          </div>

          <div style={{flex:1}}/>

          {/* Right controls */}
          <div style={{display:"flex",gap:8,alignItems:"center"}}>
            {/* View toggle */}
            <div style={{display:"flex",background:"var(--bg2)",border:"1px solid var(--line)",borderRadius:8,padding:3,gap:2}}>
              {[["cards","⊞  Cards"],["pipeline","☰  Pipeline"]].map(([v,lbl])=>(
                <button key={v} onClick={()=>setView(v)} style={{
                  padding:"4px 12px",borderRadius:5,fontSize:12,fontWeight:500,
                  background:view===v?"rgba(255,255,255,0.08)":"transparent",
                  color:view===v?"var(--text)":"var(--text3)",border:"none",transition:"all .15s",
                }}>{lbl}</button>
              ))}
            </div>

            {results.length>0&&!loading&&(
              <TBtn onClick={pushAll}>Push all → Notion</TBtn>
            )}
            <TBtn onClick={()=>setShowSetup(s=>!s)} active={showSetup}>⚙ Setup</TBtn>

            <button onClick={run} disabled={loading} style={{
              display:"flex",alignItems:"center",gap:8,padding:"8px 20px",borderRadius:9,
              background:loading?"rgba(91,141,239,0.1)":"linear-gradient(135deg,#5B8DEF 0%,#9B7EDE 100%)",
              color:loading?"#5B8DEF":"#fff",border:"none",
              fontSize:13,fontWeight:700,letterSpacing:-0.2,
              boxShadow:loading?"none":"0 2px 16px rgba(91,141,239,0.3)",
              cursor:loading?"not-allowed":"pointer",transition:"all .2s",
            }}>
              {loading?<><Spin/> Scanning…</>:"▶  Run Today's Search"}
            </button>
          </div>
        </header>

        {/* ── SETUP PANEL ── */}
        {showSetup&&(
          <div style={{background:"var(--bg1)",borderBottom:"1px solid var(--line)",padding:"20px 28px",animation:"in-up .2s ease"}}>
            <div style={{maxWidth:780}}>
              <p style={{fontFamily:"var(--serif)",fontStyle:"italic",fontSize:15,color:"var(--text2)",marginBottom:16}}>
                Connect Notion to push opportunities directly into your pipeline database.
              </p>
              <div style={{display:"flex",gap:14,alignItems:"flex-end",flexWrap:"wrap"}}>
                <div style={{flex:"2 1 260px"}}>
                  <FL>Notion Integration Token</FL>
                  <input type="password" placeholder="secret_xxxxxxxxxxxxxxxxxxxx" value={notionToken} onChange={e=>setNotionToken(e.target.value)}/>
                </div>
                <div style={{flex:"1 1 220px"}}>
                  <FL>Database ID</FL>
                  <input type="text" placeholder={NOTION_DB} value={notionDb} onChange={e=>setNotionDb(e.target.value)}/>
                  <div style={{fontSize:11,color:"var(--text4)",marginTop:4,fontFamily:"var(--mono)"}}>Pre-filled from your Notion workspace ✓</div>
                </div>
                <button onClick={saveSetup} style={{
                  padding:"9px 20px",borderRadius:8,background:"rgba(61,186,143,0.12)",
                  border:"1px solid rgba(61,186,143,0.25)",color:"#3DBA8F",fontSize:13,fontWeight:600,flexShrink:0,
                }}>Save</button>
              </div>
              {!notionToken&&(
                <div style={{marginTop:12,fontSize:12,color:"var(--text3)",lineHeight:1.7}}>
                  Get your token at{" "}
                  <a href="https://www.notion.so/my-integrations" target="_blank" rel="noreferrer" style={{color:"var(--blue)"}}>
                    notion.so/my-integrations ↗
                  </a>
                  {" "}→ New integration → Internal → copy the <code style={{fontFamily:"var(--mono)",color:"var(--text2)"}}>secret_</code> token.
                  Then open your Internship Pipeline page in Notion → ••• → Connections → select your integration.
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── TRACK TABS ── */}
        <div style={{display:"flex",borderBottom:"1px solid var(--line)",overflowX:"auto",background:"var(--bg)"}}>
          {[{id:"all",label:"All",icon:"◈",color:"var(--blue)",rgb:"91,141,239"},...TRACKS].map(t=>{
            const cnt   = t.id==="all"?results.length:cntFor(t.id);
            const active= activeTab===t.id;
            return (
              <button key={t.id} onClick={()=>setActiveTab(t.id)} style={{
                display:"flex",alignItems:"center",gap:7,padding:"0 22px",height:46,
                background:"transparent",border:"none",
                borderBottom:`2px solid ${active?t.color:"transparent"}`,
                color:active?t.color:"var(--text3)",
                fontSize:13,fontWeight:active?600:400,whiteSpace:"nowrap",
                cursor:"pointer",transition:"all .15s",
              }}>
                <span style={{fontSize:10}}>{t.icon}</span>
                {t.label}
                <span style={{
                  fontFamily:"var(--mono)",fontSize:11,padding:"1px 8px",borderRadius:20,
                  background:active?`rgba(${t.rgb},0.15)`:"rgba(255,255,255,0.04)",
                  color:active?t.color:"var(--text4)",
                }}>{cnt}</span>
              </button>
            );
          })}
        </div>

        {/* ── SOURCES LEGEND ── */}
        <div style={{
          display:"flex",gap:16,padding:"10px 28px",
          borderBottom:"1px solid var(--line)",
          background:"var(--bg1)",alignItems:"center",flexWrap:"wrap",
        }}>
          <span style={{fontSize:11,color:"var(--text3)",fontFamily:"var(--mono)"}}>Sources:</span>
          {[["google","Google → LinkedIn / Greenhouse / Lever","#5B8DEF"],["adzuna","Adzuna (UK aggregator)","#2EC4B6"],["wellfound","Wellfound (startup jobs)","#F5A623"]].map(([s,lbl,c])=>(
            <div key={s} style={{display:"flex",alignItems:"center",gap:5}}>
              <div style={{width:6,height:6,borderRadius:"50%",background:c}}/>
              <span style={{fontSize:11,color:"var(--text3)"}}>{lbl}</span>
            </div>
          ))}
          <span style={{fontSize:11,color:"var(--text4)",marginLeft:"auto",fontFamily:"var(--mono)"}}>72-hour window · real URLs only</span>
        </div>

        {/* ── PROGRESS LOG ── */}
        {logs.length>0&&(
          <div ref={logRef} style={{
            margin:"16px 28px 0",background:"var(--bg1)",
            border:"1px solid var(--line)",borderRadius:10,
            padding:"11px 16px",maxHeight:90,overflowY:"auto",
          }}>
            {logs.map((l,i)=>{
              const c={ok:"#3DBA8F",err:"#E05C7A",dim:"var(--text4)",info:"var(--text3)"}[l.type]||"var(--text3)";
              return(
                <div key={i} style={{display:"flex",gap:16,marginBottom:3,fontSize:12,fontFamily:"var(--mono)"}}>
                  <span style={{color:"var(--text4)",minWidth:70,fontVariantNumeric:"tabular-nums"}}>{l.ts}</span>
                  <span style={{color:c}}>{l.msg}</span>
                </div>
              );
            })}
          </div>
        )}

        {/* ── EMPTY STATE ── */}
        {!loading&&results.length===0&&logs.length===0&&<EmptyState onRun={run}/>}

        {/* ── CARDS ── */}
        {view==="cards"&&filtered.length>0&&(
          <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(400px,1fr))",gap:16,padding:"20px 28px 64px"}}>
            {filtered.map((item,i)=>(
              <Card key={item.id} item={item} index={i}
                open={expanded===item.id} onToggle={()=>setExpanded(e=>e===item.id?null:item.id)}
                copied={copied} onCopy={copy}
                pushing={pushing[item.id]} pushed={pushed[item.id]} onPush={push}
                status={statusMap[item.id]||"To Apply"} onStatus={s=>setStatus(item.id,s)}
              />
            ))}
          </div>
        )}

        {/* ── PIPELINE ── */}
        {view==="pipeline"&&results.length>0&&(
          <Pipeline results={results} statusMap={statusMap} onStatus={setStatus}
            copied={copied} onCopy={copy} pushing={pushing} pushed={pushed} onPush={push}/>
        )}
      </div>

      <style>{`
        @keyframes in-up  {from{opacity:0;transform:translateY(14px)}to{opacity:1;transform:translateY(0)}}
        @keyframes in-fade{from{opacity:0}to{opacity:1}}
        @keyframes pulse  {0%,100%{opacity:1}50%{opacity:.2}}
        @keyframes spin   {to{transform:rotate(360deg)}}
        ::-webkit-scrollbar{width:3px;height:3px}
        ::-webkit-scrollbar-thumb{background:var(--bg3);border-radius:2px}
      `}</style>
    </>
  );
}

/* ═══════════════════════════════════════════
   CARD
═══════════════════════════════════════════ */
function Card({ item, index, open, onToggle, copied, onCopy, pushing, pushed, onPush, status, onStatus }) {
  const c=item.trackColor, r=item.trackRgb;
  const srcColor = {google:"#5B8DEF",adzuna:"#2EC4B6",wellfound:"#F5A623"}[item.source]||"var(--text3)";

  return (
    <div style={{
      background:open?"var(--bg2)":"var(--bg1)",
      border:`1px solid ${open?`rgba(${r},.35)`:"rgba(255,255,255,0.07)"}`,
      borderRadius:14,overflow:"hidden",
      boxShadow:open?`0 8px 40px rgba(${r},.08),0 2px 8px rgba(0,0,0,.3)`:"0 1px 4px rgba(0,0,0,.2)",
      transition:"border-color .25s,box-shadow .25s",
      animation:`in-up .4s cubic-bezier(.16,1,.3,1) ${index*.06}s both`,
    }}>
      {/* HEADER */}
      <div onClick={onToggle} style={{padding:"18px 20px 16px",cursor:"pointer",userSelect:"none"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:12}}>
          <div style={{display:"flex",gap:7,alignItems:"center"}}>
            <div style={{
              display:"inline-flex",alignItems:"center",gap:5,
              padding:"3px 10px",borderRadius:20,
              background:`rgba(${r},.1)`,border:`1px solid rgba(${r},.22)`,
              color:c,fontSize:11,fontWeight:600,
            }}>
              <span style={{fontSize:9}}>{item.trackIcon}</span>{item.trackLabel}
            </div>
            {/* Source badge */}
            <div style={{
              padding:"3px 8px",borderRadius:20,
              background:"rgba(255,255,255,0.04)",border:"1px solid rgba(255,255,255,0.07)",
              fontSize:10,color:srcColor,fontFamily:"var(--mono)",
            }}>
              {SOURCE_LABEL[item.source]||"Web"}
            </div>
          </div>
          <StatusBadge status={status} onChange={onStatus}/>
        </div>

        {/* Company */}
        <div style={{fontFamily:"var(--serif)",fontStyle:"italic",fontSize:21,color:"#fff",lineHeight:1.15,marginBottom:3}}>
          {item.company}
        </div>
        <div style={{fontSize:13,color:"var(--text2)",marginBottom:12}}>{item.role}</div>

        <div style={{display:"flex",gap:8,alignItems:"center",flexWrap:"wrap"}}>
          {item.salary&&<Chip color="var(--green)">{item.salary}</Chip>}
          {item.date&&<Chip>{new Date(item.date).toLocaleDateString("en-GB",{day:"numeric",month:"short"})}</Chip>}
          <div style={{marginLeft:"auto",display:"flex",gap:12,alignItems:"center"}}>
            {item.link&&(
              <a href={item.link} target="_blank" rel="noreferrer" onClick={e=>e.stopPropagation()}
                style={{fontSize:12,color:c,fontWeight:600,display:"flex",alignItems:"center",gap:4}}>
                View real posting ↗
              </a>
            )}
            <span style={{fontSize:11,color:"var(--text4)"}}>{open?"▲":"▼"}</span>
          </div>
        </div>
      </div>

      {/* BODY */}
      {open&&(
        <div style={{borderTop:"1px solid rgba(255,255,255,0.06)",padding:"18px 20px",animation:"in-up .25s cubic-bezier(.16,1,.3,1)"}}>
          {item.snippet&&(
            <>
              <ML>Role Snippet</ML>
              <div style={{
                fontSize:12,color:"var(--text2)",lineHeight:1.65,marginBottom:16,
                fontFamily:"var(--mono)",padding:"10px 12px",
                background:"rgba(255,255,255,0.02)",borderRadius:8,
                border:"1px solid rgba(255,255,255,0.05)",
              }}>{item.snippet}</div>
            </>
          )}
          <ML>Subject Line</ML>
          <div style={{
            background:"rgba(255,255,255,0.03)",border:"1px solid rgba(255,255,255,0.08)",
            borderRadius:9,padding:"11px 14px",
            fontFamily:"var(--mono)",fontSize:12,color:"var(--text)",
            lineHeight:1.55,marginBottom:16,
          }}>{item.subject}</div>

          <ML>Draft Email</ML>
          <div style={{
            background:"rgba(0,0,0,0.35)",border:"1px solid rgba(255,255,255,0.05)",
            borderRadius:9,padding:"13px 15px",
            fontFamily:"var(--mono)",fontSize:12,color:"var(--text2)",
            lineHeight:1.85,whiteSpace:"pre-wrap",
            maxHeight:300,overflowY:"auto",marginBottom:16,
          }}>{item.body}</div>

          <div style={{display:"flex",gap:8}}>
            <Btn onClick={()=>onCopy(`s_${item.id}`,item.subject)} done={copied[`s_${item.id}`]} doneLabel="✓ Copied" label="Copy subject"/>
            <Btn onClick={()=>onCopy(`e_${item.id}`,`Subject: ${item.subject}\n\n${item.body}`)} done={copied[`e_${item.id}`]} doneLabel="✓ Copied" label="Copy full email" primary/>
            <Btn onClick={()=>!pushed&&!pushing&&onPush(item)} done={pushed} doneLabel="✓ In Notion" loading={pushing} loadLabel="Sending…" label="→ Notion" notion/>
          </div>
        </div>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════
   PIPELINE
═══════════════════════════════════════════ */
function Pipeline({ results, statusMap, onStatus, copied, onCopy, pushing, pushed, onPush }) {
  return (
    <div style={{display:"flex",gap:14,padding:"20px 28px 64px",overflowX:"auto",alignItems:"flex-start"}}>
      {STATUSES.map(st=>{
        const items=results.filter(r=>(statusMap[r.id]||"To Apply")===st.label);
        return (
          <div key={st.label} style={{width:300,flexShrink:0}}>
            <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:12,padding:"0 2px"}}>
              <div style={{width:7,height:7,borderRadius:"50%",background:st.color,boxShadow:`0 0 5px ${st.color}99`}}/>
              <span style={{fontSize:12,fontWeight:700,color:st.color}}>{st.label}</span>
              <span style={{fontFamily:"var(--mono)",fontSize:11,color:"var(--text4)",marginLeft:"auto"}}>{items.length}</span>
            </div>
            <div style={{display:"flex",flexDirection:"column",gap:10}}>
              {items.map(item=>(
                <MiniCard key={item.id} item={item} onStatus={s=>onStatus(item.id,s)}
                  copied={copied} onCopy={onCopy} pushing={pushing[item.id]} pushed={pushed[item.id]} onPush={onPush}/>
              ))}
              {items.length===0&&(
                <div style={{padding:"20px",textAlign:"center",background:"var(--bg1)",border:"1px dashed var(--line)",borderRadius:10,color:"var(--text4)",fontSize:12}}>
                  Empty
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function MiniCard({ item, onStatus, copied, onCopy, pushing, pushed, onPush }) {
  const [open,setOpen]=useState(false);
  return (
    <div style={{background:"var(--bg1)",border:`1px solid rgba(${item.trackRgb},.15)`,borderRadius:10,overflow:"hidden"}}>
      <div onClick={()=>setOpen(o=>!o)} style={{padding:"13px 15px",cursor:"pointer"}}>
        <div style={{fontSize:11,color:item.trackColor,marginBottom:6,fontWeight:600}}>{item.trackIcon} {item.trackLabel}</div>
        <div style={{fontFamily:"var(--serif)",fontStyle:"italic",fontSize:15,color:"#fff",marginBottom:2}}>{item.company}</div>
        <div style={{fontSize:12,color:"var(--text3)"}}>{item.role}</div>
        <div style={{display:"flex",justifyContent:"space-between",marginTop:8,alignItems:"center"}}>
          {item.link?<a href={item.link} target="_blank" rel="noreferrer" onClick={e=>e.stopPropagation()} style={{fontSize:11,color:item.trackColor}}>Apply ↗</a>:<span/>}
          <span style={{color:"var(--text4)",fontSize:11}}>{open?"▲":"▼"}</span>
        </div>
      </div>
      {open&&(
        <div style={{borderTop:"1px solid var(--line)",padding:"12px 15px",animation:"in-up .15s ease"}}>
          <div style={{fontFamily:"var(--mono)",fontSize:11,color:"var(--text3)",marginBottom:10,lineHeight:1.5}}>{item.subject}</div>
          <div style={{display:"flex",gap:6,marginBottom:10}}>
            <Btn small onClick={()=>onCopy(`s_${item.id}`,item.subject)} done={copied[`s_${item.id}`]} doneLabel="✓" label="Subj."/>
            <Btn small onClick={()=>onCopy(`e_${item.id}`,`Subject: ${item.subject}\n\n${item.body}`)} done={copied[`e_${item.id}`]} doneLabel="✓" label="Email" primary/>
            <Btn small onClick={()=>!pushed&&!pushing&&onPush(item)} done={pushed} doneLabel="✓" loading={pushing} loadLabel="…" label="Notion" notion/>
          </div>
          <div style={{display:"flex",gap:5,flexWrap:"wrap"}}>
            {STATUSES.map(s=>(
              <button key={s.label} onClick={()=>onStatus(s.label)} style={{
                padding:"3px 9px",borderRadius:6,fontSize:10,
                background:"rgba(255,255,255,0.03)",border:"1px solid rgba(255,255,255,0.07)",
                color:"var(--text3)",cursor:"pointer",fontFamily:"var(--sans)",
              }}>{s.label}</button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════
   EMPTY STATE
═══════════════════════════════════════════ */
function EmptyState({ onRun }) {
  return (
    <div style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",padding:"80px 28px",gap:24,textAlign:"center"}}>
      <div style={{display:"flex",gap:24,marginBottom:8}}>
        {TRACKS.map((t,i)=>(
          <div key={t.id} style={{animation:`in-up .5s cubic-bezier(.16,1,.3,1) ${i*.08}s both`,display:"flex",flexDirection:"column",alignItems:"center",gap:8}}>
            <div style={{width:52,height:52,borderRadius:14,background:`rgba(${t.rgb},.1)`,border:`1px solid rgba(${t.rgb},.2)`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:22,color:t.color}}>{t.icon}</div>
            <div style={{fontSize:12,color:t.color,fontWeight:600}}>{t.short}</div>
            <div style={{fontSize:10,color:"var(--text4)",fontFamily:"var(--mono)"}}>{t.tagline}</div>
          </div>
        ))}
      </div>
      <div>
        <div style={{fontFamily:"var(--serif)",fontStyle:"italic",fontSize:30,color:"#fff",marginBottom:10,lineHeight:1.15,animation:"in-up .5s cubic-bezier(.16,1,.3,1) .3s both"}}>
          Good morning, Nishant.
        </div>
        <div style={{fontSize:14,color:"var(--text2)",maxWidth:460,lineHeight:1.75,animation:"in-up .5s cubic-bezier(.16,1,.3,1) .4s both"}}>
          Scans Google, Adzuna, and Wellfound for real postings from the last 72 hours across all four tracks. Every result comes with a verified URL and a personalised draft email ready to send.
        </div>
      </div>
      <button onClick={onRun} style={{
        padding:"12px 28px",borderRadius:10,
        background:"linear-gradient(135deg,#5B8DEF 0%,#9B7EDE 100%)",
        color:"#fff",border:"none",fontSize:14,fontWeight:700,
        boxShadow:"0 4px 24px rgba(91,141,239,.35)",
        cursor:"pointer",letterSpacing:-0.2,
        animation:"in-up .5s cubic-bezier(.16,1,.3,1) .5s both",
      }}>
        ▶  Run Today's Search
      </button>
      <div style={{fontSize:12,color:"var(--text4)",fontFamily:"var(--mono)",animation:"in-up .5s cubic-bezier(.16,1,.3,1) .6s both"}}>
        tip — connect Notion in ⚙ Setup to push opportunities to your pipeline in one click
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════
   MICRO COMPONENTS
═══════════════════════════════════════════ */
function StatusBadge({ status, onChange }) {
  const [open,setOpen]=useState(false);
  const cfg=STATUSES.find(s=>s.label===status)||STATUSES[0];
  return (
    <div style={{position:"relative"}}>
      <button onClick={e=>{e.stopPropagation();setOpen(o=>!o);}} style={{
        display:"flex",alignItems:"center",gap:5,padding:"3px 10px",borderRadius:20,
        background:cfg.bg,border:`1px solid ${cfg.color}33`,color:cfg.color,fontSize:11,fontWeight:600,cursor:"pointer",
      }}>
        <span style={{width:5,height:5,borderRadius:"50%",background:cfg.color,flexShrink:0}}/>
        {status}
      </button>
      {open&&(
        <div style={{
          position:"absolute",top:"calc(100% + 6px)",right:0,zIndex:60,
          background:"var(--bg2)",border:"1px solid var(--line2)",borderRadius:10,
          padding:6,minWidth:160,boxShadow:"0 12px 40px rgba(0,0,0,.6)",animation:"in-up .15s ease",
        }}>
          {STATUSES.map(s=>(
            <button key={s.label} onClick={e=>{e.stopPropagation();onChange(s.label);setOpen(false);}} style={{
              display:"flex",alignItems:"center",gap:8,width:"100%",
              padding:"7px 10px",borderRadius:7,border:"none",
              background:s.label===status?"rgba(255,255,255,0.06)":"transparent",
              color:s.label===status?"#fff":"var(--text2)",
              fontSize:12,fontWeight:500,cursor:"pointer",textAlign:"left",
            }}>
              <span style={{width:6,height:6,borderRadius:"50%",background:s.color,flexShrink:0}}/>
              {s.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function Btn({ onClick, done, doneLabel, loading, loadLabel, label, primary, notion, small }) {
  const bg     = done?"rgba(61,186,143,.1)":notion?"rgba(91,141,239,.08)":primary?"rgba(255,255,255,.07)":"rgba(255,255,255,.04)";
  const border = done?"rgba(61,186,143,.25)":notion?"rgba(91,141,239,.2)":primary?"rgba(255,255,255,.12)":"rgba(255,255,255,.07)";
  const color  = done?"#3DBA8F":loading?"var(--text4)":notion?"#5B8DEF":primary?"var(--text)":"var(--text2)";
  return (
    <button onClick={onClick} disabled={done||loading} style={{
      flex:1,background:bg,border:`1px solid ${border}`,color,
      padding:small?"5px 8px":"8px 10px",borderRadius:8,
      fontSize:small?11:12,fontWeight:500,
      cursor:done||loading?"default":"pointer",transition:"all .15s",
    }}>
      {done?doneLabel:loading?(loadLabel||"…"):label}
    </button>
  );
}

function TBtn({ children, onClick, active }) {
  return (
    <button onClick={onClick} style={{
      padding:"6px 14px",borderRadius:8,
      background:active?"rgba(255,255,255,.07)":"transparent",
      border:"1px solid rgba(255,255,255,.1)",
      color:active?"var(--text)":"var(--text3)",
      fontSize:12,fontWeight:500,
    }}>{children}</button>
  );
}

function Chip({ children, color }) {
  return (
    <span style={{
      fontSize:11,padding:"2px 9px",borderRadius:5,
      background:"rgba(255,255,255,.04)",border:"1px solid rgba(255,255,255,.07)",
      color:color||"var(--text3)",fontFamily:"var(--mono)",
    }}>{children}</span>
  );
}

function ML({ children }) {
  return <div style={{fontSize:10,letterSpacing:1.2,textTransform:"uppercase",color:"var(--text4)",marginBottom:7,fontFamily:"var(--mono)"}}>{children}</div>;
}

function FL({ children }) {
  return <div style={{fontSize:11,color:"var(--text3)",marginBottom:6,fontWeight:500}}>{children}</div>;
}

function Spin() {
  return <span style={{display:"inline-block",width:12,height:12,border:"2px solid rgba(255,255,255,.2)",borderTopColor:"#fff",borderRadius:"50%",animation:"spin .65s linear infinite"}}/>;
}
