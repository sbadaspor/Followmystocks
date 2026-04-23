// api/asset-detail.js — Dados detalhados via Finnhub + Supabase
const FINNHUB_KEY  = 'ct2affhr01qiurr3qhf0ct2affhr01qiurr3qhfg';
const SUPABASE_URL = 'https://xzxnjifpgvshzlsxhags.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inh6eG5qaWZwZ3ZzaHpsc3hoYWdzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY5MDYzMjQsImV4cCI6MjA5MjQ4MjMyNH0.HlfyTZxvcPcPTR0yWCBUVU8vKm9ncaPVSqBW9LhJvE4';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'public, max-age=1800');

  const { symbol } = req.query;
  if (!symbol) return res.status(400).json({ error: 'symbol required' });

  const fhSymbol = toFinnhub(symbol);
  const fh = (path) =>
    fetch('https://finnhub.io/api/v1' + path + '&token=' + FINNHUB_KEY)
      .then((r) => r.json());

  try {
    // 1. EUR/USD rate from ECB via Frankfurter
    let eurPerUsd = 0.92;
    let eurPerGbp = 1.17;
    try {
      const fxRes  = await fetch('https://api.frankfurter.app/latest?from=EUR&to=USD,GBP');
      const fxData = await fxRes.json();
      if (fxData.rates && fxData.rates.USD) eurPerUsd = 1 / fxData.rates.USD;
      if (fxData.rates && fxData.rates.GBP) eurPerGbp = 1 / fxData.rates.GBP;
    } catch (_) {}

    const isEuropean = fhSymbol.includes(':') &&
      !fhSymbol.startsWith('BINANCE') && !fhSymbol.startsWith('KRAKEN');
    const isGBp = fhSymbol.startsWith('LSE:');
    const fxRate = isEuropean && !isGBp ? 1 : isGBp ? eurPerGbp / 100 : eurPerUsd;

    // 2. Fetch in parallel: profile, quote, metrics, stored fundamentals
    const [profile, quote, metrics, sbData] = await Promise.all([
      fh('/stock/profile2?symbol=' + encodeURIComponent(fhSymbol)),
      fh('/quote?symbol=' + encodeURIComponent(fhSymbol)),
      fh('/stock/metric?symbol=' + encodeURIComponent(fhSymbol) + '&metric=all'),
      fetch(
        SUPABASE_URL + '/rest/v1/assets?ticker=eq.' + encodeURIComponent(symbol) +
        '&select=pe,peg,eps,dividend_yield,gross_margin,op_margin,net_margin,' +
        'roic,debt_equity,lt_debt_equity,beta,market_cap,current_ratio,fundamentals_updated_at',
        { headers: { apikey: SUPABASE_KEY, Authorization: 'Bearer ' + SUPABASE_KEY } }
      ).then((r) => r.json()),
    ]);

    const m  = (metrics && metrics.metric) ? metrics.metric : {};
    const sb = (Array.isArray(sbData) && sbData[0]) ? sbData[0] : {};
    const mCap = profile.marketCapitalization ? profile.marketCapitalization * 1e6 * fxRate : null;

    const currentMetrics = {
      pe:                  sb.pe             != null ? sb.pe             : (m.peTTM              != null ? m.peTTM              : (m.peNormalizedAnnual != null ? m.peNormalizedAnnual : null)),
      eps:                 sb.eps            != null ? sb.eps * fxRate   : (m.epsTTM             != null ? m.epsTTM * fxRate    : null),
      peg:                 sb.peg            != null ? sb.peg            : (m.pegNormalizedAnnual != null ? m.pegNormalizedAnnual : null),
      dividendYield:       sb.dividend_yield != null ? sb.dividend_yield : (m.dividendYieldIndicatedAnnual != null ? m.dividendYieldIndicatedAnnual : null),
      grossMargin:         sb.gross_margin   != null ? sb.gross_margin   : (m.grossMarginAnnual   != null ? m.grossMarginAnnual   : null),
      opMargin:            sb.op_margin      != null ? sb.op_margin      : (m.operatingMarginAnnual != null ? m.operatingMarginAnnual : null),
      netMargin:           sb.net_margin     != null ? sb.net_margin     : (m.netProfitMarginAnnual != null ? m.netProfitMarginAnnual : null),
      roic:                sb.roic           != null ? sb.roic           : (m.roiAnnual           != null ? m.roiAnnual           : null),
      debtToEquity:        sb.debt_equity    != null ? sb.debt_equity    : (m.totalDebt_totalEquityAnnual != null ? m.totalDebt_totalEquityAnnual : null),
      beta:                sb.beta           != null ? sb.beta           : (m.beta               != null ? m.beta               : null),
      marketCap:           mCap,
      currentRatio:        sb.current_ratio  != null ? sb.current_ratio  : (m.currentRatioAnnual  != null ? m.currentRatioAnnual  : null),
      freeCashflow:        m.freeCashFlowTTM != null ? m.freeCashFlowTTM * fxRate : null,
      ebitda:              null,
      netDebtEbitda:       m.netDebt_ebitdaAnnual != null ? m.netDebt_ebitdaAnnual : null,
      daysSalesReceivables:m.daysSalesOutstandingAnnual != null ? m.daysSalesOutstandingAnnual : null,
    };

    // 3. Annual data (single year from TTM metrics)
    const annual = [{
      year:         new Date().getFullYear(),
      eps:          m.epsTTM            != null ? m.epsTTM * fxRate : null,
      revenue:      null,
      grossProfit:  null,
      opIncome:     null,
      netIncome:    null,
      ebitda:       null,
      fcf:          m.freeCashFlowTTM   != null ? m.freeCashFlowTTM * fxRate : null,
      grossMargin:  m.grossMarginTTM    != null ? m.grossMarginTTM    : (m.grossMarginAnnual    != null ? m.grossMarginAnnual    : null),
      opMargin:     m.operatingMarginTTM!= null ? m.operatingMarginTTM: (m.operatingMarginAnnual!= null ? m.operatingMarginAnnual: null),
      netMargin:    m.netProfitMarginTTM!= null ? m.netProfitMarginTTM: (m.netProfitMarginAnnual!= null ? m.netProfitMarginAnnual: null),
      roic:         m.roiAnnual         != null ? m.roiAnnual         : null,
      currentRatio: m.currentRatioAnnual!= null ? m.currentRatioAnnual: null,
      ltDebtCapital:m.longTermDebt_equityAnnual != null ? m.longTermDebt_equityAnnual : null,
      debtEquity:   m.totalDebt_totalEquityAnnual != null ? m.totalDebt_totalEquityAnnual : null,
      daysSales:    m.daysSalesOutstandingAnnual  != null ? m.daysSalesOutstandingAnnual  : null,
    }];

    // 4. Dividend history
    let dividends = [];
    try {
      const now  = Math.floor(Date.now() / 1000);
      const from = now - 86400 * 365 * 10;
      const toDateStr = (ts) => new Date(ts * 1000).toISOString().slice(0, 10);
      const divData = await fh(
        '/stock/dividend?symbol=' + encodeURIComponent(fhSymbol) +
        '&from=' + toDateStr(from) + '&to=' + toDateStr(now)
      );
      if (Array.isArray(divData)) {
        const byYear = {};
        divData.forEach((d) => {
          const yr = new Date(d.date).getFullYear();
          byYear[yr] = (byYear[yr] || 0) + (d.amount * fxRate);
        });
        dividends = Object.entries(byYear)
          .map(([y, a]) => ({ year: Number(y), amount: Number(a.toFixed(4)) }))
          .sort((a, b) => a.year - b.year);
      }
    } catch (_) {}

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
      annual,
      dividends,
    });

  } catch (err) {
    console.error('asset-detail error [' + symbol + ']:', err.message);
    return res.status(500).json({ error: err.message });
  }
}

function toFinnhub(ticker) {
  if (ticker.endsWith('.DE'))  return 'XETRA:'    + ticker.replace('.DE',  '');
  if (ticker.endsWith('.L'))   return 'LSE:'      + ticker.replace('.L',   '');
  if (ticker.endsWith('.PA'))  return 'EURONEXT:' + ticker.replace('.PA',  '');
  if (ticker.endsWith('.AS'))  return 'EURONEXT:' + ticker.replace('.AS',  '');
  if (ticker.endsWith('.LS'))  return 'EURONEXT:' + ticker.replace('.LS',  '');
  if (ticker.endsWith('.MC'))  return 'BME:'      + ticker.replace('.MC',  '');
  if (ticker.endsWith('.MI'))  return 'MIL:'      + ticker.replace('.MI',  '');
  if (ticker === 'BTC-USD')    return 'BINANCE:BTCUSDT';
  if (ticker === 'ETH-USD')    return 'BINANCE:ETHUSDT';
  if (ticker.endsWith('-USD')) return 'BINANCE:'  + ticker.replace('-USD', '') + 'USDT';
  return ticker;
}
