// /api/email.js
// Claude is ONLY called here — purely for email drafting
// Job data is already real and verified before this runs

const PROFILE = {
  sig: "Nishant\nMBA 2027, London Business School (Vodafone Foundation Scholar)\nnishantm.mba2027@london.edu",
  bg: `6 years at Schneider Electric — most recently Strategy & Governance Lead: built 5-year digital strategy, $100M productivity roadmap, $55M savings across 80+ initiatives, architected AI transformation roadmap with the CSO's office (20+ use cases, 45% AI adoption increase). Before that Product Manager: global intelligence platform 100K+ users across 80 countries generating $24M annual value, redesigned the $30B Energy Management platform (MAU +20%, conversion +12%, 80% faster time-to-market). Also Chief of Staff at MEOBYR (AI retail startup London): built investor strategy, extended runway 12 months, £120K pipeline. LBS: leads VC & Incubator Treks for the Entrepreneurship Club, Chief of Staff at Consulting Club, INSEAD Product Games finalist top 4 of 80+. Engineering undergrad Electronics & Communications from VIT India. Deep expertise in Enterprise AI, B2B SaaS, Energy/Climate Tech, Industrial Automation.`,
};

const RULES = (sig) => `
CANDIDATE BACKGROUND:
${PROFILE.bg}

STRICT WRITING RULES — violate none of these:
• No em dashes anywhere in the email
• No colon mid-sentence  
• Never open with asking for an internship — lead with their world first
• The internship request appears naturally 2/3 through the email, never as the opener
• Direct, confident, human — no corporate filler ("I hope this finds you well", "I wanted to reach out")
• Numbers as words (e.g. "six years" not "6 years")
• End line: Would a 20-minute call work?
• Sign off EXACTLY as written below, nothing added, nothing changed:
${sig}

OUTPUT — nothing before or after, exactly this format:
SUBJECT: [subject line]

[email body]
`;

const PROMPTS = {
  strategy: (company, role, snippet, salary) => `${RULES(PROFILE.sig)}

Write a cold email to someone in the strategy team at ${company} for the role: ${role}.
ROLE DETAILS: ${snippet}${salary ? ` Salary range: ${salary}.` : ""}

STRUCTURE:
1. One sharp observation about ${company}'s strategic position, expansion, or challenge. Reference the role details. Feel like you've been watching them.
2. Connect to Nishant's Schneider strategy experience — 5-year digital roadmap, hundred-million-dollar productivity programme — two fluid sentences, no bullets.
3. Brief LBS MBA mention. Offer to share a written perspective on one specific area before the call.
4. Close.

SUBJECT: "A thought on [Company]'s [specific move/challenge]"`,

  ceo_office: (company, role, snippet) => `${RULES(PROFILE.sig)}

Write a cold email to the founder or CEO of ${company} for the role: ${role}.
ROLE DETAILS: ${snippet}

STRUCTURE:
1. Open with a specific observation about where ${company} is right now — their stage, a challenge, a tension. Read the role details and infer what they're navigating.
2. "I've been in that room." Weave in: CoS at MEOBYR (AI startup London, built investor strategy, extended runway 12 months) AND Schneider (aligned 15 global leaders on a hundred-million-dollar roadmap — the politics were harder than the analysis). Fluid prose, not a list.
3. One crisp sentence about what he's actually good at in this role.
4. Brief LBS MBA mention. Offer one specific idea around a challenge ${company} is likely facing.
5. Close.

SUBJECT: "Re: ${company} and something I noticed" or "${company} — a thought from the inside out"`,

  pm: (company, role, snippet) => `${RULES(PROFILE.sig)}

Write a cold email to the product lead at ${company} for the role: ${role}.
ROLE DETAILS: ${snippet}

STRUCTURE:
1. Open with a specific product observation from genuinely studying ${company}'s product — a friction point, a design gap, a user journey tension. Name the hypothesis about why it exists.
2. Connect to Schneider PM experience — four years, global intelligence platform, hundred thousand users across eighty countries, twenty-four million dollars in annual value — two sentences.
3. INSEAD Product Games finalist (top four of 80+). Offer to write up the observation as a note before the call. Brief LBS MBA mention.
4. Close.

SUBJECT: "A user journey I kept getting stuck on in [specific product or feature name]"`,

  vc: (company, role, snippet) => `${RULES(PROFILE.sig)}

Write a cold email to a partner or principal at ${company} for the role: ${role}.
ROLE DETAILS: ${snippet}

First, infer this fund's investment thesis from the role details and company name.
Then choose the single most relevant operator lens from Nishant's background:
- Enterprise AI / B2B SaaS → evaluated 20+ AI use cases at Schneider, knows what gets bought vs killed in committee
- Climate / Energy Tech → owned the thirty-billion-dollar Schneider Energy Management platform, understands enterprise energy buyer psychology firsthand  
- Deep Tech / Hardware → ECE engineering background, built industrial automation systems
- Emerging Markets / India → ran India market entry for a European enterprise firm, fifty million in identified revenue opportunities

STRUCTURE:
1. Sharp market insight specific to THIS fund's thesis — must feel like genuine operator knowledge. Reference one specific portfolio company or investment focus from the role details.
2. Relevant background parts only. LBS MBA + VC & Incubator Treks Lead — one sentence.
3. Summer contribution: sourcing, diligence, founder support. Lead with operator lens angle.
4. Close with: Would a 20-minute call be worth it?

SUBJECT: "A pattern I keep seeing in [their specific sector]"`,
};

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();

  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return res.status(500).json({ error: "ANTHROPIC_API_KEY not configured" });

  const { trackId, company, role, snippet, salary } = req.body;
  if (!trackId || !company || !role) return res.status(400).json({ error: "trackId, company, role required" });

  const promptFn = PROMPTS[trackId] || PROMPTS.strategy;
  const prompt   = promptFn(company, role, snippet || "", salary || null);

  try {
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type":  "application/json",
        "x-api-key":     key,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model:      "claude-sonnet-4-20250514",
        max_tokens: 1000,
        messages:   [{ role: "user", content: prompt }],
      }),
    });

    const data = await r.json();
    if (data.error) return res.status(400).json({ error: data.error.message });

    const raw   = data.content.filter(b => b.type === "text").map(b => b.text).join("\n");
    const lines = raw.split("\n");
    const si    = lines.findIndex(l => l.startsWith("SUBJECT:"));
    const subject = si >= 0 ? lines[si].replace("SUBJECT:", "").trim() : `Internship – ${company}`;
    const body    = lines.slice(si >= 0 ? si + 1 : 0).join("\n").replace(/^\s*\n/, "").trimEnd();

    return res.status(200).json({ subject, body });
  } catch(e) {
    return res.status(500).json({ error: e.message });
  }
}
