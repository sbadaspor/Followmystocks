// api/chart.js — Finnhub candle data
const FINNHUB_KEY = 'ct2affhr01qiurr3qhf0ct2affhr01qiurr3qhfg';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');

  const { symbol, range = '1y' } = req.query;
  if (!symbol) return res.status(400).json({ error: 'symbol required' });

  const now = Math.floor(Date.now() / 1000);

  const cfg = {
    '1d':  { from: now - 86400,        resolution: '5',  cache: 60 },
    '5d':  { from: now - 86400 * 5,    resolution: '30', cache: 300 },
    '1mo': { from: now - 86400 * 30,   resolution: 'D',  cache: 300 },
    '3mo': { from: now - 86400 * 90,   resolution: 'D',  cache: 600 },
    '1y':  { from: now - 86400 * 365,  resolution: 'W',  cache: 1800 },
    '5y':  { from: now - 86400 * 1825, resolution: 'M',  cache: 3600 },
    'max': { from: now - 86400 * 3650, resolution: 'M',  cache: 3600 },
  }[range] || { from: now - 86400 * 365, resolution: 'W', cache: 1800 };

  res.setHeader('Cache-Control', `public, max-age=${cfg.cache}`);

  try {
    const fhSymbol = toFinnhub(symbol);
    const isCrypto = fhSymbol.includes(':') && (fhSymbol.startsWith('BINANCE') || fhSymbol.startsWith('KRAKEN'));

    const endpoint = isCrypto
      ? `https://finnhub.io/api/v1/crypto/candle?symbol=${encodeURIComponent(fhSymbol)}&resolution=${cfg.resolution}&from=${cfg.from}&to=${now}&token=${FINNHUB_KEY}`
      : `https://finnhub.io/api/v1/stock/candle?symbol=${encodeURIComponent(fhSymbol)}&resolution=${cfg.resolution}&from=${cfg.from}&to=${now}&token=${FINNHUB_KEY}`;

    const r = await fetch(endpoint);
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const data = await r.json();

    if (data.s === 'no_data' || !data.c) {
      return res.status(200).json({ chart: { result: [{ indicators: { quote: [{ close: [] }] }, timestamp: [] }] } });
    }

    // Return in Yahoo Finance-compatible format so frontend doesn't need changes
    return res.status(200).json({
      chart: {
        result: [{
          timestamp: data.t,
          indicators: { quote: [{ close: data.c, open: data.o, high: data.h, low: data.l, volume: data.v }] }
        }]
      }
    });

  } catch (err) {
    console.error('Chart error:', err.message);
    return res.status(200).json({ chart: { result: [{ indicators: { quote: [{ close: [] }] }, timestamp: [] }] } });
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
