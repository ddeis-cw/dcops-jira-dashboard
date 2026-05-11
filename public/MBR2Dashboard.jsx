import { useState, useEffect, useCallback } from "react";

// ── Constants ─────────────────────────────────────────────────────────────────
const PROJECTS = [
  { key:"all", label:"All Projects",             short:"ALL", color:"#e2e8f0" },
  { key:"do",  label:"DCT-Ops",              short:"DO",  color:"#3b82f6" },
  { key:"sda", label:"Service Desk Albatross",short:"SDA", color:"#22c55e" },
  { key:"sde", label:"Service Desk Eagle",    short:"SDE", color:"#10b981" },
  { key:"sdh", label:"Service Desk Heron",    short:"SDH", color:"#06b6d4" },
  { key:"sdo", label:"Service Desk Osprey",   short:"SDO", color:"#f97316" },
  { key:"sdp", label:"Service Desk Phoenix",  short:"SDP", color:"#eab308" },
  { key:"sds", label:"Service Desk Snipe",    short:"SDN", color:"#a855f7" },
];

function buildMonthOptions(n = 14) {
  const opts = [];
  const now = new Date();
  for (let i = 0; i < n; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const end = new Date(d.getFullYear(), d.getMonth() + 1, 0);
    const pad = v => String(v).padStart(2,'0');
    opts.push({
      label: d.toLocaleString("en-US", { month:"long", year:"numeric" }),
      short: d.toLocaleString("en-US", { month:"short", year:"numeric" }),
      from:  `${d.getFullYear()}-${pad(d.getMonth()+1)}-01`,
      to:    `${end.getFullYear()}-${pad(end.getMonth()+1)}-${pad(end.getDate())}`,
    });
  }
  return opts;
}

const MONTHS = buildMonthOptions();

// ── Helpers ───────────────────────────────────────────────────────────────────
function prevMonth(m) {
  return MONTHS.find(x => x.from < m.from) || null;
}

function fmtHours(h) {
  if (h == null) return "—";
  if (h < 24)  return `${h.toFixed(1)}h`;
  return `${(h/24).toFixed(1)}d`;
}

function momArrow(pct, positiveIsGood = false) {
  if (pct === null) return { icon:"—", color:"#64748b" };
  const up = pct > 0;
  const good = positiveIsGood ? up : !up;
  return { icon: up ? `▲ +${pct}%` : `▼ ${pct}%`, color: good ? "#22c55e" : "#ef4444" };
}

// ── Sub-components ────────────────────────────────────────────────────────────
function KPICard({ title, value, sub, color="#3b82f6", mom }) {
  const C = color;
  const arrow = mom != null ? momArrow(mom, title.includes("Close")) : null;
  return (
    <div style={{ background:"#1e293b", borderRadius:10, padding:"16px 18px", border:"1px solid #334155" }}>
      <div style={{ fontSize:10, color:"#64748b", textTransform:"uppercase", letterSpacing:".06em", marginBottom:6 }}>{title}</div>
      <div style={{ fontSize:28, fontWeight:700, color:C, marginBottom:4 }}>{value}</div>
      {sub  && <div style={{ fontSize:10, color:"#475569" }}>{sub}</div>}
      {arrow && <div style={{ fontSize:11, color:arrow.color, marginTop:4, fontWeight:600 }}>{arrow.icon} vs prev month</div>}
    </div>
  );
}

