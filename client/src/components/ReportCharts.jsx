const rm = (n) => `RM ${Number(n || 0).toFixed(2)}`;

function niceMax(v) {
  if (v <= 0) return 1;
  const mag = 10 ** Math.floor(Math.log10(v));
  const n = v / mag;
  const step = n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10;
  return step * mag;
}

function shortMoney(v) {
  const a = Math.abs(v);
  if (a >= 1000) return `${(v / 1000).toFixed(a >= 10000 ? 0 : 1)}k`;
  return String(Math.round(v));
}

/** Sales bars with net-profit bars on top (green profit, red loss). */
export function ProfitChart({ data }) {
  const n = Math.max(data.length, 1);
  const W = Math.max(640, n * 26);
  const H = 240;
  const pad = { l: 44, r: 10, t: 12, b: 28 };
  const max = niceMax(Math.max(1, ...data.map((d) => Math.max(d.sales, d.net))));
  const minNet = Math.min(0, ...data.map((d) => d.net));
  const min = minNet < 0 ? -niceMax(-minNet) : 0;
  const plotH = H - pad.t - pad.b;
  const y = (v) => pad.t + ((max - v) / (max - min)) * plotH;
  const slot = (W - pad.l - pad.r) / n;
  const every = Math.ceil(n / 12);
  const ticks = [max, max / 2, 0, ...(min < 0 ? [min] : [])];

  return (
    <div className="pos-chart">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Sales and net profit chart">
        {ticks.map((t) => (
          <g key={t}>
            <line
              x1={pad.l}
              x2={W - pad.r}
              y1={y(t)}
              y2={y(t)}
              className={t === 0 ? 'pos-chart-zero' : 'pos-chart-grid'}
            />
            <text x={pad.l - 6} y={y(t) + 4} textAnchor="end" className="pos-chart-axis">
              {shortMoney(t)}
            </text>
          </g>
        ))}
        {data.map((d, i) => {
          const x = pad.l + i * slot;
          const sw = Math.max(4, slot * 0.7);
          const nw = Math.max(3, slot * 0.34);
          const netTop = d.net >= 0 ? y(d.net) : y(0);
          const netH = Math.abs(y(d.net) - y(0));
          return (
            <g key={d.key}>
              <title>
                {`${d.label}\nSales ${rm(d.sales)}\nNet profit ${rm(d.net)}`}
              </title>
              <rect
                x={x + (slot - sw) / 2}
                y={y(d.sales)}
                width={sw}
                height={Math.max(0, y(0) - y(d.sales))}
                rx="3"
                className="pos-chart-sales"
              />
              {d.net !== 0 && (
                <rect
                  x={x + (slot - nw) / 2}
                  y={netTop}
                  width={nw}
                  height={Math.max(1, netH)}
                  rx="2"
                  className={d.net >= 0 ? 'pos-chart-profit' : 'pos-chart-loss'}
                />
              )}
              {i % every === 0 && (
                <text x={x + slot / 2} y={H - 8} textAnchor="middle" className="pos-chart-axis">
                  {d.short}
                </text>
              )}
            </g>
          );
        })}
      </svg>
      <div className="pos-chart-legend">
        <span>
          <i className="pos-chart-sales" /> Sales
        </span>
        <span>
          <i className="pos-chart-profit" /> Net profit
        </span>
        <span>
          <i className="pos-chart-loss" /> Loss
        </span>
      </div>
    </div>
  );
}

const PIE_COLORS = ['#4e79a7', '#f28e2b', '#e15759', '#76b7b2', '#59a14f', '#edc948', '#b07aa1', '#ff9da7'];

/** Simple SVG pie: slices [{ label, value }] */
export function PieChart({ title, unit = 'MYR', slices = [] }) {
  const rows = (slices || [])
    .map((s) => ({ label: String(s.label || ''), value: Math.max(0, Number(s.value) || 0) }))
    .filter((s) => s.value > 0);
  const total = rows.reduce((s, r) => s + r.value, 0);
  const size = 220;
  const cx = size / 2;
  const cy = size / 2;
  const r = 84;

  function arc(start, end) {
    const a0 = (start / total) * Math.PI * 2 - Math.PI / 2;
    const a1 = (end / total) * Math.PI * 2 - Math.PI / 2;
    const x0 = cx + r * Math.cos(a0);
    const y0 = cy + r * Math.sin(a0);
    const x1 = cx + r * Math.cos(a1);
    const y1 = cy + r * Math.sin(a1);
    const large = end - start > total / 2 ? 1 : 0;
    return `M ${cx} ${cy} L ${x0} ${y0} A ${r} ${r} 0 ${large} 1 ${x1} ${y1} Z`;
  }

  let cursor = 0;
  const paths = rows.map((row, i) => {
    const start = cursor;
    const end = cursor + row.value;
    cursor = end;
    if (rows.length === 1) {
      return (
        <circle key={row.label + i} cx={cx} cy={cy} r={r} fill={PIE_COLORS[i % PIE_COLORS.length]} />
      );
    }
    return (
      <path
        key={row.label + i}
        d={arc(start, end)}
        fill={PIE_COLORS[i % PIE_COLORS.length]}
      >
        <title>{`${row.label}: ${unit} ${row.value.toFixed(2)}`}</title>
      </path>
    );
  });

  return (
    <div className="pos-pie">
      {title ? <div className="pos-pie-title">{title}</div> : null}
      {total <= 0 ? (
        <div className="pos-meta">No values to chart</div>
      ) : (
        <div className="pos-pie-body">
          <svg viewBox={`0 0 ${size} ${size}`} role="img" aria-label={title || 'Pie chart'}>
            {paths}
            <circle cx={cx} cy={cy} r={42} fill="var(--pos-card, #fff)" />
            <text x={cx} y={cy - 4} textAnchor="middle" className="pos-pie-total">
              {unit}
            </text>
            <text x={cx} y={cy + 14} textAnchor="middle" className="pos-pie-total-val">
              {total.toFixed(total >= 100 ? 0 : 2)}
            </text>
          </svg>
          <ul className="pos-pie-legend">
            {rows.map((row, i) => (
              <li key={row.label + i}>
                <i style={{ background: PIE_COLORS[i % PIE_COLORS.length] }} />
                <span>
                  {row.label}
                  <small>
                    {unit} {row.value.toFixed(2)} · {((row.value / total) * 100).toFixed(1)}%
                  </small>
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

/** Horizontal bars: rows [{ key, label, value, display, tone }] */
export function BarList({ rows }) {
  const max = Math.max(1, ...rows.map((r) => Math.abs(r.value)));
  return (
    <ul className="pos-barlist">
      {rows.map((r) => (
        <li key={r.key}>
          <span className="pos-barlist-label">{r.label}</span>
          <span className="pos-barlist-track">
            <span
              className={`pos-barlist-fill ${r.tone || ''}`}
              style={{ width: `${(Math.abs(r.value) / max) * 100}%` }}
            />
          </span>
          <span className="pos-barlist-value">{r.display}</span>
        </li>
      ))}
    </ul>
  );
}
