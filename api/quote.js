// api/quote.js — Finnhub live quotes com conversão automática para EUR
const FINNHUB_KEY = 'ct2affhr01qiurr3qhf0ct2affhr01qiurr3qhfg';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'no-store');

  const { symbols } = req.query;
  if (!symbols) return res.status(400).json({ error: 'symbols required' });

  const tickers = symbols.split(',').map(s => s.trim()).filter(Boolean);

  // Fetch EUR/USD rate first (1 USD = X EUR)
  let eurUsd = 0.92; // fallback
  try {
    const fxRes = await fetch(
      `https://finnhub.io/api/v1/forex/rates?base=USD&token=${FINNHUB_KEY}`
    );
    const fxData = await fxRes.json();
    if (fxData.quote?.EUR) eurUsd = fxData.quote.EUR;
  } catch {}

  // Fetch all quotes in parallel
  const results = await Promise.allSettled(
    tickers.map(async (ticker) => {
      const fhSymbol = toFinnhub(ticker);
      const isCrypto = ticker.endsWith('-USD') || ticker.endsWith('-EUR');

      const url = isCrypto
        ? `https://finnhub.io/api/v1/quote?symbol=${encodeURIComponent(fhSymbol)}&token=${FINNHUB_KEY}`
        : `https://finnhub.io/api/v1/quote?symbol=${encodeURIComponent(fhSymbol)}&token=${FINNHUB_KEY}`;

      const r = await fetch(url);
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const data = await r.json();
      if (!data.c || data.c === 0) throw new Error('No price data');

      // Determine if we need to convert to EUR
      // European stocks (XETRA, EURONEXT, BME, MIL) are already in EUR
      // US stocks, crypto quoted in USD need conversion
      const isEuropean = fhSymbol.includes(':') && !fhSymbol.startsWith('BINANCE') && !fhSymbol.startsWith('KRAKEN');
      const isGBp = fhSymbol.startsWith('LSE:'); // London stocks in GBp (pence)
      const isAlreadyEur = isEuropean && !isGBp;

      let fx = 1;
      if (!isAlreadyEur) {
        if (isGBp) fx = eurUsd / 100; // GBp → GBP → EUR
        else        fx = eurUsd;       // USD → EUR
      }

      const price  = data.c * fx;
      const change = data.d * fx;
      const changePct = data.dp; // % is the same regardless of currency

      return {
        symbol:                     ticker,
        regularMarketPrice:         +price.toFixed(4),
        regularMarketChange:        +change.toFixed(4),
        regularMarketChangePercent: changePct,
        regularMarketPreviousClose: +(data.pc * fx).toFixed(4),
        regularMarketHigh:          +(data.h  * fx).toFixed(4),
        regularMarketLow:           +(data.l  * fx).toFixed(4),
        currency: 'EUR',
        _fxRate: fx,
      };
    })
  );

  const result = results
    .filter(r => r.status === 'fulfilled')
    .map(r => r.value);

  return res.status(200).json({ quoteResponse: { result } });
}

// Convert Yahoo Finance ticker → Finnhub symbol
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
  if (ticker.endsWith('-USD')) return 'BINANCE:' + ticker.replace('-USD', '') + 'USDT';
  return ticker; // US stocks: AAPL, MSFT, V, etc. — quoted in USD
}
