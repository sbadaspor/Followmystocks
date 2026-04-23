// api/refresh-fundamentals.js
// Chamado pelo Admin para ir buscar fundamentais de TODOS os ativos
// e guardar no Supabase. Zero custo em produção (não é chamado automaticamente).
const FINNHUB_KEY    = 'ct2affhr01qiurr3qhf0ct2affhr01qiurr3qhfg';
const SUPABASE_URL   = 'https://xzxnjifpgvshzlsxhags.supabase.co';
const SUPABASE_KEY   = process.env.SUPABASE_SERVICE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inh6eG5qaWZwZ3ZzaHpsc3hoYWdzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY5MDYzMjQsImV4cCI6MjA5MjQ4MjMyNH0.HlfyTZxvcPcPTR0yWCBUVU8vKm9ncaPVSqBW9LhJvE4';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    // 1. Load all assets from Supabase
    const assetsRes = await fetch(`${SUPABASE_URL}/rest/v1/assets?select=id,ticker,asset_type`, {
      headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` }
    });
    const assets = await assetsRes.json();
    if (!Array.isArray(assets)) throw new Error('Failed to load assets');

    const results = { updated: 0, skipped: 0, errors: [] };

    // 2. Process in batches of 3 to stay within rate limits
    const BATCH = 3;
    for (let i = 0; i < assets.length; i += BATCH) {
      const batch = assets.slice(i, i + BATCH);

      await Promise.all(batch.map(async (asset) => {
        try {
          const fhSymbol = toFinnhub(asset.ticker);
          const isCrypto = asset.asset_type === 'Crypto';

          if (isCrypto) {
            // Crypto doesn't have fundamentals — skip
            results.skipped++;
            return;
          }

          // Fetch profile + metrics in parallel
          const [profileRes, metricsRes] = await Promise.all([
            fetch(`https://finnhub.io/api/v1/stock/profile2?symbol=${encodeURIComponent(fhSymbol)}&token=${FINNHUB_KEY}`),
            fetch(`https://finnhub.io/api/v1/stock/metric?symbol=${encodeURIComponent(fhSymbol)}&metric=all&token=${FINNHUB_KEY}`),
          ]);

          const [profile, metricsData] = await Promise.all([profileRes.json(), metricsRes.json()]);
          const m = metricsData.metric || {};

          // Map Finnhub metric keys → our columns
          const fundamentals = {
            // Valuation
            pe:              m.peTTM              ?? m.peNormalizedAnnual ?? null,
            peg:             m.pegNormalizedAnnual ?? null,
            eps:             m.epsTTM             ?? m.epsNormalizedAnnual ?? null,
            // Dividends
            dividend_yield:  m.dividendYieldIndicatedAnnual ?? null,
            // Margins
            gross_margin:    m.grossMarginAnnual  ?? m.grossMarginTTM   ?? null,
            op_margin:       m.operatingMarginAnnual ?? m.operatingMarginTTM ?? null,
            net_margin:      m.netProfitMarginAnnual ?? m.netProfitMarginTTM ?? null,
            // Returns
            roic:            m.roiAnnual          ?? m.roeTTM ?? null,
            // Debt
            debt_equity:     m.totalDebt_totalEquityAnnual ?? null,
            lt_debt_equity:  m.longTermDebt_equityAnnual   ?? null,
            // Other
            beta:            m.beta               ?? null,
            market_cap:      profile.marketCapitalization != null ? profile.marketCapitalization * 1e6 : null,
            current_ratio:   m.currentRatioAnnual ?? null,
            // Profile info
            sector:          profile.finnhubIndustry || null,
            full_name:       profile.name           || null,
            currency:        profile.currency        || null,
            // Timestamp
            fundamentals_updated_at: new Date().toISOString(),
          };

          // Remove nulls to avoid overwriting existing data
          const payload = Object.fromEntries(
            Object.entries(fundamentals).filter(([, v]) => v !== null)
          );

          // 3. Upsert into Supabase
          await fetch(`${SUPABASE_URL}/rest/v1/assets?id=eq.${asset.id}`, {
            method: 'PATCH',
            headers: {
              'apikey': SUPABASE_KEY,
              'Authorization': `Bearer ${SUPABASE_KEY}`,
              'Content-Type': 'application/json',
              'Prefer': 'return=minimal',
            },
            body: JSON.stringify(payload),
          });

          results.updated++;
        } catch (err) {
          results.errors.push({ ticker: asset.ticker, error: err.message });
        }
      }));

      // Pause between batches to respect 60 req/min limit
      if (i + BATCH < assets.length) await sleep(1200);
    }

    return res.status(200).json(results);

  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function toFinnhub(ticker) {
  if (ticker.endsWith('.DE'))  return 'XETRA:'   + ticker.replace('.DE', '');
  if (ticker.endsWith('.L'))   return 'LSE:'     + ticker.replace('.L', '');
  if (ticker.endsWith('.PA'))  return 'EURONEXT:'+ ticker.replace('.PA', '');
  if (ticker.endsWith('.AS'))  return 'EURONEXT:'+ ticker.replace('.AS', '');
  if (ticker.endsWith('.LS'))  return 'EURONEXT:'+ ticker.replace('.LS', '');
  if (ticker.endsWith('.MC'))  return 'BME:'     + ticker.replace('.MC', '');
  if (ticker.endsWith('.MI'))  return 'MIL:'     + ticker.replace('.MI', '');
  if (ticker.endsWith('-USD')) return ticker.split('-')[0] + 'USDT';
  return ticker;
}
