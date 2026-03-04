import { useState, useRef, useCallback } from "react";

const SAMPLE_CONTRACT = `SMLOUVA O DÍLO

uzavřená dle § 2586 a násl. zákona č. 89/2012 Sb., občanský zákoník

Smluvní strany:
Objednatel: XYZ Solutions s.r.o., IČO: 12345678
Zhotovitel: [Vaše jméno/firma]

Čl. 1 – Předmět smlouvy
Zhotovitel se zavazuje vytvořit webové stránky dle specifikace objednatele.

Čl. 2 – Cena a platební podmínky
Celková cena díla činí 50 000 Kč bez DPH. Faktura je splatná do 60 dnů od doručení.
V případě prodlení s platbou nevzniká zhotoviteli nárok na úroky z prodlení.

Čl. 3 – Termín plnění
Dílo bude dokončeno do 30 dnů od podpisu smlouvy. Za každý den prodlení je zhotovitel povinen uhradit smluvní pokutu ve výši 2 000 Kč, maximálně však do výše 100 % ceny díla.

Čl. 4 – Autorská práva
Veškerá autorská práva k dílu přechází na objednatele okamžikem podpisu smlouvy, bez ohledu na zaplacení ceny. Zhotovitel se vzdává veškerých osobnostních práv k dílu.

Čl. 5 – Mlčenlivost a konkurenční doložka
Zhotovitel se zavazuje po dobu 3 let od ukončení smlouvy neposkytovat služby konkurenčním subjektům, přičemž definici "konkurenčního subjektu" určuje výhradně objednatel. Za porušení této povinnosti se sjednává smluvní pokuta 500 000 Kč.

Čl. 6 – Automatické prodloužení
Tato smlouva se automaticky prodlužuje vždy o 12 měsíců, pokud není písemně vypovězena nejméně 90 dnů před koncem smluvního období.

Čl. 7 – Záruky
Zhotovitel poskytuje záruku na dílo po dobu 5 let a je povinen bezplatně opravit veškeré vady do 48 hodin od nahlášení, a to i o svátcích a víkendech.

Čl. 8 – Rozhodné právo
Veškeré spory budou řešeny u soudu v místě sídla objednatele.`;

const THEMES = {
  danger: { bg: "#FF2D551A", border: "#FF2D55", text: "#FF2D55", icon: "⚠️", label: "Kritické riziko" },
  warning: { bg: "#FF9F0A1A", border: "#FF9F0A", text: "#FF9F0A", icon: "⚡", label: "Pozor" },
  info: { bg: "#0A84FF1A", border: "#0A84FF", text: "#0A84FF", icon: "ℹ️", label: "Upozornění" },
};

async function analyzeContract(contractText) {
  const systemPrompt = `Jsi expert na českou smluvní právo a specialista na ochranu práv slabší smluvní strany. Analyzuješ smlouvy z pohledu freelancerů a malých firem.

Vrať POUZE validní JSON v tomto přesném formátu (žádný markdown, žádné komentáře):
{
  "summary": "2-3 věty o smlouvě celkově",
  "riskScore": 75,
  "redFlags": [
    {
      "id": "1",
      "severity": "danger",
      "title": "Název problému",
      "quote": "přesná citace z textu smlouvy",
      "explanation": "Co to v praxi znamená",
      "humanVersion": "Jednou větou pro normálního člověka"
    }
  ],
  "deadlines": [
    {
      "id": "1",
      "label": "Název termínu",
      "date": "30 dní od podpisu",
      "type": "delivery"
    }
  ],
  "counterProposalPoints": [
    "Konkrétní bod ke změně"
  ]
}

severity může být: "danger", "warning", nebo "info"
riskScore je 0-100 (100 = extrémně nebezpečné)
Najdi VŠECHNY pasti a nevýhodné klauzule.`;

  const response = await fetch("/api/analyze", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "claude-sonnet-4-20250514",
      max_tokens: 4000,
      system: systemPrompt,
      messages: [{ role: "user", content: `Analyzuj tuto smlouvu:\n\n${contractText}` }],
    }),
  });
  const data = await response.json();
  if (data.error) throw new Error(data.error.message);
  const raw = data.content[0].text.replace(/```json|```/g, "").trim();
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start === -1 || end === -1) throw new Error("AI nevrátilo platný JSON.");
  return JSON.parse(raw.slice(start, end + 1));
}

