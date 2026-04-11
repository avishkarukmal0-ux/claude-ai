import React, { useState, useEffect, useRef } from 'react';
import api from '../services/api';

// ── helpers ───────────────────────────────────────────────────────────────────
function directionIcon(d) {
  if (d === 'viral')   return '🔥';
  if (d === 'rising')  return '📈';
  if (d === 'falling') return '📉';
  if (d === 'new')     return '⭐';
  return '➡️';
}
function directionLabel(d) {
  if (d === 'viral')   return 'Viral';
  if (d === 'rising')  return 'Rising';
  if (d === 'falling') return 'Declining';
  if (d === 'new')     return 'New';
  return 'Stable';
}
function directionColor(d) {
  if (d === 'viral')   return '#ff4d4d';
  if (d === 'rising')  return '#22c55e';
  if (d === 'falling') return '#f59e0b';
  if (d === 'new')     return '#a78bfa';
  return 'var(--text-muted)';
}
function scoreBar(score) {
  const pct = Math.min(100, score);
  const color = score >= 80 ? '#ff4d4d' : score >= 60 ? '#22c55e' : '#f59e0b';
  return (
    <div style={{ height: 6, background: 'rgba(255,255,255,0.08)', borderRadius: 3, overflow: 'hidden' }}>
      <div style={{ height: '100%', width: `${pct}%`, background: color, borderRadius: 3, transition: 'width 0.6s ease' }} />
    </div>
  );
}
function fmt(n) { return n !== null && n !== undefined ? `£${Number(n).toFixed(2)}` : '—'; }

// ── Category filter ───────────────────────────────────────────────────────────
const CATEGORIES = ['All', 'Energy Drinks', 'Vapes', 'Health', 'Snacks', 'Beer', 'Alcohol Free', 'Soft Drinks', 'Chocolate', 'Halal / Ethnic', 'Sports Drinks'];

// ── TrendCard ─────────────────────────────────────────────────────────────────
function TrendCard({ trend, rank, onOrder }) {
  const change = trend.searchVolumeChange;
  return (
    <div style={{
      background: 'var(--bg-secondary)',
      border: `1px solid ${trend.trendDirection === 'viral' ? 'rgba(255,77,77,0.3)' : 'var(--border)'}`,
      borderRadius: 12,
      padding: 16,
      display: 'flex',
      flexDirection: 'column',
      gap: 10,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 700 }}>#{rank}</span>
        <span style={{
          fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 20,
          background: `${directionColor(trend.trendDirection)}22`,
          color: directionColor(trend.trendDirection),
        }}>
          {directionIcon(trend.trendDirection)} {directionLabel(trend.trendDirection).toUpperCase()}
        </span>
      </div>

      <div>
        <p style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)', lineHeight: 1.3 }}>{trend.productName}</p>
        <p style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>{trend.category}</p>
        {trend.brand && <p style={{ fontSize: 10, color: 'var(--text-secondary)' }}>{trend.brand}</p>}
      </div>

      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
          <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>UK trend score</span>
          <span style={{ fontSize: 11, fontWeight: 700, color: change > 0 ? '#22c55e' : change < 0 ? '#ef4444' : 'var(--text-muted)' }}>
            {change > 0 ? '+' : ''}{change}% vs last month
          </span>
        </div>
        {scoreBar(trend.trendScore)}
        <p style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 4, textAlign: 'right' }}>Score: {trend.trendScore}/100</p>
      </div>

      {(trend.avgRetailPrice || trend.estimatedMargin) && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6 }}>
          {trend.avgRetailPrice && (
            <div style={{ background: 'rgba(255,255,255,0.04)', borderRadius: 6, padding: '6px 8px', textAlign: 'center' }}>
              <p style={{ fontSize: 9, color: 'var(--text-muted)' }}>Retail</p>
              <p style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-primary)' }}>{fmt(trend.avgRetailPrice)}</p>
            </div>
          )}
          {trend.estimatedCostPrice && (
            <div style={{ background: 'rgba(255,255,255,0.04)', borderRadius: 6, padding: '6px 8px', textAlign: 'center' }}>
              <p style={{ fontSize: 9, color: 'var(--text-muted)' }}>Cost</p>
              <p style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-primary)' }}>~{fmt(trend.estimatedCostPrice)}</p>
            </div>
          )}
          {trend.estimatedMargin && (
            <div style={{ background: 'rgba(255,255,255,0.04)', borderRadius: 6, padding: '6px 8px', textAlign: 'center' }}>
              <p style={{ fontSize: 9, color: 'var(--text-muted)' }}>Margin</p>
              <p style={{ fontSize: 12, fontWeight: 700, color: '#22c55e' }}>{trend.estimatedMargin}%</p>
            </div>
          )}
        </div>
      )}

      {trend.tags?.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
          {trend.tags.slice(0, 4).map(t => (
            <span key={t} style={{ fontSize: 9, padding: '2px 6px', borderRadius: 10, background: 'rgba(255,255,255,0.06)', color: 'var(--text-muted)' }}>#{t}</span>
          ))}
        </div>
      )}

      {trend.suggestedSupplier && (
        <button
          onClick={() => onOrder(trend)}
          style={{ width: '100%', padding: '8px', borderRadius: 8, background: 'var(--blue)', color: '#fff', border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 600 }}
        >
          Add to Order · {trend.suggestedSupplier}
        </button>
      )}
    </div>
  );
}

