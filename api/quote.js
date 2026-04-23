// api/quote.js — Finnhub live quotes (parallel per symbol)
const FINNHUB_KEY = 'ct2affhr01qiurr3qhf0ct2affhr01qiurr3qhfg';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'no-store');

  const { symbols } = req.query;
  if (!symbols) return res.status(400).json({ error: 'symbols required' });

  const tickers = symbols.split(',').map(s => s.trim()).filter(Boolean);

  // Fetch all quotes in parallel (Finnhub free has no batch endpoint)
  const results = await Promise.allSettled(
    tickers.map(async (ticker) => {
      const fhSymbol = toFinnhub(ticker);
      const url = `https://finnhub.io/api/v1/quote?symbol=${encodeURIComponent(fhSymbol)}&token=${FINNHUB_KEY}`;
      const r = await fetch(url);
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const data = await r.json();
      if (!data.c || data.c === 0) throw new Error('No price data');
      return {
        symbol:                       ticker,
        regularMarketPrice:           data.c,
        regularMarketChange:          data.d,
        regularMarketChangePercent:   data.dp,
        regularMarketPreviousClose:   data.pc,
        regularMarketHigh:            data.h,
        regularMarketLow:             data.l,
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
  if (ticker.endsWith('.DE'))  return 'XETRA:'  + ticker.replace('.DE', '');
  if (ticker.endsWith('.L'))   return 'LSE:'    + ticker.replace('.L', '');
  if (ticker.endsWith('.PA'))  return 'EURONEXT:'+ ticker.replace('.PA', '');
  if (ticker.endsWith('.AS'))  return 'EURONEXT:'+ ticker.replace('.AS', '');
  if (ticker.endsWith('.LS'))  return 'EURONEXT:'+ ticker.replace('.LS', '');
  if (ticker.endsWith('.MC'))  return 'BME:'    + ticker.replace('.MC', '');
  if (ticker.endsWith('.MI'))  return 'MIL:'    + ticker.replace('.MI', '');
  if (ticker === 'BTC-USD')    return 'BINANCE:BTCUSDT';
  if (ticker === 'ETH-USD')    return 'BINANCE:ETHUSDT';
  if (ticker.endsWith('-USD'))  return 'BINANCE:' + ticker.replace('-USD','') + 'USDT';
  return ticker; // US stocks: AAPL, MSFT, V, etc.
}