async function generateCounterProposal(contractText, points) {
  const response = await fetch("/api/analyze", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "claude-sonnet-4-20250514",
      max_tokens: 1000,
      messages: [{
        role: "user",
        content: `Napiš profesionální, zdvořilý e-mail v češtině, kde navrhuji úpravy smlouvy. Body ke změně: ${points.join(", ")}. Smlouva: ${contractText.substring(0, 500)}... E-mail by měl být přátelský ale pevný, zachovat obchodní vztah.`
      }],
    }),
  });
  const data = await response.json();
  return data.content[0].text;
}

export default function ContractGuard() {
  const [tab, setTab] = useState("upload");
  const [contractText, setContractText] = useState("");
  const [analysis, setAnalysis] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [counterEmail, setCounterEmail] = useState("");
  const [generatingEmail, setGeneratingEmail] = useState(false);
  const [copied, setCopied] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const fileRef = useRef();

  const handleAnalyze = async (text) => {
    if (!text.trim()) { setError("Vložte text smlouvy."); return; }
    setLoading(true); setError(""); setAnalysis(null); setCounterEmail("");
    try {
      const result = await analyzeContract(text);
      setAnalysis(result);
      setTab("results");
    } catch (e) {
      setError("Chyba při analýze: " + e.message);
    }
    setLoading(false);
  };

  const handleGenerateEmail = async () => {
    setGeneratingEmail(true);
    const email = await generateCounterProposal(contractText, analysis.counterProposalPoints);
    setCounterEmail(email);
    setGeneratingEmail(false);
  };

  const handleDrop = useCallback((e) => {
    e.preventDefault(); setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (ev) => setContractText(ev.target.result);
      reader.readAsText(file);
    }
  }, []);

  const riskColor = analysis ? (analysis.riskScore >= 70 ? "#FF2D55" : analysis.riskScore >= 40 ? "#FF9F0A" : "#30D158") : "#666";
  const riskLabel = analysis ? (analysis.riskScore >= 70 ? "Vysoké riziko" : analysis.riskScore >= 40 ? "Střední riziko" : "Nízké riziko") : "";

  return (
    <div style={{
      minHeight: "100vh", background: "#0A0A0F", color: "#E8E4DC",
      fontFamily: "'Georgia', 'Times New Roman', serif",
    }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400;700;900&family=DM+Sans:wght@300;400;500&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        ::-webkit-scrollbar { width: 4px; } ::-webkit-scrollbar-track { background: #111; } ::-webkit-scrollbar-thumb { background: #C9A84C; border-radius: 2px; }
        .tab-btn { background: none; border: none; cursor: pointer; padding: 10px 20px; font-family: 'DM Sans', sans-serif; font-size: 13px; letter-spacing: 0.1em; text-transform: uppercase; transition: all 0.2s; color: #666; position: relative; }
        .tab-btn.active { color: #C9A84C; }
        .tab-btn.active::after { content:''; position:absolute; bottom:0; left:20%; right:20%; height:2px; background:#C9A84C; border-radius:1px; }
        .tab-btn:hover { color: #C9A84C; }
        .btn-primary { background: linear-gradient(135deg, #C9A84C, #E8C96A); color: #0A0A0F; border: none; padding: 14px 32px; font-family: 'DM Sans', sans-serif; font-weight: 500; font-size: 14px; letter-spacing: 0.05em; cursor: pointer; border-radius: 4px; transition: all 0.2s; }
        .btn-primary:hover { transform: translateY(-1px); box-shadow: 0 8px 24px #C9A84C44; }
        .btn-primary:disabled { opacity: 0.5; cursor: not-allowed; transform: none; }
        .btn-secondary { background: none; border: 1px solid #C9A84C44; color: #C9A84C; padding: 10px 24px; font-family: 'DM Sans', sans-serif; font-size: 13px; cursor: pointer; border-radius: 4px; transition: all 0.2s; letter-spacing: 0.05em; }
        .btn-secondary:hover { background: #C9A84C11; }
        .flag-card { border-radius: 8px; padding: 20px; margin-bottom: 16px; border-left: 3px solid; transition: transform 0.15s; }
        .flag-card:hover { transform: translateX(4px); }
        .pulse { animation: pulse 2s infinite; }
        @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.6} }
        @keyframes fadeIn { from{opacity:0;transform:translateY(12px)} to{opacity:1;transform:translateY(0)} }
        .fade-in { animation: fadeIn 0.4s ease forwards; }
        .spinner { width:20px;height:20px;border:2px solid #C9A84C33;border-top-color:#C9A84C;border-radius:50%;animation:spin 0.8s linear infinite;display:inline-block; }
        @keyframes spin { to{transform:rotate(360deg)} }
        textarea { background: #111118; border: 1px solid #2A2A3A; color: #E8E4DC; border-radius: 8px; padding: 16px; font-family: 'DM Sans', sans-serif; font-size: 14px; line-height: 1.7; resize: vertical; transition: border-color 0.2s; width: 100%; }
        textarea:focus { outline: none; border-color: #C9A84C66; }
        .risk-ring { position:relative;display:flex;align-items:center;justify-content:center; }
        .deadline-item { display:flex;gap:16px;padding:16px;background:#111118;border-radius:8px;margin-bottom:10px;border:1px solid #1E1E2E;align-items:center; }
        .copy-toast { position:fixed;bottom:24px;right:24px;background:#30D158;color:#fff;padding:12px 20px;border-radius:8px;font-family:'DM Sans',sans-serif;font-size:13px;animation:fadeIn 0.3s ease; }
      `}</style>

      {/* Header */}
      <header style={{ borderBottom: "1px solid #1E1E2E", padding: "0 32px", background: "#0D0D14" }}>
        <div style={{ maxWidth: 900, margin: "0 auto", display: "flex", alignItems: "center", justifyContent: "space-between", height: 64 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{ width: 36, height: 36, background: "linear-gradient(135deg,#C9A84C,#8B6914)", borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18 }}>⚖</div>
            <div>
              <div style={{ fontFamily: "'Playfair Display', serif", fontWeight: 700, fontSize: 18, color: "#E8E4DC", letterSpacing: "-0.02em" }}>Contract Guard</div>
              <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 10, color: "#666", letterSpacing: "0.12em", textTransform: "uppercase" }}>Právní hlídka</div>
            </div>
          </div>
          {analysis && (
            <div style={{ display: "flex", alignItems: "center", gap: 8, fontFamily: "'DM Sans', sans-serif", fontSize: 13 }}>
              <div style={{ width: 8, height: 8, borderRadius: "50%", background: riskColor, boxShadow: `0 0 8px ${riskColor}` }} className="pulse" />
              <span style={{ color: riskColor, fontWeight: 500 }}>{riskLabel}: {analysis.riskScore}/100</span>
            </div>
          )}
        </div>
      </header>

      {/* Tabs */}
      <div style={{ borderBottom: "1px solid #1E1E2E", background: "#0D0D14" }}>
        <div style={{ maxWidth: 900, margin: "0 auto", display: "flex" }}>
          {[
            { id: "upload", label: "📄 Smlouva" },
            { id: "results", label: "🚨 Analýza", disabled: !analysis },
            { id: "counter", label: "✉️ Protinávrh", disabled: !analysis },
            { id: "calendar", label: "📅 Termíny", disabled: !analysis },
          ].map(t => (
            <button key={t.id} className={`tab-btn ${tab === t.id ? "active" : ""}`}
              onClick={() => !t.disabled && setTab(t.id)}
              style={{ opacity: t.disabled ? 0.3 : 1, cursor: t.disabled ? "not-allowed" : "pointer" }}>
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <main style={{ maxWidth: 900, margin: "0 auto", padding: "32px 32px" }}>

        {/* UPLOAD TAB */}
        {tab === "upload" && (
          <div className="fade-in">
            <div style={{ marginBottom: 28 }}>
              <h1 style={{ fontFamily: "'Playfair Display', serif", fontSize: 32, fontWeight: 900, color: "#E8E4DC", marginBottom: 8 }}>
                Nahrajte svou smlouvu
              </h1>
              <p style={{ fontFamily: "'DM Sans', sans-serif", color: "#888", fontSize: 15, lineHeight: 1.6 }}>
                AI okamžitě odhalí pasti, vysvětlí rizika a navrhne, jak smlouvu zlepšit ve váš prospěch.
              </p>
            </div>

            {/* Drop zone */}
            <div
              onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={handleDrop}
              onClick={() => fileRef.current.click()}
              style={{
                border: `2px dashed ${isDragging ? "#C9A84C" : "#2A2A3A"}`,
                borderRadius: 12, padding: "32px 24px", textAlign: "center", cursor: "pointer",
                background: isDragging ? "#C9A84C08" : "#111118", transition: "all 0.2s", marginBottom: 20,
              }}>
              <div style={{ fontSize: 36, marginBottom: 10 }}>📎</div>
              <div style={{ fontFamily: "'DM Sans', sans-serif", color: "#888", fontSize: 14 }}>
                Přetáhněte soubor (.txt) nebo <span style={{ color: "#C9A84C" }}>klikněte pro výběr</span>
              </div>
              <input ref={fileRef} type="file" accept=".txt,.pdf" style={{ display: "none" }}
                onChange={(e) => {
                  const file = e.target.files[0];
                  if (file) { const r = new FileReader(); r.onload = ev => setContractText(ev.target.result); r.readAsText(file); }
                }} />
            </div>

            <div style={{ textAlign: "center", color: "#444", fontFamily: "'DM Sans',sans-serif", fontSize: 13, marginBottom: 20 }}>— nebo vložte text přímo —</div>

            <textarea
              rows={12}
              placeholder="Vložte text smlouvy sem..."
              value={contractText}
              onChange={e => setContractText(e.target.value)}
            />

            {/* Sample */}
            <button className="btn-secondary" style={{ marginTop: 12, marginBottom: 24 }}
              onClick={() => setContractText(SAMPLE_CONTRACT)}>
              Načíst ukázkovou smlouvu
            </button>

            {error && (
              <div style={{ background: "#FF2D5511", border: "1px solid #FF2D5544", borderRadius: 8, padding: 14, marginBottom: 20, fontFamily: "'DM Sans',sans-serif", fontSize: 14, color: "#FF2D55" }}>
                {error}
              </div>
            )}

            <div style={{ display: "flex", gap: 16, alignItems: "center" }}>
              <button className="btn-primary" disabled={loading || !contractText.trim()} onClick={() => handleAnalyze(contractText)}>
                {loading ? <><span className="spinner" /> &nbsp;Analyzuji...</> : "🔍 Spustit analýzu"}
              </button>
              {loading && (
                <div style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 13, color: "#888" }}>
                  AI čte a hodnotí každý odstavec smlouvy...
                </div>
              )}
            </div>

            {/* Features */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginTop: 40 }}>
              {[
                { icon: "🚨", title: "Red-Flag Scanner", desc: "Automaticky identifikuje nevyvážené klauzule, skryté sankce a pasti." },
                { icon: "🗣️", title: "Lidský překladač", desc: "Právnická hantýrka přeložena do jedné srozumitelné věty." },
                { icon: "✉️", title: "Generátor protinávrhů", desc: "Profesionální e-mail s návrhem úprav, který zachová obchodní vztah." },
                { icon: "📅", title: "Hlídač termínů", desc: "Klíčová data ze smlouvy přehledně na jednom místě." },
              ].map(f => (
                <div key={f.title} style={{ background: "#111118", border: "1px solid #1E1E2E", borderRadius: 10, padding: "20px 22px" }}>
                  <div style={{ fontSize: 22, marginBottom: 8 }}>{f.icon}</div>
                  <div style={{ fontFamily: "'Playfair Display',serif", fontSize: 15, fontWeight: 700, marginBottom: 6, color: "#E8E4DC" }}>{f.title}</div>
                  <div style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 13, color: "#666", lineHeight: 1.6 }}>{f.desc}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* RESULTS TAB */}
        {tab === "results" && analysis && (
          <div className="fade-in">
            {/* Risk meter */}
            <div style={{ background: "#111118", border: "1px solid #1E1E2E", borderRadius: 12, padding: "24px 28px", marginBottom: 28, display: "flex", gap: 28, alignItems: "center" }}>
              <div style={{ position: "relative", width: 80, height: 80, flexShrink: 0 }}>
                <svg viewBox="0 0 80 80" style={{ width: 80, height: 80, transform: "rotate(-90deg)" }}>
                  <circle cx="40" cy="40" r="34" fill="none" stroke="#1E1E2E" strokeWidth="8" />
                  <circle cx="40" cy="40" r="34" fill="none" stroke={riskColor} strokeWidth="8"
                    strokeDasharray={`${2 * Math.PI * 34 * analysis.riskScore / 100} 999`}
                    strokeLinecap="round" style={{ transition: "stroke-dasharray 1s ease" }} />
                </svg>
                <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
                  <span style={{ fontFamily: "'Playfair Display',serif", fontWeight: 900, fontSize: 20, color: riskColor, lineHeight: 1 }}>{analysis.riskScore}</span>
                  <span style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 9, color: "#666", textTransform: "uppercase", letterSpacing: "0.05em" }}>/100</span>
                </div>
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontFamily: "'Playfair Display',serif", fontSize: 20, fontWeight: 700, color: riskColor, marginBottom: 6 }}>{riskLabel}</div>
                <div style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 14, color: "#999", lineHeight: 1.6 }}>{analysis.summary}</div>
              </div>
            </div>

            <h2 style={{ fontFamily: "'Playfair Display',serif", fontSize: 22, fontWeight: 700, marginBottom: 20, color: "#E8E4DC" }}>
              Nalezené problémy ({analysis.redFlags?.length || 0})
            </h2>

            {analysis.redFlags?.map((flag, i) => {
              const theme = THEMES[flag.severity] || THEMES.info;
              return (
                <div key={flag.id || i} className="flag-card"
                  style={{ background: theme.bg, borderLeftColor: theme.border }}>
                  <div style={{ display: "flex", alignItems: "flex-start", gap: 12, marginBottom: 12 }}>
                    <span style={{ fontSize: 18 }}>{theme.icon}</span>
                    <div style={{ flex: 1 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
                        <span style={{ fontFamily: "'Playfair Display',serif", fontWeight: 700, fontSize: 16, color: "#E8E4DC" }}>{flag.title}</span>
                        <span style={{ background: theme.border + "22", color: theme.text, padding: "2px 8px", borderRadius: 20, fontFamily: "'DM Sans',sans-serif", fontSize: 11, fontWeight: 500, letterSpacing: "0.05em" }}>{theme.label}</span>
                      </div>
                      {flag.quote && (
                        <blockquote style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 13, color: "#888", fontStyle: "italic", borderLeft: `2px solid ${theme.border}44`, paddingLeft: 12, margin: "8px 0", lineHeight: 1.6 }}>
                          "{flag.quote}"
                        </blockquote>
                      )}
                    </div>
                  </div>
                  <div style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 14, color: "#BBB", lineHeight: 1.6, marginBottom: 10 }}>{flag.explanation}</div>
                  <div style={{ background: "#0A0A0F44", borderRadius: 6, padding: "10px 14px", fontFamily: "'DM Sans',sans-serif", fontSize: 13, lineHeight: 1.6 }}>
                    <span style={{ color: theme.text, fontWeight: 500 }}>Co to znamená pro vás: </span>
                    <span style={{ color: "#DDD" }}>{flag.humanVersion}</span>
                  </div>
                </div>
              );
            })}

            <div style={{ marginTop: 28, textAlign: "center" }}>
              <button className="btn-primary" onClick={() => setTab("counter")}>
                ✉️ Chci to férověji — vygenerovat protinávrh
              </button>
            </div>
          </div>
        )}

        {/* COUNTER PROPOSAL TAB */}
        {tab === "counter" && analysis && (
          <div className="fade-in">
            <h2 style={{ fontFamily: "'Playfair Display',serif", fontSize: 28, fontWeight: 900, marginBottom: 8, color: "#E8E4DC" }}>
              Generátor protinávrhů
            </h2>
            <p style={{ fontFamily: "'DM Sans',sans-serif", color: "#888", fontSize: 14, marginBottom: 28, lineHeight: 1.6 }}>
              AI napíše zdvořilý, profesionální e-mail kde navrhne úpravy nevyvážených klauzulí — bez zbytečného konfliktu.
            </p>

            <div style={{ background: "#111118", border: "1px solid #1E1E2E", borderRadius: 10, padding: 24, marginBottom: 24 }}>
              <div style={{ fontFamily: "'Playfair Display',serif", fontSize: 15, fontWeight: 700, marginBottom: 14, color: "#C9A84C" }}>
                📋 Body ke změně
              </div>
              {analysis.counterProposalPoints?.map((point, i) => (
                <div key={i} style={{ display: "flex", gap: 10, alignItems: "flex-start", marginBottom: 10, fontFamily: "'DM Sans',sans-serif", fontSize: 14, color: "#CCC", lineHeight: 1.5 }}>
                  <span style={{ color: "#C9A84C", marginTop: 2 }}>→</span>
                  <span>{point}</span>
                </div>
              ))}
            </div>

            {!counterEmail && (
              <button className="btn-primary" disabled={generatingEmail} onClick={handleGenerateEmail}>
                {generatingEmail ? <><span className="spinner" /> &nbsp;Generuji e-mail...</> : "✉️ Vygenerovat e-mail"}
              </button>
            )}

            {counterEmail && (
              <div className="fade-in">
                <div style={{ background: "#111118", border: "1px solid #2A2A3A", borderRadius: 10, padding: 24, marginTop: 8 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
                    <div style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 12, color: "#666", textTransform: "uppercase", letterSpacing: "0.1em" }}>Vygenerovaný e-mail</div>
                    <button className="btn-secondary" style={{ padding: "6px 16px", fontSize: 12 }}
                      onClick={() => { navigator.clipboard.writeText(counterEmail); setCopied(true); setTimeout(() => setCopied(false), 2500); }}>
                      📋 Kopírovat
                    </button>
                  </div>
                  <pre style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 14, color: "#DDD", lineHeight: 1.8, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
                    {counterEmail}
                  </pre>
                </div>
                <button className="btn-secondary" style={{ marginTop: 14 }} onClick={() => { setCounterEmail(""); handleGenerateEmail(); }}>
                  🔄 Regenerovat
                </button>
              </div>
            )}
          </div>
        )}

        {/* CALENDAR TAB */}
        {tab === "calendar" && analysis && (
          <div className="fade-in">
            <h2 style={{ fontFamily: "'Playfair Display',serif", fontSize: 28, fontWeight: 900, marginBottom: 8, color: "#E8E4DC" }}>
              Důležité termíny
            </h2>
            <p style={{ fontFamily: "'DM Sans',sans-serif", color: "#888", fontSize: 14, marginBottom: 28 }}>
              Klíčová data vytažená ze smlouvy, na která nesmíte zapomenout.
            </p>

            {analysis.deadlines?.length > 0 ? analysis.deadlines.map((d, i) => {
              const typeConfig = {
                delivery: { icon: "📦", color: "#0A84FF", label: "Dodání" },
                payment: { icon: "💰", color: "#30D158", label: "Platba" },
                termination: { icon: "🔔", color: "#FF9F0A", label: "Výpověď" },
                renewal: { icon: "🔄", color: "#BF5AF2", label: "Obnova" },
                default: { icon: "📅", color: "#C9A84C", label: "Termín" },
              };
              const cfg = typeConfig[d.type] || typeConfig.default;
              return (
                <div key={d.id || i} className="deadline-item">
                  <div style={{ width: 44, height: 44, background: cfg.color + "22", borderRadius: 10, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20, flexShrink: 0 }}>
                    {cfg.icon}
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontFamily: "'DM Sans',sans-serif", fontWeight: 500, fontSize: 15, color: "#E8E4DC", marginBottom: 3 }}>{d.label}</div>
                    <div style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 13, color: "#888" }}>{d.date}</div>
                  </div>
                  <div style={{ background: cfg.color + "22", color: cfg.color, padding: "4px 10px", borderRadius: 20, fontFamily: "'DM Sans',sans-serif", fontSize: 11, fontWeight: 500, flexShrink: 0 }}>
                    {cfg.label}
                  </div>
                </div>
              );
            }) : (
              <div style={{ textAlign: "center", padding: "48px 0", fontFamily: "'DM Sans',sans-serif", color: "#555" }}>
                Žádné konkrétní termíny nebyly nalezeny.
              </div>
            )}

            <div style={{ marginTop: 28, background: "#FF9F0A11", border: "1px solid #FF9F0A33", borderRadius: 10, padding: "16px 20px", fontFamily: "'DM Sans',sans-serif", fontSize: 13, color: "#FF9F0A", lineHeight: 1.6 }}>
              ⚡ <strong>Tip:</strong> Přidejte si termíny do svého kalendáře s předstihem 2–4 týdny, abyste měli čas reagovat.
            </div>
          </div>
        )}

      </main>

      {/* Legal disclaimer */}
      <div style={{ borderTop: "1px solid #1E1E2E", padding: "16px 32px", textAlign: "center", fontFamily: "'DM Sans',sans-serif", fontSize: 11, color: "#444", letterSpacing: "0.03em" }}>
        Contract Guard je AI nástroj a nenahrazuje právní poradenství. Pro závažné smlouvy konzultujte advokáta.
      </div>

      {copied && <div className="copy-toast">✓ Zkopírováno do schránky</div>}
    </div>
  );
}