// ── Tab 1: Trending Now ───────────────────────────────────────────────────────
function TrendingTab({ trends, myTrends, loading }) {
  const [category, setCategory] = useState('All');
  const [toast, setToast] = useState('');

  const filtered = category === 'All' ? trends : trends.filter(t => t.category === category);

  function handleOrder(trend) {
    setToast(`Added "${trend.productName}" to shopping list`);
    setTimeout(() => setToast(''), 3000);
  }

  return (
    <div>
      {toast && (
        <div style={{ background: '#22c55e', color: '#fff', padding: '10px 16px', borderRadius: 8, marginBottom: 16, fontSize: 13, fontWeight: 600 }}>{toast}</div>
      )}
      <div style={{ marginBottom: 20 }}>
        <h2 style={{ fontSize: 18, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 4 }}>What's trending in UK convenience stores</h2>
        <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>Based on Google Trends UK data + market intelligence · Updated daily at 3am</p>
      </div>

      {/* Category filter */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 20 }}>
        {CATEGORIES.map(c => (
          <button
            key={c}
            onClick={() => setCategory(c)}
            style={{
              padding: '5px 12px', borderRadius: 20, border: 'none', cursor: 'pointer', fontSize: 11, fontWeight: 600,
              background: category === c ? 'var(--blue)' : 'rgba(255,255,255,0.06)',
              color: category === c ? '#fff' : 'var(--text-secondary)',
            }}
          >{c}</button>
        ))}
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: 60, color: 'var(--text-muted)' }}>Loading trends...</div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 16 }}>
          {filtered.map((t, i) => (
            <TrendCard key={t._id || i} trend={t} rank={i + 1} onOrder={handleOrder} />
          ))}
          {filtered.length === 0 && (
            <div style={{ gridColumn: '1/-1', textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>No trends found for this category.</div>
          )}
        </div>
      )}

      {/* Store's own trends */}
      {myTrends && (myTrends.rising?.length > 0 || myTrends.falling?.length > 0) && (
        <div style={{ marginTop: 40 }}>
          <h3 style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 4 }}>Your Store Trends — last 30 days</h3>
          <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 16 }}>Compared to previous 30 days</p>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
            {/* Rising */}
            <div style={{ background: 'var(--bg-secondary)', borderRadius: 12, padding: 16, border: '1px solid rgba(34,197,94,0.2)' }}>
              <p style={{ fontSize: 12, fontWeight: 700, color: '#22c55e', marginBottom: 12 }}>📈 Rising In Your Shop</p>
              {myTrends.rising.map((p, i) => (
                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0', borderBottom: i < myTrends.rising.length - 1 ? '1px solid var(--border)' : 'none' }}>
                  <span style={{ fontSize: 12, color: 'var(--text-primary)', flex: 1 }}>{p.name}</span>
                  <span style={{ fontSize: 11, fontWeight: 700, color: '#22c55e', marginLeft: 8 }}>+{p.change}%</span>
                </div>
              ))}
            </div>
            {/* Falling */}
            <div style={{ background: 'var(--bg-secondary)', borderRadius: 12, padding: 16, border: '1px solid rgba(239,68,68,0.2)' }}>
              <p style={{ fontSize: 12, fontWeight: 700, color: '#ef4444', marginBottom: 12 }}>📉 Falling In Your Shop</p>
              {myTrends.falling.map((p, i) => (
                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0', borderBottom: i < myTrends.falling.length - 1 ? '1px solid var(--border)' : 'none' }}>
                  <span style={{ fontSize: 12, color: 'var(--text-primary)', flex: 1 }}>{p.name}</span>
                  <span style={{ fontSize: 11, fontWeight: 700, color: '#ef4444', marginLeft: 8 }}>{p.change}%</span>
                </div>
              ))}
            </div>
          </div>

          {myTrends.correlations?.length > 0 && (
            <div style={{ marginTop: 20, background: 'var(--bg-secondary)', borderRadius: 12, padding: 16, border: '1px solid var(--border)' }}>
              <p style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 12 }}>🛒 Basket Correlations</p>
              {myTrends.correlations.slice(0, 5).map((c, i) => (
                <div key={i} style={{ fontSize: 11, color: 'var(--text-secondary)', padding: '4px 0' }}>
                  Customers who buy <strong style={{ color: 'var(--text-primary)' }}>{c.productA}</strong> also buy <strong style={{ color: 'var(--text-primary)' }}>{c.productB}</strong> — {c.confidence}% of the time
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Tab 2: Gaps ───────────────────────────────────────────────────────────────
function GapsTab({ gaps, loading }) {
  const total = gaps.reduce((s, g) => s + (g.estimatedWeeklyRevenue || 0), 0);

  return (
    <div>
      <div style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)', borderRadius: 12, padding: '14px 18px', marginBottom: 20 }}>
        <p style={{ fontSize: 13, fontWeight: 700, color: '#ef4444' }}>Estimated missed revenue: {fmt(total)} / week</p>
        <p style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>These trending products are not currently in your inventory</p>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: 60, color: 'var(--text-muted)' }}>Analysing your stock gaps...</div>
      ) : gaps.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 60, color: 'var(--text-muted)' }}>Great — no significant gaps found! Your stock matches current trends well.</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {gaps.map((g, i) => (
            <div key={i} style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 10, padding: '14px 16px', display: 'flex', gap: 16, alignItems: 'center' }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <p style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)' }}>{g.productName}</p>
                  <span style={{ fontSize: 10, padding: '2px 7px', borderRadius: 10, background: `${directionColor(g.trendDirection)}22`, color: directionColor(g.trendDirection), fontWeight: 700 }}>
                    {directionIcon(g.trendDirection)} {directionLabel(g.trendDirection)}
                  </span>
                </div>
                <p style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>{g.category} {g.brand ? `· ${g.brand}` : ''}</p>
              </div>

              <div style={{ display: 'flex', gap: 12, flexShrink: 0, flexWrap: 'wrap' }}>
                <div style={{ textAlign: 'center' }}>
                  <p style={{ fontSize: 9, color: 'var(--text-muted)' }}>Trend score</p>
                  <p style={{ fontSize: 16, fontWeight: 800, color: '#ff4d4d' }}>{g.trendScore}</p>
                </div>
                {g.estimatedWeeklyRevenue && (
                  <div style={{ textAlign: 'center' }}>
                    <p style={{ fontSize: 9, color: 'var(--text-muted)' }}>Est. weekly</p>
                    <p style={{ fontSize: 16, fontWeight: 800, color: '#22c55e' }}>{fmt(g.estimatedWeeklyRevenue)}</p>
                  </div>
                )}
                {g.suggestedQty && (
                  <div style={{ textAlign: 'center' }}>
                    <p style={{ fontSize: 9, color: 'var(--text-muted)' }}>Start with</p>
                    <p style={{ fontSize: 16, fontWeight: 800, color: 'var(--text-primary)' }}>{g.suggestedQty}</p>
                  </div>
                )}
              </div>

              {g.suggestedSupplier && (
                <button style={{ padding: '8px 14px', borderRadius: 8, background: 'var(--blue)', color: '#fff', border: 'none', cursor: 'pointer', fontSize: 11, fontWeight: 600, flexShrink: 0 }}>
                  + Shopping List<br />
                  <span style={{ fontSize: 10, opacity: 0.8 }}>{g.suggestedSupplier}</span>
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Tab 3: Seasonal ───────────────────────────────────────────────────────────
function SeasonalTab({ events, loading }) {
  if (loading) return <div style={{ textAlign: 'center', padding: 60, color: 'var(--text-muted)' }}>Loading seasonal calendar...</div>;

  return (
    <div>
      <div style={{ marginBottom: 20 }}>
        <h2 style={{ fontSize: 18, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 4 }}>Seasonal Calendar — next 90 days</h2>
        <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>Upcoming opportunities to stock seasonal products and boost sales</p>
      </div>
      {events.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 60, color: 'var(--text-muted)' }}>No seasonal events in the next 90 days.</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {events.map((ev, i) => {
            const urgent = ev.daysUntil <= 14;
            const active = ev.isActive;
            return (
              <div key={i} style={{
                background: active ? 'rgba(34,197,94,0.05)' : 'var(--bg-secondary)',
                border: `1px solid ${active ? 'rgba(34,197,94,0.3)' : urgent ? 'rgba(245,158,11,0.3)' : 'var(--border)'}`,
                borderRadius: 12,
                padding: '16px 18px',
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                      <h3 style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)' }}>{ev.name}</h3>
                      {active && <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 10, background: 'rgba(34,197,94,0.15)', color: '#22c55e', fontWeight: 700 }}>ACTIVE NOW</span>}
                      {!active && urgent && <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 10, background: 'rgba(245,158,11,0.15)', color: '#f59e0b', fontWeight: 700 }}>URGENT</span>}
                    </div>
                    <p style={{ fontSize: 11, color: 'var(--text-muted)' }}>{ev.startDate} – {ev.endDate}</p>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <p style={{ fontSize: 22, fontWeight: 800, color: urgent ? '#f59e0b' : 'var(--text-primary)' }}>
                      {ev.daysUntil === 0 ? 'Today' : `${ev.daysUntil}d`}
                    </p>
                    <p style={{ fontSize: 10, color: 'var(--text-muted)' }}>days away</p>
                  </div>
                </div>

                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 10 }}>
                  {ev.products.map(p => (
                    <span key={p} style={{ fontSize: 11, padding: '3px 9px', borderRadius: 10, background: 'rgba(255,255,255,0.05)', color: 'var(--text-secondary)', border: '1px solid var(--border)' }}>{p}</span>
                  ))}
                </div>

                {Object.keys(ev.uplift || {}).length > 0 && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                    {Object.entries(ev.uplift).slice(0, 4).map(([prod, pct]) => (
                      <span key={prod} style={{ fontSize: 11, color: '#22c55e', fontWeight: 600 }}>↑{pct}% {prod}</span>
                    ))}
                  </div>
                )}

                <button style={{ marginTop: 12, padding: '7px 16px', borderRadius: 8, background: active ? '#22c55e' : 'rgba(255,255,255,0.08)', color: active ? '#fff' : 'var(--text-secondary)', border: 'none', cursor: 'pointer', fontSize: 11, fontWeight: 600 }}>
                  {active ? '✓ Actively Stocking' : 'Prepare Stock →'}
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Tab 4: AI Insights ────────────────────────────────────────────────────────
function InsightsTab({ insights, loading, onRefresh }) {
  const urgencyColor = u => u === 'high' ? '#ef4444' : u === 'medium' ? '#f59e0b' : '#22c55e';
  const actionIcon = a => ({ order: '📦', promote: '📢', clearance: '🏷️', seasonal_prep: '📅', price_change: '💷' }[a] || '💡');

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div>
          <h2 style={{ fontSize: 18, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 2 }}>AI Insights for Your Shop</h2>
          <p style={{ fontSize: 11, color: 'var(--text-muted)' }}>Personalised recommendations based on your sales + market trends · Updated daily at 3am</p>
        </div>
        <button
          onClick={onRefresh}
          disabled={loading}
          style={{ padding: '8px 16px', borderRadius: 8, background: 'var(--blue)', color: '#fff', border: 'none', cursor: loading ? 'not-allowed' : 'pointer', fontSize: 12, fontWeight: 600, opacity: loading ? 0.6 : 1 }}
        >
          {loading ? 'Refreshing...' : '↺ Refresh Insights'}
        </button>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: 60 }}>
          <div style={{ fontSize: 30, marginBottom: 12 }}>🤖</div>
          <p style={{ color: 'var(--text-muted)', fontSize: 14 }}>Claude AI is analysing your market data...</p>
        </div>
      ) : insights.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 60 }}>
          <p style={{ color: 'var(--text-muted)', fontSize: 14 }}>No insights available. Click Refresh Insights to generate.</p>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 16 }}>
          {insights.map((ins, i) => (
            <div key={i} style={{ background: 'var(--bg-secondary)', border: `1px solid ${urgencyColor(ins.urgency)}33`, borderRadius: 12, padding: 18, display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontSize: 18 }}>{actionIcon(ins.action)}</span>
                <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 10, background: `${urgencyColor(ins.urgency)}22`, color: urgencyColor(ins.urgency), fontWeight: 700, textTransform: 'uppercase' }}>
                  {ins.urgency} priority
                </span>
              </div>

              <div>
                <p style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)', lineHeight: 1.4 }}>{ins.title}</p>
              </div>

              <p style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.6, flex: 1 }}>{ins.description}</p>

              <div style={{ display: 'flex', gap: 8 }}>
                {ins.estimatedImpact && (
                  <div style={{ background: 'rgba(34,197,94,0.1)', borderRadius: 6, padding: '6px 10px', flex: 1 }}>
                    <p style={{ fontSize: 9, color: 'var(--text-muted)' }}>Est. impact</p>
                    <p style={{ fontSize: 13, fontWeight: 700, color: '#22c55e' }}>{ins.estimatedImpact}</p>
                  </div>
                )}
                {ins.supplier && (
                  <div style={{ background: 'rgba(255,255,255,0.04)', borderRadius: 6, padding: '6px 10px', flex: 1 }}>
                    <p style={{ fontSize: 9, color: 'var(--text-muted)' }}>Supplier</p>
                    <p style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)' }}>{ins.supplier}</p>
                  </div>
                )}
              </div>

              <div style={{ display: 'flex', gap: 8 }}>
                <button style={{ flex: 1, padding: '8px', borderRadius: 8, background: 'var(--blue)', color: '#fff', border: 'none', cursor: 'pointer', fontSize: 11, fontWeight: 600 }}>
                  Take Action
                </button>
                <button style={{ padding: '8px 12px', borderRadius: 8, background: 'rgba(255,255,255,0.06)', color: 'var(--text-muted)', border: 'none', cursor: 'pointer', fontSize: 11 }}>
                  Dismiss
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Tab 5: Ask AI ─────────────────────────────────────────────────────────────
const EXAMPLE_PROMPTS = [
  'What should I stock this summer?',
  'Is Prime Energy Drink worth stocking?',
  'What are Gen Z buying?',
  'Best products for Ramadan?',
  'Should I add protein bars?',
  'Which beers are trending right now?',
];

