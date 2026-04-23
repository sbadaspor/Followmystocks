// api/financials.js — Fundamentals from Supabase (stored) or Finnhub fallback
const FINNHUB_KEY  = 'ct2affhr01qiurr3qhf0ct2affhr01qiurr3qhfg';
const SUPABASE_URL = 'https://xzxnjifpgvshzlsxhags.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inh6eG5qaWZwZ3ZzaHpsc3hoYWdzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY5MDYzMjQsImV4cCI6MjA5MjQ4MjMyNH0.HlfyTZxvcPcPTR0yWCBUVU8vKm9ncaPVSqBW9LhJvE4';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'public, max-age=3600');

  const { symbol } = req.query;
  if (!symbol) return res.status(400).json({ error: 'symbol required' });

  try {
    // 1. Try to get from Supabase first (populated by Admin → Atualizar Fundamentais)
    const sbRes = await fetch(
      `${SUPABASE_URL}/rest/v1/assets?ticker=eq.${encodeURIComponent(symbol)}&select=pe,peg,eps,dividend_yield,gross_margin,op_margin,net_margin,roic,debt_equity,lt_debt_equity,beta,market_cap,current_ratio,fundamentals_updated_at`,
      { headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` } }
    );
    const sbData = await sbRes.json();
    const stored = sbData?.[0];

    if (stored && stored.fundamentals_updated_at) {
      // Use stored data — map to common format
      return res.status(200).json({
        pe:                  stored.pe,
        peg:                 stored.peg,
        eps:                 stored.eps,
        dividendYield:       stored.dividend_yield,
        grossMargin:         stored.gross_margin,
        operatingMargins:    stored.op_margin,
        profitMargins:       stored.net_margin,
        roic:                stored.roic,
        debtToEquity:        stored.debt_equity != null ? stored.debt_equity * 100 : null,
        longTermDebtToEquity:stored.lt_debt_equity != null ? stored.lt_debt_equity * 100 : null,
        beta:                stored.beta,
        marketCap:           stored.market_cap,
        currentRatio:        stored.current_ratio,
        _source: 'supabase',
      });
    }

    // 2. Fallback: fetch live from Finnhub
    const fhSymbol = toFinnhub(symbol);
    const r = await fetch(
      `https://finnhub.io/api/v1/stock/metric?symbol=${encodeURIComponent(fhSymbol)}&metric=all&token=${FINNHUB_KEY}`
    );
    const data = await r.json();
    const m = data.metric || {};

    return res.status(200).json({
      pe:                  m.peTTM              ?? m.peNormalizedAnnual ?? null,
      peg:                 m.pegNormalizedAnnual ?? null,
      eps:                 m.epsTTM             ?? null,
      dividendYield:       m.dividendYieldIndicatedAnnual ?? null,
      grossMargin:         m.grossMarginAnnual  ?? null,
      operatingMargins:    m.operatingMarginAnnual ?? null,
      profitMargins:       m.netProfitMarginAnnual ?? null,
      roic:                m.roiAnnual          ?? null,
      debtToEquity:        m.totalDebt_totalEquityAnnual != null ? m.totalDebt_totalEquityAnnual * 100 : null,
      longTermDebtToEquity:m.longTermDebt_equityAnnual != null ? m.longTermDebt_equityAnnual * 100 : null,
      beta:                m.beta               ?? null,
      currentRatio:        m.currentRatioAnnual ?? null,
      _source: 'finnhub-live',
    });

  } catch (err) {
    return res.status(200).json({ pe:null,peg:null,eps:null,dividendYield:null,grossMargin:null,roic:null,debtToEquity:null,_error:err.message });
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
  if (ticker.endsWith('-USD')) return ticker;
  return ticker;
}
