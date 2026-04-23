// api/quote.js — Finnhub live quotes com conversão EUR via ECB (frankfurter.app)
const FINNHUB_KEY = 'ct2affhr01qiurr3qhf0ct2affhr01qiurr3qhfg';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'no-store');

  const { symbols } = req.query;
  if (!symbols) return res.status(400).json({ error: 'symbols required' });

  const tickers = symbols.split(',').map(s => s.trim()).filter(Boolean);

  // Fetch exchange rates from ECB via Frankfurter (free, no key, official rates)
  // Returns: how many EUR per 1 unit of foreign currency
  let rates = { USD: 0.92, GBP: 1.17 }; // sensible fallbacks
  try {
    const fxRes = await fetch('https://api.frankfurter.app/latest?from=EUR&to=USD,GBP');
    const fxData = await fxRes.json();
    // fxData.rates = { USD: 1.08, GBP: 0.85 } → EUR per USD = 1/1.08
    if (fxData.rates?.USD) rates.USD = 1 / fxData.rates.USD; // EUR per 1 USD
    if (fxData.rates?.GBP) rates.GBP = 1 / fxData.rates.GBP; // EUR per 1 GBP
  } catch (e) {
    console.error('FX fetch failed:', e.message);
  }

  // Fetch all quotes in parallel
  const results = await Promise.allSettled(
    tickers.map(async (ticker) => {
      const fhSymbol = toFinnhub(ticker);

      const r = await fetch(
        `https://finnhub.io/api/v1/quote?symbol=${encodeURIComponent(fhSymbol)}&token=${FINNHUB_KEY}`
      );
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const data = await r.json();
      if (!data.c || data.c === 0) throw new Error('No price data');

      // Determine conversion factor to EUR
      const isEuropean = fhSymbol.includes(':') &&
        !fhSymbol.startsWith('BINANCE') && !fhSymbol.startsWith('KRAKEN');
      const isGBp = fhSymbol.startsWith('LSE:'); // London prices in pence (GBp)

      let fx;
      if (isEuropean && !isGBp) {
        fx = 1;              // Already EUR
      } else if (isGBp) {
        fx = rates.GBP / 100; // GBp → GBP → EUR
      } else {
        fx = rates.USD;      // USD → EUR
      }

      return {
        symbol:                     ticker,
        regularMarketPrice:         +( data.c  * fx).toFixed(4),
        regularMarketChange:        +( data.d  * fx).toFixed(4),
        regularMarketChangePercent: data.dp,   // % unchanged
        regularMarketPreviousClose: +( data.pc * fx).toFixed(4),
        regularMarketHigh:          +( data.h  * fx).toFixed(4),
        regularMarketLow:           +( data.l  * fx).toFixed(4),
        currency: 'EUR',
        _fx: fx,
        _fhSymbol: fhSymbol,
      };
    })
  );

  const result = results
    .filter(r => r.status === 'fulfilled')
    .map(r => r.value);

  return res.status(200).json({ quoteResponse: { result } });
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