function AskAITab() {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const endRef = useRef(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  async function sendQuestion(q) {
    const question = (q || input).trim();
    if (!question) return;
    setInput('');
    setMessages(m => [...m, { role: 'user', text: question }]);
    setLoading(true);
    try {
      const { data } = await api.post('/market/ask', { question });
      setMessages(m => [...m, { role: 'ai', text: data.answer }]);
    } catch (err) {
      setMessages(m => [...m, { role: 'ai', text: `Sorry, I couldn't process that question. ${err.response?.data?.error || err.message}`, error: true }]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 500 }}>
      <div style={{ marginBottom: 16 }}>
        <h2 style={{ fontSize: 18, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 4 }}>Ask AI About Your Market</h2>
        <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>Natural language questions about trends, stocking decisions, and market opportunities</p>
      </div>

      {/* Example prompts */}
      {messages.length === 0 && (
        <div style={{ marginBottom: 20 }}>
          <p style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 8 }}>Try asking:</p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {EXAMPLE_PROMPTS.map(p => (
              <button key={p} onClick={() => sendQuestion(p)} style={{ padding: '6px 12px', borderRadius: 20, background: 'rgba(255,255,255,0.06)', border: '1px solid var(--border)', color: 'var(--text-secondary)', fontSize: 11, cursor: 'pointer' }}>
                {p}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Chat messages */}
      <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 16, padding: '4px 0' }}>
        {messages.map((msg, i) => (
          <div key={i} style={{ display: 'flex', justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start' }}>
            <div style={{
              maxWidth: '80%',
              padding: '10px 14px',
              borderRadius: msg.role === 'user' ? '12px 12px 4px 12px' : '12px 12px 12px 4px',
              background: msg.role === 'user' ? 'var(--blue)' : msg.error ? 'rgba(239,68,68,0.1)' : 'var(--bg-secondary)',
              border: msg.role !== 'user' ? '1px solid var(--border)' : 'none',
              color: msg.role === 'user' ? '#fff' : msg.error ? '#ef4444' : 'var(--text-secondary)',
              fontSize: 13,
              lineHeight: 1.6,
              whiteSpace: 'pre-wrap',
            }}>
              {msg.role === 'ai' && <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--blue-light)', marginBottom: 4 }}>🤖 Market AI</div>}
              {msg.text}
            </div>
          </div>
        ))}
        {loading && (
          <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
            <div style={{ padding: '10px 14px', borderRadius: '12px 12px 12px 4px', background: 'var(--bg-secondary)', border: '1px solid var(--border)' }}>
              <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                {[0,1,2].map(d => (
                  <div key={d} style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--blue)', animation: 'pulse 1s infinite', animationDelay: `${d * 0.2}s` }} />
                ))}
              </div>
            </div>
          </div>
        )}
        <div ref={endRef} />
      </div>

      {/* Input */}
      <div style={{ display: 'flex', gap: 10 }}>
        <input
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && !e.shiftKey && sendQuestion()}
          placeholder="Ask anything about your market..."
          style={{
            flex: 1, padding: '10px 14px', borderRadius: 10,
            background: 'var(--bg-secondary)', border: '1px solid var(--border)',
            color: 'var(--text-primary)', fontSize: 13, outline: 'none',
          }}
          disabled={loading}
        />
        <button
          onClick={() => sendQuestion()}
          disabled={loading || !input.trim()}
          style={{ padding: '10px 20px', borderRadius: 10, background: 'var(--blue)', color: '#fff', border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 700, opacity: loading || !input.trim() ? 0.5 : 1 }}
        >
          Ask
        </button>
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
const TABS = [
  { id: 'trending', label: 'Trending Now', icon: '🔥' },
  { id: 'gaps',     label: 'Your Gaps',    icon: '📊' },
  { id: 'seasonal', label: 'Seasonal',     icon: '📅' },
  { id: 'insights', label: 'AI Insights',  icon: '💡' },
  { id: 'ask',      label: 'Ask AI',       icon: '🤖' },
];

export default function MarketIntelPage() {
  const [activeTab, setActiveTab] = useState('trending');
  const [trends, setTrends] = useState([]);
  const [gaps, setGaps] = useState([]);
  const [seasonal, setSeasonal] = useState([]);
  const [insights, setInsights] = useState([]);
  const [myTrends, setMyTrends] = useState(null);
  const [insightCount, setInsightCount] = useState(0);
  const [loading, setLoading] = useState({ trends: false, gaps: false, seasonal: false, insights: false });

  useEffect(() => { loadTrends(); loadSeasonal(); loadMyTrends(); loadInsights(); }, []);
  useEffect(() => { if (activeTab === 'gaps' && gaps.length === 0) loadGaps(); }, [activeTab]);

  async function loadTrends() {
    setLoading(l => ({ ...l, trends: true }));
    try {
      const { data } = await api.get('/market/trends?limit=30');
      setTrends(data.trends || []);
    } catch { /* ignore */ }
    finally { setLoading(l => ({ ...l, trends: false })); }
  }

  async function loadGaps() {
    setLoading(l => ({ ...l, gaps: true }));
    try {
      const { data } = await api.get('/market/gaps');
      setGaps(data.gaps || []);
    } catch { /* ignore */ }
    finally { setLoading(l => ({ ...l, gaps: false })); }
  }

  async function loadSeasonal() {
    setLoading(l => ({ ...l, seasonal: true }));
    try {
      const { data } = await api.get('/market/seasonal');
      setSeasonal(data.events || []);
    } catch { /* ignore */ }
    finally { setLoading(l => ({ ...l, seasonal: false })); }
  }

  async function loadInsights() {
    setLoading(l => ({ ...l, insights: true }));
    try {
      const { data } = await api.get('/market/insights');
      setInsights(data.insights || []);
      setInsightCount((data.insights || []).length);
    } catch { /* ignore */ }
    finally { setLoading(l => ({ ...l, insights: false })); }
  }

  async function loadMyTrends() {
    try {
      const { data } = await api.get('/market/my-trends');
      setMyTrends(data);
    } catch { /* ignore */ }
  }

  async function refreshInsights() {
    setLoading(l => ({ ...l, insights: true }));
    try {
      const { data } = await api.post('/market/refresh');
      setInsights(data.insights || []);
    } catch { /* ignore */ }
    finally { setLoading(l => ({ ...l, insights: false })); }
  }

  return (
    <div style={{ padding: '20px 24px', maxWidth: 1200, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
          <span style={{ fontSize: 24 }}>📡</span>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: 'var(--text-primary)' }}>Market Intelligence</h1>
        </div>
        <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>UK convenience store trends, stock gap analysis, and AI-powered recommendations for your shop</p>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 2, borderBottom: '1px solid var(--border)', marginBottom: 28, flexWrap: 'wrap' }}>
        {TABS.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            style={{
              padding: '10px 18px',
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              fontSize: 13,
              fontWeight: 600,
              color: activeTab === tab.id ? 'var(--blue-light)' : 'var(--text-muted)',
              borderBottom: activeTab === tab.id ? '2px solid var(--blue-light)' : '2px solid transparent',
              marginBottom: -1,
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              transition: 'color 0.2s',
              position: 'relative',
            }}
          >
            <span>{tab.icon}</span>
            {tab.label}
            {tab.id === 'insights' && insightCount > 0 && (
              <span style={{ background: '#ef4444', color: '#fff', borderRadius: 20, padding: '0 5px', fontSize: 9, fontWeight: 700, minWidth: 16, textAlign: 'center' }}>{insightCount}</span>
            )}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {activeTab === 'trending' && <TrendingTab trends={trends} myTrends={myTrends} loading={loading.trends} />}
      {activeTab === 'gaps'     && <GapsTab gaps={gaps} loading={loading.gaps} />}
      {activeTab === 'seasonal' && <SeasonalTab events={seasonal} loading={loading.seasonal} />}
      {activeTab === 'insights' && <InsightsTab insights={insights} loading={loading.insights} onRefresh={refreshInsights} />}
      {activeTab === 'ask'      && <AskAITab />}
    </div>
  );
}
