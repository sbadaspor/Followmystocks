// api/asset-detail.js — Lê fundamentais do Supabase + quote live do Finnhub
const FINNHUB_KEY  = 'ct2affhr01qiurr3qhf0ct2affhr01qiurr3qhfg';
const SUPABASE_URL = 'https://xzxnjifpgvshzlsxhags.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inh6eG5qaWZwZ3ZzaHpsc3hoYWdzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY5MDYzMjQsImV4cCI6MjA5MjQ4MjMyNH0.HlfyTZxvcPcPTR0yWCBUVU8vKm9ncaPVSqBW9LhJvE4';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'public, max-age=900');

  const symbol = req.query.symbol;
  if (!symbol) return res.status(400).json({ error: 'symbol required' });

  try {
    // 1. EUR rate from ECB
    let eurPerUsd = 0.92;
    let eurPerGbp = 1.17;
    try {
      const fxRes  = await fetch('https://api.frankfurter.app/latest?from=EUR&to=USD,GBP');
      const fxData = await fxRes.json();
      if (fxData.rates && fxData.rates.USD) eurPerUsd = 1 / fxData.rates.USD;
      if (fxData.rates && fxData.rates.GBP) eurPerGbp = 1 / fxData.rates.GBP;
    } catch (_) {}

    const fhSymbol   = toFinnhub(symbol);
    const isEuropean = fhSymbol.indexOf(':') !== -1 && fhSymbol.indexOf('BINANCE') !== 0 && fhSymbol.indexOf('KRAKEN') !== 0;
    const isGBp      = fhSymbol.indexOf('LSE:') === 0;
    const fxRate     = (isEuropean && !isGBp) ? 1 : (isGBp ? eurPerGbp / 100 : eurPerUsd);

    // 2. Fetch Supabase fundamentals + Finnhub profile in parallel
    const sbUrl = SUPABASE_URL + '/rest/v1/assets'
      + '?ticker=eq.' + encodeURIComponent(symbol)
      + '&select=pe,peg,eps,dividend_yield,gross_margin,op_margin,net_margin,'
      + 'roic,debt_equity,lt_debt_equity,beta,market_cap,current_ratio,'
      + 'sector,full_name,fundamentals_updated_at';

    const [sbRes, profileRes] = await Promise.all([
      fetch(sbUrl, { headers: { apikey: SUPABASE_KEY, Authorization: 'Bearer ' + SUPABASE_KEY } }),
      fetch('https://finnhub.io/api/v1/stock/profile2?symbol=' + encodeURIComponent(fhSymbol) + '&token=' + FINNHUB_KEY),
    ]);

    const sbData  = await sbRes.json();
    const profile = await profileRes.json();
    const sb      = (Array.isArray(sbData) && sbData[0]) ? sbData[0] : {};

    const metrics = {
      pe:                  sb.pe             != null ? sb.pe             : null,
      eps:                 sb.eps            != null ? sb.eps            : null,
      peg:                 sb.peg            != null ? sb.peg            : null,
      dividendYield:       sb.dividend_yield != null ? sb.dividend_yield : null,
      grossMargin:         sb.gross_margin   != null ? sb.gross_margin   : null,
      opMargin:            sb.op_margin      != null ? sb.op_margin      : null,
      netMargin:           sb.net_margin     != null ? sb.net_margin     : null,
      roic:                sb.roic           != null ? sb.roic           : null,
      debtToEquity:        sb.debt_equity    != null ? sb.debt_equity    : null,
      beta:                sb.beta           != null ? sb.beta           : null,
      marketCap:           sb.market_cap     != null ? sb.market_cap     : (profile.marketCapitalization ? profile.marketCapitalization * 1e6 * fxRate : null),
      currentRatio:        sb.current_ratio  != null ? sb.current_ratio  : null,
      freeCashflow:        null,
      ebitda:              null,
      netDebtEbitda:       null,
      daysSalesReceivables:null,
    };

    // 3. Annual stub — populated from Supabase stored values (last year only for now)
    const annual = [{
      year:         new Date().getFullYear(),
      eps:          sb.eps          != null ? sb.eps          : null,
      grossMargin:  sb.gross_margin != null ? sb.gross_margin : null,
      opMargin:     sb.op_margin    != null ? sb.op_margin    : null,
      netMargin:    sb.net_margin   != null ? sb.net_margin   : null,
      roic:         sb.roic         != null ? sb.roic         : null,
      currentRatio: sb.current_ratio!= null ? sb.current_ratio: null,
      debtEquity:   sb.debt_equity  != null ? sb.debt_equity  : null,
      ltDebtCapital:sb.lt_debt_equity!= null? sb.lt_debt_equity: null,
      revenue: null, grossProfit: null, opIncome: null,
      netIncome: null, ebitda: null, fcf: null, daysSales: null,
    }];

    return res.status(200).json({
      currency: 'EUR',
      fxRate,
      info: {
        sector:        sb.sector              || profile.finnhubIndustry || null,
        industry:      profile.finnhubIndustry || null,
        country:       profile.country         || null,
        fiscalYearEnd: null,
        website:       profile.weburl          || null,
        description:   null,
        updatedAt:     sb.fundamentals_updated_at || null,
      },
      metrics,
      annual,
      dividends: [],
    });

  } catch (err) {
    console.error('asset-detail error [' + symbol + ']:', err.message);
    return res.status(500).json({ error: err.message });
  }
}

function toFinnhub(ticker) {
  if (ticker.indexOf('.DE')  === ticker.length - 3) return 'XETRA:'    + ticker.slice(0, -3);
  if (ticker.indexOf('.L')   === ticker.length - 2) return 'LSE:'      + ticker.slice(0, -2);
  if (ticker.indexOf('.PA')  === ticker.length - 3) return 'EURONEXT:' + ticker.slice(0, -3);
  if (ticker.indexOf('.AS')  === ticker.length - 3) return 'EURONEXT:' + ticker.slice(0, -3);
  if (ticker.indexOf('.LS')  === ticker.length - 3) return 'EURONEXT:' + ticker.slice(0, -3);
  if (ticker.indexOf('.MC')  === ticker.length - 3) return 'BME:'      + ticker.slice(0, -3);
  if (ticker.indexOf('.MI')  === ticker.length - 3) return 'MIL:'      + ticker.slice(0, -3);
  if (ticker === 'BTC-USD')  return 'BINANCE:BTCUSDT';
  if (ticker === 'ETH-USD')  return 'BINANCE:ETHUSDT';
  if (ticker.slice(-4) === '-USD') return 'BINANCE:' + ticker.slice(0, -4) + 'USDT';
  return ticker;
}