function SiteRow({ site, curr, prev, mom_pct, mom_delta, rank }) {
  const arr = momArrow(mom_pct, true);
  const closeRate = curr.total > 0 ? Math.round(curr.closed/curr.total*100) : 0;
  const rateCol = closeRate >= 90 ? "#22c55e" : closeRate >= 70 ? "#f59e0b" : "#ef4444";
  return (
    <tr style={{ borderBottom:"1px solid #1e293b" }}>
      <td style={{ padding:"8px 10px", color:"#64748b", fontSize:11, width:28 }}>#{rank}</td>
      <td style={{ padding:"8px 10px", fontWeight:700, color:"#e2e8f0", fontSize:12 }}>{site}</td>
      <td style={{ padding:"8px 10px", textAlign:"center", color:"#f1f5f9", fontWeight:600 }}>{curr.total.toLocaleString()}</td>
      <td style={{ padding:"8px 10px", textAlign:"center" }}>
        <span style={{ background:"#22c55e22", color:"#22c55e", borderRadius:4, padding:"2px 8px", fontWeight:700, fontSize:11 }}>
          {curr.closed.toLocaleString()}
        </span>
      </td>
      <td style={{ padding:"8px 10px", textAlign:"center" }}>
        <span style={{ color:rateCol, fontWeight:700, fontSize:11 }}>{closeRate}%</span>
      </td>
      <td style={{ padding:"8px 10px", textAlign:"center", color:"#f59e0b", fontSize:11 }}>{curr.on_hold || "—"}</td>
      <td style={{ padding:"8px 10px", textAlign:"center", color:"#94a3b8", fontSize:11 }}>{fmtHours(curr.mttr)}</td>
      <td style={{ padding:"8px 10px", textAlign:"center" }}>
        <span style={{ color:arr.color, fontWeight:700, fontSize:11 }}>{mom_pct != null ? arr.icon : "—"}</span>
      </td>
      <td style={{ padding:"8px 10px", textAlign:"center", color:"#64748b", fontSize:10 }}>
        {prev.closed > 0 ? prev.closed.toLocaleString() : "—"}
      </td>
    </tr>
  );
}

function TrendChart({ months, color="#3b82f6" }) {
  if (!months || months.length === 0) return null;
  const W=500, H=90, padL=32, padB=20, padT=4, padR=8;
  const cW=W-padL-padR, cH=H-padB-padT;
  const maxV = Math.max(...months.map(m=>m.total), 1);
  const pts = months.length;
  const xPx = i => padL + (pts>1 ? (i/(pts-1))*cW : cW/2);
  const yPx = v => padT + cH - (v/maxV)*cH;

  const closedPts = months.map((m,i) => `${xPx(i).toFixed(1)},${yPx(m.closed).toFixed(1)}`).join(" ");
  const totalPts  = months.map((m,i) => `${xPx(i).toFixed(1)},${yPx(m.total).toFixed(1)}`).join(" ");

  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ display:"block" }}>
      {[0,.5,1].map((f,i) => (
        <line key={i} x1={padL} y1={yPx(maxV*f).toFixed(1)} x2={W-padR} y2={yPx(maxV*f).toFixed(1)}
          stroke="rgba(255,255,255,.06)" strokeWidth=".5"/>
      ))}
      {months.map((m,i) => i%(Math.max(1,Math.floor(pts/5)))==0 && (
        <text key={i} x={xPx(i).toFixed(1)} y={H-4} textAnchor="middle" fill="#475569" fontSize="8">{m.month?.slice(0,7)}</text>
      ))}
      <polyline points={totalPts} fill="none" stroke={color} strokeWidth="1.5" strokeDasharray="4,3" opacity=".5"/>
      <polyline points={closedPts} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
      {months.map((m,i) => (
        <circle key={i} cx={xPx(i).toFixed(1)} cy={yPx(m.closed).toFixed(1)} r="2.5" fill={color}/>
      ))}
    </svg>
  );
}

