// api/quote.js — Finnhub live quotes · preços na moeda nativa do ativo (sem conversão)
const FINNHUB_KEY = 'ct2affhr01qiurr3qhf0ct2affhr01qiurr3qhfg';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'no-store');

  const { symbols } = req.query;
  if (!symbols) return res.status(400).json({ error: 'symbols required' });

  const tickers = symbols.split(',').map(s => s.trim()).filter(Boolean);

  // Fetch all quotes in parallel
  const results = await Promise.allSettled(
    tickers.map(async (ticker) => {
      const fhSymbol = toFinnhub(ticker);
      const currency = nativeCurrency(fhSymbol);

      const r = await fetch(
        `https://finnhub.io/api/v1/quote?symbol=${encodeURIComponent(fhSymbol)}&token=${FINNHUB_KEY}`
      );
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const data = await r.json();
      if (!data.c || data.c === 0) throw new Error('No price data');

      // London Stock Exchange quotes come in pence (GBp) — convert to GBP
      const isGBp = fhSymbol.startsWith('LSE:');
      const factor = isGBp ? 0.01 : 1;

      return {
        symbol:                     ticker,
        regularMarketPrice:         +( data.c  * factor).toFixed(4),
        regularMarketChange:        +( data.d  * factor).toFixed(4),
        regularMarketChangePercent: data.dp,
        regularMarketPreviousClose: +( data.pc * factor).toFixed(4),
        regularMarketHigh:          +( data.h  * factor).toFixed(4),
        regularMarketLow:           +( data.l  * factor).toFixed(4),
        currency,
        _fhSymbol: fhSymbol,
      };
    })
  );

  const result = results
    .filter(r => r.status === 'fulfilled')
    .map(r => r.value);

  return res.status(200).json({ quoteResponse: { result } });
}

// Map ticker → Finnhub symbol
function toFinnhub(ticker) {
  if (ticker.endsWith('.DE'))  return 'XETRA:'    + ticker.replace('.DE', '');
  if (ticker.endsWith('.L'))   return 'LSE:'      + ticker.replace('.L', '');
  if (ticker.endsWith('.PA'))  return 'EURONEXT:' + ticker.replace('.PA', '');
  if (ticker.endsWith('.AS'))  return 'EURONEXT:' + ticker.replace('.AS', '');
  if (ticker.endsWith('.LS'))  return 'EURONEXT:' + ticker.replace('.LS', '');
  if (ticker.endsWith('.MC'))  return 'BME:'      + ticker.replace('.MC', '');
  if (ticker.endsWith('.MI'))  return 'MIL:'      + ticker.replace('.MI', '');
  if (ticker === 'BTC-USD')    return 'BINANCE:BTCUSDT';
  if (ticker === 'ETH-USD')    return 'BINANCE:ETHUSDT';
  if (ticker.endsWith('-USD')) return 'BINANCE:'  + ticker.replace('-USD', '') + 'USDT';
  return ticker;
}

// Determine the native display currency for a given Finnhub symbol
function nativeCurrency(fhSymbol) {
  if (fhSymbol.startsWith('LSE:'))       return 'GBP';
  if (fhSymbol.startsWith('XETRA:'))    return 'EUR';
  if (fhSymbol.startsWith('EURONEXT:')) return 'EUR';
  if (fhSymbol.startsWith('BME:'))      return 'EUR';
  if (fhSymbol.startsWith('MIL:'))      return 'EUR';
  if (fhSymbol.startsWith('BINANCE:') || fhSymbol.startsWith('KRAKEN:')) return 'USD';
  return 'USD'; // default: US markets
}
