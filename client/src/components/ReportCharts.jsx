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