function HeadlineCard({ rank, site, curr, prev, mom_pct, mom_delta }) {
  const arr = momArrow(mom_pct, true);
  const isUp = mom_pct != null && mom_pct > 0;
  return (
    <div style={{ background:"#1e293b", borderRadius:10, padding:"14px 16px", border:`1px solid ${isUp ? "#22c55e44" : mom_pct < 0 ? "#ef444444" : "#334155"}` }}>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start" }}>
        <div>
          <div style={{ fontSize:10, color:"#64748b", marginBottom:4 }}>#{rank} Site</div>
          <div style={{ fontSize:18, fontWeight:700, color:"#e2e8f0" }}>{site}</div>
        </div>
        <span style={{ fontSize:13, fontWeight:700, color:arr.color }}>{mom_pct != null ? arr.icon : "—"}</span>
      </div>
      <div style={{ marginTop:10, display:"grid", gridTemplateColumns:"1fr 1fr", gap:6 }}>
        <div>
          <div style={{ fontSize:9, color:"#64748b" }}>Closed (this mo.)</div>
          <div style={{ fontSize:18, fontWeight:700, color:"#22c55e" }}>{curr.closed.toLocaleString()}</div>
        </div>
        <div>
          <div style={{ fontSize:9, color:"#64748b" }}>Closed (prev mo.)</div>
          <div style={{ fontSize:18, fontWeight:700, color:"#94a3b8" }}>{prev.closed > 0 ? prev.closed.toLocaleString() : "—"}</div>
        </div>
        <div>
          <div style={{ fontSize:9, color:"#64748b" }}>Open / On Hold</div>
          <div style={{ fontSize:14, fontWeight:600, color:"#f59e0b" }}>{curr.open} / {curr.on_hold}</div>
        </div>
        <div>
          <div style={{ fontSize:9, color:"#64748b" }}>Avg MTTR</div>
          <div style={{ fontSize:14, fontWeight:600, color:"#7dd3fc" }}>{fmtHours(curr.mttr)}</div>
        </div>
      </div>
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────
export default function MBR2Dashboard() {
  const [selMonth,   setSelMonth]   = useState(MONTHS[1]);
  const [selProject, setSelProject] = useState("all");
  const [loading,    setLoading]    = useState(false);
  const [error,      setError]      = useState("");
  const [summary,    setSummary]    = useState(null);
  const [sites,      setSites]      = useState(null);
  const [trends,     setTrends]     = useState(null);
  const [statusTime, setStatusTime] = useState(null);
  const [prevSummary,setPrevSummary]= useState(null);

  const prev = prevMonth(selMonth);
  const proj = PROJECTS.find(p => p.key === selProject) || PROJECTS[0];

  const fetchAll = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const qs = `from=${selMonth.from}&to=${selMonth.to}&project=${selProject}`;
      const prevQs = prev ? `from=${prev.from}&to=${prev.to}&project=${selProject}` : null;

      const [sumRes, siteRes, trendRes, stRes] = await Promise.all([
        fetch(`/api/mbr2/summary?${qs}`),
        fetch(`/api/mbr2/sites?${qs}${prev ? `&prev_from=${prev.from}&prev_to=${prev.to}` : ""}`),
        fetch(`/api/mbr2/trends?months=6&project=${selProject}`),
        fetch(`/api/mbr2/status-time?${qs}`),
      ]);

      const [sum, site, trend, st] = await Promise.all([
        sumRes.json(), siteRes.json(), trendRes.json(), stRes.json()
      ]);

      setSummary(sum);
      setSites(site);
      setTrends(trend);
      setStatusTime(st);

      if (prevQs) {
        const ps = await fetch(`/api/mbr2/summary?${prevQs}`);
        setPrevSummary(await ps.json());
      } else {
        setPrevSummary(null);
      }
    } catch(e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [selMonth, selProject, prev]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const top5 = sites?.sites?.slice(0, 5) || [];
  const col  = proj.color;

  // MoM deltas for KPIs
  const momClosed = summary && prevSummary && prevSummary.closed > 0
    ? Math.round((summary.closed - prevSummary.closed) / prevSummary.closed * 100) : null;
  const momTotal  = summary && prevSummary && prevSummary.total > 0
    ? Math.round((summary.total - prevSummary.total) / prevSummary.total * 100) : null;

  return (
    <div style={{ minHeight:"100vh", background:"#0f172a", color:"#f1f5f9", fontFamily:"-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif", padding:"20px 24px" }}>

      {/* Header */}
      <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:20, flexWrap:"wrap", gap:10 }}>
        <div>
          <div style={{ fontSize:11, color:"#3b82f6", fontWeight:700, textTransform:"uppercase", letterSpacing:".1em", marginBottom:4 }}>CoreWeave · Data Center Operations</div>
          <div style={{ fontSize:24, fontWeight:700, color:"#e2e8f0" }}>MBR Dashboard v2</div>
          <div style={{ fontSize:12, color:"#64748b", marginTop:2 }}>Monthly Business Review — Local DB · {summary?.total?.toLocaleString() || "—"} tickets loaded</div>
        </div>
        <div style={{ display:"flex", gap:10, alignItems:"center", flexWrap:"wrap" }}>
          <select value={selMonth.from} onChange={e => setSelMonth(MONTHS.find(m=>m.from===e.target.value)||MONTHS[0])}
            style={{ fontSize:12, padding:"6px 12px", borderRadius:8, border:"1px solid #334155", background:"#1e293b", color:"#f1f5f9", cursor:"pointer" }}>
            {MONTHS.map(m => <option key={m.from} value={m.from}>{m.label}</option>)}
          </select>
          <select value={selProject} onChange={e => setSelProject(e.target.value)}
            style={{ fontSize:12, padding:"6px 12px", borderRadius:8, border:"1px solid #334155", background:"#1e293b", color:"#f1f5f9", cursor:"pointer" }}>
            {PROJECTS.map(p => <option key={p.key} value={p.key}>{p.short} — {p.label}</option>)}
          </select>
          <button onClick={fetchAll} disabled={loading}
            style={{ padding:"6px 16px", fontSize:12, fontWeight:600, borderRadius:8, border:"none", background: loading ? "#334155" : col, color:"#fff", cursor: loading ? "not-allowed" : "pointer" }}>
            {loading ? "Loading…" : "↻ Refresh"}
          </button>
        </div>
      </div>

      {error && <div style={{ background:"#7f1d1d", border:"1px solid #ef4444", borderRadius:8, padding:"10px 14px", marginBottom:16, fontSize:12 }}>⚠ {error}</div>}

      {loading && <div style={{ textAlign:"center", padding:"60px 0", color:"#64748b", fontSize:13 }}>Fetching data from local DB…</div>}

      {!loading && summary && (<>

        {/* KPI Row */}
        <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(160px,1fr))", gap:10, marginBottom:20 }}>
          <KPICard title="Total Tickets"   value={summary.total.toLocaleString()} color="#94a3b8" mom={momTotal}
            sub={`${selMonth.short}`}/>
          <KPICard title="Closed + Verif"  value={summary.closed.toLocaleString()} color="#22c55e" mom={momClosed}
            sub={`${summary.closeRate}% close rate`}/>
          <KPICard title="In Verification" value={summary.verif.toLocaleString()} color="#7dd3fc"
            sub="awaiting sign-off"/>
          <KPICard title="On Hold"         value={summary.onHold.toLocaleString()} color="#f59e0b"
            sub="blocked tickets"/>
          <KPICard title="In Progress"     value={summary.inProg.toLocaleString()} color="#6366f1"
            sub="actively worked"/>
          <KPICard title="Avg MTTR"        value={fmtHours(summary.mttrHours)} color="#3b82f6"
            sub="closed tickets only"/>
          <KPICard title="Avg Time Open"   value={summary.avgOpenDays != null ? `${summary.avgOpenDays}d` : "—"} color="#e879f9"
            sub="open tickets"/>
        </div>

        {/* Top 5 Headlines */}
        {top5.length > 0 && (
          <div style={{ marginBottom:20 }}>
            <div style={{ fontSize:11, fontWeight:700, color:"#64748b", textTransform:"uppercase", letterSpacing:".06em", marginBottom:10 }}>
              🏆 Top 5 Sites — {selMonth.short} · vs {prev?.short || "prev"}
            </div>
            <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(200px,1fr))", gap:10 }}>
              {top5.map((s, i) => <HeadlineCard key={s.site} rank={i+1} {...s}/>)}
            </div>
          </div>
        )}

        {/* Volume Trend */}
        {trends?.months?.length > 0 && (
          <div style={{ background:"#1e293b", borderRadius:10, padding:"16px", border:"1px solid #334155", marginBottom:20 }}>
            <div style={{ fontSize:11, fontWeight:700, color:"#64748b", textTransform:"uppercase", letterSpacing:".06em", marginBottom:4 }}>
              📈 {proj.short} Ticket Volume Trend — Last 6 Months
            </div>
            <div style={{ fontSize:10, color:"#475569", marginBottom:10 }}>
              Solid line = closed · dashed = total
            </div>
            <div style={{ background:"#0d1117", borderRadius:8, padding:"12px 8px" }}>
              <TrendChart months={trends.months} color={col}/>
            </div>
            <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(120px,1fr))", gap:6, marginTop:10 }}>
              {trends.months.map(m => {
                const rate = m.total > 0 ? Math.round(m.closed/m.total*100) : 0;
                const rCol = rate >= 90 ? "#22c55e" : rate >= 70 ? "#f59e0b" : "#ef4444";
                return (
                  <div key={m.month} style={{ background:"#0f172a", borderRadius:6, padding:"8px 10px" }}>
                    <div style={{ fontSize:9, color:"#64748b" }}>{m.month}</div>
                    <div style={{ fontSize:14, fontWeight:700, color:col }}>{m.closed.toLocaleString()}</div>
                    <div style={{ fontSize:9, color:rCol }}>{rate}% closed · {m.total.toLocaleString()} total</div>
                    {m.avg_mttr_hours && <div style={{ fontSize:9, color:"#475569" }}>MTTR {fmtHours(m.avg_mttr_hours)}</div>}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Full Site Table */}
        {sites?.sites?.length > 0 && (
          <div style={{ background:"#1e293b", borderRadius:10, border:"1px solid #334155", marginBottom:20 }}>
            <div style={{ padding:"12px 16px", borderBottom:"1px solid #334155", fontSize:11, fontWeight:700, color:"#64748b", textTransform:"uppercase", letterSpacing:".06em" }}>
              📍 All Sites — {selMonth.short} vs {prev?.short || "prev month"}
              <span style={{ marginLeft:8, fontWeight:400, color:"#475569" }}>{sites.sites.length} sites</span>
            </div>
            <div style={{ overflowX:"auto" }}>
              <table style={{ width:"100%", borderCollapse:"collapse", fontSize:11 }}>
                <thead>
                  <tr style={{ background:"#0f172a" }}>
                    {["#","Site","Total","Closed","Close %","On Hold","MTTR","MoM","Prev Closed"].map(h => (
                      <th key={h} style={{ padding:"8px 10px", textAlign: h==="Site"||h==="#" ? "left" : "center", color:"#64748b", fontSize:10, fontWeight:600, borderBottom:"1px solid #334155", whiteSpace:"nowrap" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {sites.sites.map((s,i) => (
                    <SiteRow key={s.site} rank={i+1} {...s}/>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Status Time Breakdown */}
        {statusTime?.statuses?.length > 0 && (
          <div style={{ background:"#1e293b", borderRadius:10, border:"1px solid #334155", padding:"16px", marginBottom:20 }}>
            <div style={{ fontSize:11, fontWeight:700, color:"#64748b", textTransform:"uppercase", letterSpacing:".06em", marginBottom:12 }}>
              ⏱ Average Time in Each Status — {selMonth.short}
            </div>
            <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(180px,1fr))", gap:8 }}>
              {statusTime.statuses.filter(s=>s.avg_hours).map(s => {
                const h = s.avg_hours;
                const c = h > 48 ? "#ef4444" : h > 24 ? "#f59e0b" : "#22c55e";
                return (
                  <div key={s.status} style={{ background:"#0f172a", borderRadius:8, padding:"10px 12px" }}>
                    <div style={{ fontSize:10, color:"#64748b", marginBottom:4, whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis" }}>{s.status}</div>
                    <div style={{ fontSize:20, fontWeight:700, color:c }}>{fmtHours(h)}</div>
                    <div style={{ fontSize:9, color:"#475569" }}>{s.n.toLocaleString()} tickets</div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Project selector tabs for other projects */}
        <div style={{ borderTop:"1px solid #1e293b", paddingTop:16 }}>
          <div style={{ fontSize:11, color:"#64748b", marginBottom:8, fontWeight:600 }}>Also view: other projects</div>
          <div style={{ display:"flex", gap:6, flexWrap:"wrap" }}>
            {PROJECTS.filter(p=>p.key!==selProject && p.key!=="all").map(p => (
              <button key={p.key} onClick={()=>setSelProject(p.key)}
                style={{ padding:"4px 12px", fontSize:11, fontWeight:600, borderRadius:6, border:`1px solid ${p.color}44`, background:`${p.color}11`, color:p.color, cursor:"pointer" }}>
                {p.short}
              </button>
            ))}
          </div>
        </div>

      </>)}
    </div>
  );
}
