// api/asset-detail.js — Dados detalhados via Finnhub
const FINNHUB_KEY  = 'ct2affhr01qiurr3qhf0ct2affhr01qiurr3qhfg';
const SUPABASE_URL = 'https://xzxnjifpgvshzlsxhags.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inh6eG5qaWZwZ3ZzaHpsc3hoYWdzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY5MDYzMjQsImV4cCI6MjA5MjQ4MjMyNH0.HlfyTZxvcPcPTR0yWCBUVU8vKm9ncaPVSqBW9LhJvE4';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'public, max-age=1800');

  const { symbol } = req.query;
  if (!symbol) return res.status(400).json({ error: 'symbol required' });

  const fh = (path) =>
    fetch(`https://finnhub.io/api/v1${path}&token=${FINNHUB_KEY}`).then(r => r.json());

  const fhSymbol = toFinnhub(symbol);

  try {
    // 1. Get EUR/USD rate from ECB via Frankfurter (reliable, free, no key)
    let eurUsd = 0.92;
    try {
      const fx = await fetch('https://api.frankfurter.app/latest?from=EUR&to=USD');
      const fxData = await fx.json();
      if (fxData.rates?.USD) eurUsd = 1 / fxData.rates.USD; // EUR per 1 USD
    } catch {}

    // Determine FX rate for this symbol
    const isEuropean = fhSymbol.includes(':') && !fhSymbol.startsWith('BINANCE') && !fhSymbol.startsWith('KRAKEN');
    const isGBp = fhSymbol.startsWith('LSE:');
    const fxRate = isEuropean && !isGBp ? 1 : isGBp ? eurUsd / 100 : eurUsd;

    // 2. Fetch profile, quote, metrics, financials in parallel
    const [profile, quote, metrics, sbRes] = await Promise.all([
      fh(`/stock/profile2?symbol=${encodeURIComponent(fhSymbol)}`),
      fh(`/quote?symbol=${encodeURIComponent(fhSymbol)}`),
      fh(`/stock/metric?symbol=${encodeURIComponent(fhSymbol)}&metric=all`),
      fetch(`${SUPABASE_URL}/rest/v1/assets?ticker=eq.${encodeURIComponent(symbol)}&select=pe,peg,eps,dividend_yield,gross_margin,op_margin,net_margin,roic,debt_equity,lt_debt_equity,beta,market_cap,current_ratio,fundamentals_updated_at`, {
        headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` }
      }).then(r => r.json())
    ]);

    const m   = metrics.metric || {};
    const sb  = sbRes?.[0] || {};
    const mCap = (profile.marketCapitalization || 0) * 1e6 * fxRate;

    // 3. Build current metrics (prefer Supabase stored values, fallback to Finnhub live)
    const currentMetrics = {
      pe:              sb.pe              ?? m.peTTM              ?? m.peNormalizedAnnual ?? null,
      eps:             sb.eps             ?? m.epsTTM             ?? null,
      peg:             sb.peg             ?? m.pegNormalizedAnnual ?? null,
      dividendYield:   sb.dividend_yield  ?? m.dividendYieldIndicatedAnnual ?? null,
      grossMargin:     sb.gross_margin    ?? m.grossMarginAnnual  ?? null,
      opMargin:        sb.op_margin       ?? m.operatingMarginAnnual ?? null,
      netMargin:       sb.net_margin      ?? m.netProfitMarginAnnual ?? null,
      roic:            sb.roic            ?? m.roiAnnual          ?? null,
      debtToEquity:    sb.debt_equity     ?? m.totalDebt_totalEquityAnnual ?? null,
      beta:            sb.beta            ?? m.beta               ?? null,
      marketCap:       mCap || null,
      currentRatio:    sb.current_ratio   ?? m.currentRatioAnnual ?? null,
      freeCashflow:    m.freeCashFlowTTM  ? m.freeCashFlowTTM * fxRate : null,
      ebitda:          m.ebitdaPerShareAnnual ? m.ebitdaPerShareAnnual * fxRate : null,
      netDebtEbitda:   m.netDebt_ebitdaAnnual ?? null,
      daysSalesReceivables: m.daysSalesOutstandingAnnual ?? null,
    };

    // 4. Build annual data from Finnhub financials
    const [incRes, cfRes, bsRes] = await Promise.all([
      fh(`/stock/financials-reported?symbol=${encodeURIComponent(fhSymbol)}&freq=annual`),
      fh(`/stock/financials-reported?symbol=${encodeURIComponent(fhSymbol)}&freq=annual`),
      fh(`/stock/financials-reported?symbol=${encodeURIComponent(fhSymbol)}&freq=annual`),
    ]);

    // Build annual from metrics historical data (simpler, more reliable from Finnhub)
    const years = [0,1,2,3].map(i => {
      const yr = new Date().getFullYear() - i;
      const getSuffix = (base, yr2) => m[`${base}Annual`] ?? null;

      return {
        year:        yr,
        eps:         m[`epsTTM`] && i === 0 ? m.epsTTM * fxRate : null,
        revenue:     null, grossProfit: null, opIncome: null, netIncome: null,
        ebitda:      null, fcf: null,
        grossMargin: i === 0 ? (m.grossMarginTTM ?? m.grossMarginAnnual ?? null) : null,
        opMargin:    i === 0 ? (m.operatingMarginTTM ?? m.operatingMarginAnnual ?? null) : null,
        netMargin:   i === 0 ? (m.netProfitMarginTTM ?? m.netProfitMarginAnnual ?? null) : null,
        roic:        i === 0 ? (m.roiAnnual ?? null) : null,
        currentRatio:i === 0 ? (m.currentRatioAnnual ?? null) : null,
        ltDebtCapital:i === 0 ? (m.longTermDebt_equityAnnual ?? null) : null,
        debtEquity:  i === 0 ? (m.totalDebt_totalEquityAnnual ?? null) : null,
        daysSales:   i === 0 ? (m.daysSalesOutstandingAnnual ?? null) : null,
      };
    }).filter(a => Object.values(a).some(v => v !== null && v !== a.year));

    // 5. Dividends from Finnhub
    let dividends = [];
    try {
      const now = Math.floor(Date.now()/1000);
      const from = now - 86400*365*10;
      const divData = await fh(`/stock/dividend?symbol=${encodeURIComponent(fhSymbol)}&from=${toDate(from)}&to=${toDate(now)}`);
      if (Array.isArray(divData)) {
        const byYear = {};
        divData.forEach(d => {
          const yr = new Date(d.date).getFullYear();
          byYear[yr] = (byYear[yr]||0) + (d.amount * fxRate);
        });
        dividends = Object.entries(byYear).map(([y,a]) => ({year:+y, amount:+a.toFixed(4)})).sort((a,b)=>a.year-b.year);
      }
    } catch {}

    return res.status(200).json({
      currency: 'EUR',
      fxRate,
      info: {
        sector:       profile.finnhubIndustry || null,
        industry:     profile.finnhubIndustry || null,
        country:      profile.country         || null,
        fiscalYearEnd:null,
        website:      profile.weburl          || null,
        description:  null,
      },
      metrics: currentMetrics,
      annual:  years,
      dividends,
    });

  } catch (err) {
    console.error(`asset-detail error [${symbol}]:`, err.message);
    return res.status(500).json({ error: err.message });
  }
}

function toFinnhub(ticker) {
  if (ticker.endsWith('.DE'))  return 'XETRA:'   + ticker.replace('.DE', '');
  if (ticker.endsWith('.L'))   return 'LSE:'     + ticker.replace('.L', '');
  if (ticker.endsWith('.PA'))  return 'EURONEXT:'+ ticker.replace('.PA', '');
  if (ticker.endsWith('.AS'))  return 'EURONEXT:'+ ticker.replace('.AS', '');
  if (ticker.endsWith('.LS'))  return 'EURONEXT:'+ ticker.replace('.LS', '');
  if (ticker.endsWith('.MC'))  return 'BME:'     + ticker.replace('.MC', '');
  if (ticker.endsWith('.MI'))  return 'MIL:'     + ticker.replace('.MI', '');
  if (ticker === 'BTC-USD')    return 'BINANCE:BTCUSDT';
  if (ticker === 'ETH-USD')    return 'BINANCE:ETHUSDT';
  if (ticker.endsWith('-USD')) return 'BINANCE:' + ticker.replace('-USD','') + 'USDT';
  return ticker;
}

function toDate(ts) {
  return new Date(ts*1000).toISOString().slice(0,10);
}
