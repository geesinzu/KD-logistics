import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router";
import {
  Calendar,
  Building2,
  Truck,
  Download,
  Printer,
  Info,
  ArrowRight,
  Clock,
  Sparkles,
} from "lucide-react";
import { trpc } from "@/providers/trpc";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  summarizeBrief,
  calendarDate,
  cohortRange,
  REPORT_DAY,
  type BriefRow,
} from "@contracts/delivery-brief";
import "./delivery-brief.css";

type View = "overview" | "branches" | "partners" | "exceptions";
const views: { key: View; label: string }[] = [
  { key: "overview", label: "Executive brief" },
  { key: "branches", label: "Branch performance" },
  { key: "partners", label: "Partner scorecards" },
  { key: "exceptions", label: "Follow-up queue" },
];
const fmt = (n: number | null) =>
  n === null
    ? "—"
    : new Intl.NumberFormat("en-NG", { maximumFractionDigits: 1 }).format(n);
const date = (ms: number | null) =>
  ms === null
    ? "Not recorded"
    : new Date(ms).toLocaleString("en-NG", {
        timeZone: "Africa/Lagos",
        day: "numeric",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
function groups(rows: BriefRow[], key: "branch" | "partner") {
  const map = new Map<string, BriefRow[]>();
  for (const r of rows) {
    const id =
      key === "branch"
        ? `branch-${r.branchId}`
        : `partner-${r.partnerId ?? "unassigned"}`;
    const group = map.get(id) ?? [];
    group.push(r);
    map.set(id, group);
  }
  return [...map]
    .map(([id, rows]) => ({
      id,
      name: rows[0][key],
      rows,
      ...summarizeBrief(rows),
    }))
    .sort((a, b) => b.total - a.total || a.name.localeCompare(b.name));
}
const EMPTY_ROWS: BriefRow[] = [];

export default function Reports() {
  const today = calendarDate(new Date());
  const [from, setFrom] = useState(today.slice(0, 8) + "01");
  const [to, setTo] = useState(today);
  const [compare, setCompare] = useState(true);
  const [branchId, setBranchId] = useState("");
  const [partnerId, setPartnerId] = useState("");
  const [view, setView] = useState<View>("overview");
  const [search, setSearch] = useState("");
  const [queue, setQueue] = useState("overdue");
  const [page, setPage] = useState(1);
  const [printing, setPrinting] = useState(false);
  const [detail, setDetail] = useState<{
    title: string;
    rows?: BriefRow[];
    definitions?: boolean;
    chart?: boolean;
  } | null>(null);
  const range = useMemo(() => {
    try {
      return { value: cohortRange(from, to), error: "" };
    } catch (e) {
      return { value: null, error: (e as Error).message };
    }
  }, [from, to]);
  const query = trpc.report.brief.useQuery(
    {
      from,
      to,
      compare,
      branchId: branchId ? Number(branchId) : undefined,
      partnerId: partnerId ? Number(partnerId) : undefined,
    },
    { enabled: !!range.value }
  );
  const data = range.value ? query.data : undefined;
  const rows = data?.current ?? EMPTY_ROWS;
  const prior = data?.previous ?? EMPTY_ROWS;
  const s = summarizeBrief(rows),
    p = summarizeBrief(prior);
  const byBranch = groups(rows, "branch"),
    byPartner = groups(rows, "partner");
  const matchingBranches = byBranch.filter(g =>
    g.name.toLowerCase().includes(search.toLowerCase())
  );
  const followups = rows
    .filter(r =>
      queue === "ack"
        ? r.finalAt && !r.acknowledgedAt && !r.cancelled
        : queue === "missing"
          ? r.missingEta
          : r.overdueHours > 0
    )
    .sort((a, b) => b.overdueHours - a.overdueHours || a.id - b.id);
  const daily = useMemo(() => {
    if (!range.value) return [];
    const { start, previousStart, days } = range.value,
      step = Math.max(1, Math.ceil(days / 12));
    return Array.from({ length: Math.ceil(days / step) }, (_, i) => {
      const a = start + i * step * REPORT_DAY,
        b = Math.min(start + (i + 1) * step * REPORT_DAY, range.value!.end),
        old = previousStart + i * step * REPORT_DAY;
      return {
        label: new Date(a).toLocaleDateString("en-NG", {
          timeZone: "Africa/Lagos",
          day: "numeric",
          month: "short",
        }),
        current: rows.filter(
          r => r.created !== null && r.created >= a && r.created < b
        ).length,
        previous: prior.filter(
          r =>
            r.created !== null && r.created >= old && r.created < old + (b - a)
        ).length,
      };
    });
  }, [rows, prior, range]);
  const chartMax = Math.max(
    1,
    ...daily.flatMap(d => [d.current, compare ? d.previous : 0])
  );
  useEffect(() => {
    const done = () => setPrinting(false);
    window.addEventListener("afterprint", done);
    return () => window.removeEventListener("afterprint", done);
  }, []);
  function printReport() {
    setPrinting(true);
    requestAnimationFrame(() => requestAnimationFrame(() => window.print()));
  }
  function resetFilter(update: () => void) {
    update();
    setPage(1);
    setDetail(null);
  }
  function exportCsv(items: BriefRow[], filename: string) {
    const cell = (value: unknown) => {
      let text = String(value ?? "");
      if (/^[=+@-]/.test(text)) text = "'" + text;
      return '"' + text.replaceAll('"', '""') + '"';
    };
    const iso = (ms: number | null) =>
      ms === null ? "" : new Date(ms).toISOString();
    const csv = [
      [
        "Tracking ID",
        "Branch",
        "Partner",
        "Hub",
        "Created UTC",
        "3PL custody UTC",
        "Service receipt UTC",
        "Final receipt/ack UTC",
        "Stage",
        "Past ETA hours",
        "Suggested follow-up",
      ],
      ...items.map(r => [
        r.trackingId,
        r.branch,
        r.partner,
        r.hub,
        iso(r.created),
        iso(r.handoff),
        iso(r.serviceAt),
        iso(r.finalAt),
        r.stage,
        r.overdueHours,
        r.followUp,
      ]),
    ]
      .map(row => row.map(cell).join(","))
      .join("\r\n");
    const url = URL.createObjectURL(
      new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" })
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  function changeView(key: View) {
    setView(key);
    setSearch("");
    setPage(1);
  }
  function delta(
    now: number | null,
    before: number | null,
    unit = "",
    lower = false
  ) {
    if (!compare || now === null || before === null) return null;
    const d = now - before;
    return (
      <span
        className={`delta ${d === 0 ? "" : (lower ? d < 0 : d > 0) ? "good" : "bad"}`}
      >
        {d > 0 ? "+" : d < 0 ? "-" : "="} {fmt(Math.abs(d))}
        {unit}
      </span>
    );
  }
  const headline =
    s.rate === null
      ? "The cohort is still moving. Its service outcome is not settled yet."
      : `${fmt(s.rate)}% of eligible 3PL completions met their ETA.`;
  const notes = (
    <>
      <p>
        Created-date cohorts, evaluated using their{" "}
        <strong>current recorded outcomes</strong>. Comparisons are not
        historical snapshots; older cohorts have had longer to finish.
      </p>
      <dl className="definition-list">
        <dt>3PL on-time delivery</dt>
        <dd>
          Service completions on/before ETA ÷ completions with a valid ETA. On
          hub routes, the 3PL leg ends at hub receipt. Open and cancelled work
          are excluded.
        </dd>
        <dt>Final receipt confirmed</dt>
        <dd>
          Direct routes use recorded delivery (or acknowledgement if its arrival
          time is missing); hub routes use final branch acknowledgement because
          a separate final-arrival timestamp is not always available.
          Acknowledgement time may lag actual arrival.
        </dd>
        <dt>Past ETA</dt>
        <dd>
          Open work past the current stage’s deadline at the refresh time. After
          hub receipt, only an explicit onward expected date is used. Missing
          onward dates are flagged, not treated as overdue.
        </dd>
        <dt>Stage averages</dt>
        <dd>
          Each stage has its own valid timestamp sample. Do not add stage
          averages as a typical end-to-end duration. The onward stage includes
          time to acknowledgement.
        </dd>
        <dt>Comparisons and coverage</dt>
        <dd>
          The previous cohort has the same number of calendar days, immediately
          before this range. Rate changes use percentage points. Below 10
          eligible service completions is flagged as a small sample. Missing
          timestamps and ETAs are excluded from rates, not converted to zero.
        </dd>
        <dt>Scope and access</dt>
        <dd>
          Dates use Africa/Lagos, including the whole final day. Cancelled
          shipments remain in cohort volume but not open work or performance.
          Partner and branch IDs—not names—identify groups. This read-only
          report is restricted to the existing operations/report roles.
        </dd>
      </dl>
    </>
  );
  return (
    <section className="delivery-brief">
      <div className="brief-main">
        <div className="breadcrumb">
          <span>KEDI workspace</span>
          <span>/</span>
          <span>Delivery brief</span>
          <Link to="/reports/activity">Activity-based report</Link>
        </div>
        <div className="title-row">
          <div>
            <p className="eyebrow">LESS GUESSWORK. BETTER MOVEMENT.</p>
            <h1>The delivery brief.</h1>
            <p className="subtitle">
              A clearer view of performance. A practical plan for what comes
              next.
            </p>
          </div>
          <div className="title-actions">
            <button
              className="btn"
              disabled={!data || query.isFetching || !!query.error}
              onClick={() => exportCsv(rows, `KEDI-brief-${from}-${to}.csv`)}
            >
              <Download size={14} />
              Export CSV
            </button>
            <button
              className="btn primary"
              disabled={!data || query.isFetching || !!query.error}
              onClick={printReport}
            >
              <Printer size={14} />
              Print / Save PDF
            </button>
          </div>
        </div>
        <div className="toolbar">
          <div className="filters">
            <label className="filter">
              <Calendar size={14} />
              <span className="sr-only">From date</span>
              <input
                aria-label="From date"
                type="date"
                value={from}
                max={to}
                onChange={e => resetFilter(() => setFrom(e.target.value))}
              />
            </label>
            <label className="filter">
              <span className="sr-only">To date</span>
              <input
                aria-label="To date"
                type="date"
                value={to}
                min={from}
                max={today}
                onChange={e => resetFilter(() => setTo(e.target.value))}
              />
            </label>
            <label className="filter">
              <Building2 size={14} />
              <select
                aria-label="Branch office"
                value={branchId}
                onChange={e => resetFilter(() => setBranchId(e.target.value))}
              >
                <option value="">All branch offices</option>
                {data?.offices.map(b => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="filter">
              <Truck size={14} />
              <select
                aria-label="Logistics partner"
                value={partnerId}
                onChange={e => resetFilter(() => setPartnerId(e.target.value))}
              >
                <option value="">All logistics partners</option>
                {data?.partners.map(p => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <label className="comparison">
            <input
              type="checkbox"
              checked={compare}
              onChange={e => setCompare(e.target.checked)}
            />
            Compare previous equal-length period
          </label>
        </div>
        <nav className="tabs" role="tablist" aria-label="Report views">
          {views.map((v, i) => (
            <button
              key={v.key}
              id={`brief-tab-${v.key}`}
              className="tab"
              role="tab"
              aria-selected={view === v.key}
              aria-controls={`brief-${v.key}`}
              tabIndex={view === v.key ? 0 : -1}
              onClick={() => changeView(v.key)}
              onKeyDown={e => {
                if (
                  ["ArrowRight", "ArrowLeft", "Home", "End"].includes(e.key)
                ) {
                  e.preventDefault();
                  const next =
                    e.key === "Home"
                      ? 0
                      : e.key === "End"
                        ? views.length - 1
                        : (i +
                            (e.key === "ArrowRight" ? 1 : -1) +
                            views.length) %
                          views.length;
                  changeView(views[next].key);
                  document
                    .getElementById(`brief-tab-${views[next].key}`)
                    ?.focus();
                }
              }}
            >
              {v.label}
              {v.key === "exceptions" && data && <small>{s.overdue}</small>}
            </button>
          ))}
        </nav>
        {range.error ? (
          <p role="alert" className="empty">
            {range.error}
          </p>
        ) : query.isLoading ? (
          <p role="status" className="empty">
            Preparing your delivery brief…
          </p>
        ) : query.error ? (
          <p role="alert" className="empty">
            Could not load the report.{" "}
            <button className="btn" onClick={() => void query.refetch()}>
              Try again
            </button>
          </p>
        ) : (
          data && (
            <>
              {query.isFetching && <p role="status">Refreshing report…</p>}
              <section
                className={`view ${view === "overview" ? "active" : ""}`}
                id="brief-overview"
                role="tabpanel"
                aria-labelledby="brief-tab-overview"
              >
                <article className="brief">
                  <div>
                    <div className="brief-label">
                      <Sparkles size={13} />
                      THE MANAGEMENT TAKEAWAY
                    </div>
                    <h2>
                      {s.total ? headline : "No shipments match these filters."}
                    </h2>
                    <p>
                      {s.onTime} of {s.eligible} measured service completions
                      were on time. {s.open} shipments have no confirmed final
                      receipt; {s.overdue} are past their current stage’s ETA.{" "}
                      {s.missingEta} open shipments have no usable stage ETA.
                    </p>
                  </div>
                  <div className="brief-aside">
                    <small>Open shipments past their stage ETA</small>
                    <strong>{s.overdue}</strong>
                    <button
                      onClick={() => {
                        setQueue("overdue");
                        changeView("exceptions");
                      }}
                    >
                      Review the evidence <ArrowRight size={13} />
                    </button>
                  </div>
                </article>
                <div className="metrics">
                  {[
                    {
                      label: "Shipments in cohort",
                      value: fmt(s.total),
                      note: `${s.cancelled} cancelled included in volume`,
                      change: delta(s.total, p.total),
                    },
                    {
                      label: "3PL on-time delivery",
                      value: s.rate === null ? "—" : `${fmt(s.rate)}%`,
                      note: `${s.onTime} of ${s.eligible} eligible completions`,
                      change: delta(s.rate, p.rate, " pp"),
                    },
                    {
                      label: "Average 3PL transit",
                      value:
                        s.transitDays === null ? "—" : `${fmt(s.transitDays)}d`,
                      note: `${s.stages[1].count} measured transit legs`,
                      change: delta(s.transitDays, p.transitDays, "d", true),
                    },
                    {
                      label: "Final receipt confirmed",
                      value: `${s.finalReceipt} / ${s.total}`,
                      note: `${s.awaitingAck} direct receipts awaiting acknowledgement`,
                      change: delta(s.finalReceipt, p.finalReceipt),
                    },
                  ].map(m => (
                    <article className="metric" key={m.label}>
                      <div className="metric-label">
                        <span>{m.label}</span>
                        <button
                          className="metric-tip"
                          aria-label={`Definition of ${m.label}`}
                          onClick={() =>
                            setDetail({
                              title: "Trust the numbers. Know the limits.",
                              definitions: true,
                            })
                          }
                        >
                          <Info size={12} />
                        </button>
                      </div>
                      <strong>{m.value}</strong>
                      <small>
                        {m.change}
                        {m.note}
                      </small>
                    </article>
                  ))}
                </div>
                <div className="main-grid">
                  <section className="panel">
                    <div className="panel-head">
                      <div>
                        <h2>Movement, day by day</h2>
                        <p>
                          Created volume, grouped into up to 12 equal-day
                          buckets.
                        </p>
                      </div>
                      <div className="legend">
                        <span>
                          <i />
                          Selected
                        </span>
                        {compare && (
                          <span>
                            <i style={{ background: "#dce5d7" }} />
                            Previous
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="trend-body">
                      <div className="chart-y">
                        <span>{chartMax}</span>
                        <span>{Math.round(chartMax / 2)}</span>
                        <span>0</span>
                      </div>
                      <div
                        className="chart-bars"
                        role="img"
                        aria-label={daily
                          .map(
                            d =>
                              `${d.label}: ${d.current} selected${compare ? `, ${d.previous} previous` : ""}`
                          )
                          .join("; ")}
                      >
                        {daily.map(d => (
                          <div className="bar-pair" key={d.label}>
                            <div
                              className="bar"
                              style={{
                                height: `${(d.current / chartMax) * 95}%`,
                              }}
                              title={`${d.label}: ${d.current}`}
                            />
                            {compare && (
                              <div
                                className="bar previous"
                                style={{
                                  height: `${(d.previous / chartMax) * 95}%`,
                                }}
                                title={`Previous bucket: ${d.previous}`}
                              />
                            )}
                            <label>{d.label}</label>
                          </div>
                        ))}
                      </div>
                    </div>
                    <div className="chart-note">
                      <span>
                        {s.total} selected
                        {compare ? ` · ${p.total} previous` : ""}
                      </span>
                      <button
                        className="link-button"
                        onClick={() =>
                          setDetail({
                            title: "The daily movement ledger.",
                            chart: true,
                          })
                        }
                      >
                        View chart data <ArrowRight size={13} />
                      </button>
                    </div>
                  </section>
                  <section className="panel">
                    <div className="panel-head">
                      <div>
                        <h2>Where the journey takes time</h2>
                        <p>Stage averages, measured independently.</p>
                      </div>
                      <Clock size={17} />
                    </div>
                    <div className="journey-body">
                      {s.stages.map((stage, i) => (
                        <div className="stage" key={stage.key}>
                          <span className="stage-no">0{i + 1}</span>
                          <div className="stage-content">
                            <div className="stage-line">
                              <strong>{stage.label}</strong>
                              <span>
                                {fmt(stage.hours)}
                                {stage.hours !== null ? "h" : ""}
                              </span>
                            </div>
                            <div className="track">
                              <i
                                style={{
                                  width: `${stage.hours === null ? 0 : (stage.hours / Math.max(1, ...s.stages.map(t => t.hours ?? 0))) * 100}%`,
                                }}
                              />
                            </div>
                            <div className="stage-sample">
                              {stage.count} measured legs
                            </div>
                          </div>
                        </div>
                      ))}
                      <div className="journey-note">
                        Different stages use different samples. Do not add these
                        averages as an end-to-end duration.
                      </div>
                    </div>
                  </section>
                </div>
                <div className="bottom-grid">
                  <section className="panel">
                    <div className="panel-head">
                      <div>
                        <h2>The branch pulse</h2>
                        <p>
                          Final receipt, open work, and branch acknowledgements.
                        </p>
                      </div>
                      <button
                        className="link-button"
                        onClick={() => changeView("branches")}
                      >
                        All branches →
                      </button>
                    </div>
                    <div className="table-scroll">
                      <table>
                        <thead>
                          <tr>
                            <th>Branch office</th>
                            <th>Confirmed receipt</th>
                            <th>Open / overdue</th>
                          </tr>
                        </thead>
                        <tbody>
                          {byBranch.slice(0, 5).map(g => (
                            <tr key={g.id}>
                              <td>
                                <button
                                  className="cell-button"
                                  onClick={() =>
                                    setDetail({ title: g.name, rows: g.rows })
                                  }
                                >
                                  {g.name}
                                </button>
                              </td>
                              <td>
                                {g.finalReceipt} / {g.total}
                              </td>
                              <td>
                                {g.open} / {g.overdue}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      {!byBranch.length && (
                        <p className="empty">No matching branch records.</p>
                      )}
                    </div>
                    <div className="panel-foot">
                      Hub receipt and final branch confirmation are separate
                      milestones.
                    </div>
                  </section>
                  <section className="panel action-panel">
                    <div className="panel-head">
                      <div>
                        <h2>Three useful next moves</h2>
                        <p>Evidence first. Then the right conversation.</p>
                      </div>
                    </div>
                    {[
                      {
                        key: "overdue",
                        count: s.overdue,
                        title: "Follow up on open past-ETA work",
                        body: "Inspect the recorded stage and suggested team. Stage alone does not prove responsibility for a delay.",
                      },
                      {
                        key: "ack",
                        count: s.awaitingAck,
                        title: "Close direct-route acknowledgements",
                        body: "Confirm actual quantities with the branch. Hub-route confirmation remains separate.",
                      },
                      {
                        key: "missing",
                        count: s.missingEta,
                        title: "Fill the ETA gaps",
                        body: "Missing onward dates are not treated as overdue. Set realistic expectations before judging performance.",
                      },
                    ].map((a, i) => (
                      <div className="action-row" key={a.key}>
                        <span className="action-index">0{i + 1}</span>
                        <div>
                          <strong>
                            {a.count} · {a.title}
                          </strong>
                          <p>{a.body}</p>
                          <span className="action-meta">
                            Suggested follow-up · No automatic messages
                          </span>
                        </div>
                        <button
                          aria-label={a.title}
                          onClick={() => {
                            setQueue(a.key);
                            changeView("exceptions");
                          }}
                        >
                          <ArrowRight size={14} />
                        </button>
                      </div>
                    ))}
                  </section>
                </div>
              </section>
              <section
                className={`view ${view === "branches" ? "active" : ""}`}
                id="brief-branches"
                role="tabpanel"
                aria-labelledby="brief-tab-branches"
              >
                <div className="view-intro">
                  <div>
                    <h2>Every office has a story.</h2>
                    <p>
                      Final receipt and outstanding work, within the selected
                      cohort.
                    </p>
                  </div>
                  <input
                    type="search"
                    aria-label="Search branch performance"
                    placeholder="Find a branch…"
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                  />
                </div>
                <div className="panel table-scroll">
                  <table className="wide-table">
                    <thead>
                      <tr>
                        <th>Branch office</th>
                        <th>Cohort</th>
                        <th>Confirmed receipt</th>
                        <th>Open</th>
                        <th>Past ETA</th>
                        <th>Direct acknowledgement pending</th>
                      </tr>
                    </thead>
                    <tbody>
                      {matchingBranches.map(g => (
                        <tr key={g.id}>
                          <td>
                            <button
                              className="cell-button"
                              onClick={() =>
                                setDetail({ title: g.name, rows: g.rows })
                              }
                            >
                              {g.name} →
                            </button>
                          </td>
                          <td>{g.total}</td>
                          <td>{g.finalReceipt}</td>
                          <td>{g.open}</td>
                          <td>{g.overdue}</td>
                          <td>{g.awaitingAck}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {!matchingBranches.length && (
                    <p className="empty">
                      No branch records match these filters.
                    </p>
                  )}
                </div>
              </section>
              <section
                className={`view ${view === "partners" ? "active" : ""}`}
                id="brief-partners"
                role="tabpanel"
                aria-labelledby="brief-tab-partners"
              >
                <div className="view-intro">
                  <div>
                    <h2>Reliability, with the context.</h2>
                    <p>
                      Service ends at the hub on hub routes. No opaque overall
                      ranking or blame score.
                    </p>
                  </div>
                  <button
                    className="btn"
                    onClick={() =>
                      setDetail({
                        title: "How this is measured",
                        definitions: true,
                      })
                    }
                  >
                    How this is measured
                  </button>
                </div>
                <div className="panel table-scroll">
                  <table className="wide-table">
                    <thead>
                      <tr>
                        <th>Logistics partner</th>
                        <th>Cohort</th>
                        <th>On-time / eligible</th>
                        <th>Average transit</th>
                        <th>Open past stage ETA</th>
                        <th>Coverage</th>
                      </tr>
                    </thead>
                    <tbody>
                      {byPartner.map(g => (
                        <tr key={g.id}>
                          <td>
                            <button
                              className="cell-button"
                              onClick={() =>
                                setDetail({ title: g.name, rows: g.rows })
                              }
                            >
                              {g.name} →
                            </button>
                          </td>
                          <td>{g.total}</td>
                          <td>
                            {fmt(g.rate)}
                            {g.rate !== null ? "%" : ""}
                            <small className="brief-cell-note">
                              {g.onTime} on time / {g.eligible} eligible
                            </small>
                          </td>
                          <td>
                            {fmt(g.transitDays)}
                            {g.transitDays !== null ? "d" : ""}
                          </td>
                          <td>{g.overdue}</td>
                          <td>
                            <span
                              className={`pill ${g.eligible < 10 ? "warn" : ""}`}
                            >
                              {g.eligible < 10
                                ? "Small sample"
                                : "10+ completions"}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {!byPartner.length && (
                    <p className="empty">
                      No partner records match these filters.
                    </p>
                  )}
                </div>
              </section>
              <section
                className={`view ${view === "exceptions" ? "active" : ""}`}
                id="brief-exceptions"
                role="tabpanel"
                aria-labelledby="brief-tab-exceptions"
              >
                <div className="view-intro">
                  <div>
                    <h2>Turn the report into a follow-up.</h2>
                    <p>
                      Suggested teams reflect recorded stages, not proven
                      responsibility.
                    </p>
                  </div>
                  <button
                    className="btn"
                    onClick={() =>
                      exportCsv(followups, `KEDI-follow-ups-${from}-${to}.csv`)
                    }
                  >
                    Export follow-ups
                  </button>
                </div>
                <div className="filters brief-queue-filter">
                  <label className="filter">
                    <select
                      aria-label="Follow-up type"
                      value={queue}
                      onChange={e => {
                        setQueue(e.target.value);
                        setPage(1);
                      }}
                    >
                      <option value="overdue">Past stage ETA</option>
                      <option value="ack">
                        Awaiting direct acknowledgement
                      </option>
                      <option value="missing">Missing stage ETA</option>
                    </select>
                  </label>
                  <span>{followups.length} matching records</span>
                </div>
                <div className="panel table-scroll">
                  <table className="wide-table">
                    <thead>
                      <tr>
                        <th>Shipment</th>
                        <th>Destination</th>
                        <th>Recorded stage</th>
                        <th>Past ETA</th>
                        <th>Suggested follow-up</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(printing
                        ? followups
                        : followups.slice((page - 1) * 30, page * 30)
                      ).map(r => (
                        <tr key={r.id}>
                          <td>
                            <button
                              className="cell-button"
                              onClick={() =>
                                setDetail({ title: r.trackingId, rows: [r] })
                              }
                            >
                              {r.trackingId}
                            </button>
                          </td>
                          <td>{r.branch}</td>
                          <td>{r.stage}</td>
                          <td>{r.overdueHours ? `${r.overdueHours}h` : "—"}</td>
                          <td>{r.followUp ?? "Review recorded milestones"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {!followups.length && (
                    <p className="empty">
                      No matching follow-ups in this cohort.
                    </p>
                  )}
                </div>
                {followups.length > 30 && (
                  <nav
                    className="brief-pagination"
                    aria-label="Follow-up pages"
                  >
                    <button
                      className="btn"
                      disabled={page === 1}
                      onClick={() => setPage(n => n - 1)}
                    >
                      Previous
                    </button>
                    <span>
                      Page {page} of {Math.ceil(followups.length / 30)}
                    </span>
                    <button
                      className="btn"
                      disabled={page >= Math.ceil(followups.length / 30)}
                      onClick={() => setPage(n => n + 1)}
                    >
                      Next
                    </button>
                  </nav>
                )}
              </section>
              <div className="data-warning">
                <Info size={14} />
                Current outcomes for created-date cohorts. Older cohorts have
                had longer to finish. {s.missingEta} open records lack a usable
                stage ETA. Legacy missing timestamps are excluded from duration
                samples.
              </div>
              <footer className="footnote">
                <span>
                  KEDI Healthcare Logistics · {from}–{to}
                  {compare
                    ? ` vs. ${data.previousFrom}–${data.previousTo}`
                    : ""}
                  <br />
                  Updated {date(data.generatedAt.getTime())} WAT
                </span>
                <button
                  onClick={() =>
                    setDetail({
                      title: "Trust the numbers. Know the limits.",
                      definitions: true,
                    })
                  }
                >
                  Metric definitions & data notes
                </button>
              </footer>
            </>
          )
        )}
        <Dialog
          open={!!detail}
          onOpenChange={open => {
            if (!open) setDetail(null);
          }}
        >
          <DialogContent className="workspace-dialog brief-dialog">
            <DialogHeader>
              <DialogTitle>{detail?.title}</DialogTitle>
            </DialogHeader>
            {detail?.definitions ? (
              notes
            ) : detail?.chart ? (
              <div className="brief-detail-table">
                <table>
                  <thead>
                    <tr>
                      <th>Bucket begins</th>
                      <th>Selected</th>
                      {compare && <th>Previous</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {daily.map(d => (
                      <tr key={d.label}>
                        <td>{d.label}</td>
                        <td>{d.current}</td>
                        {compare && <td>{d.previous}</td>}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="brief-detail-table">
                <p>
                  {detail?.rows?.length} records · current filters apply. Times
                  shown in Lagos time.
                </p>
                <table>
                  <thead>
                    <tr>
                      <th>Shipment</th>
                      <th>Milestones and evidence</th>
                    </tr>
                  </thead>
                  <tbody>
                    {detail?.rows?.map(r => (
                      <tr key={r.id}>
                        <td>
                          <Link to={`/shipments/${r.id}`}>
                            {r.trackingId} →
                          </Link>
                        </td>
                        <td>
                          {r.stage}
                          <br />
                          Created: {date(r.created)}
                          <br />
                          Custody: {date(r.handoff)}
                          <br />
                          Service receipt: {date(r.serviceAt)}
                          <br />
                          Final receipt/ack: {date(r.finalAt)}
                          <br />
                          Suggested follow-up: {r.followUp ?? "None"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </DialogContent>
        </Dialog>
      </div>
    </section>
  );
}
