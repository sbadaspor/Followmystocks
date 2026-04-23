// api/chart.js — Proxy para dados históricos do Yahoo Finance (sparkline + detalhe)
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');

  const { symbol, range = '1mo' } = req.query;
  if (!symbol) return res.status(400).json({ error: 'symbol required' });

  const cfgMap = {
    '1d':  { r: '1d',  i: '5m',   cache: 60 },
    '5d':  { r: '5d',  i: '30m',  cache: 300 },
    '1mo': { r: '1mo', i: '1d',   cache: 300 },
    '3mo': { r: '3mo', i: '1d',   cache: 600 },
    '1y':  { r: '1y',  i: '1wk',  cache: 1800 },
    '5y':  { r: '5y',  i: '1mo',  cache: 3600 },
    'max': { r: 'max', i: '3mo',  cache: 3600 },
  };
  const cfg = cfgMap[range] || cfgMap['1mo'];
  res.setHeader('Cache-Control', `public, max-age=${cfg.cache}`);

  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=${cfg.r}&interval=${cfg.i}&includePrePost=false&events=div`;
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'application/json',
        'Referer': 'https://finance.yahoo.com',
      }
    });
    if (!response.ok) throw new Error(`Yahoo Finance HTTP ${response.status}`);
    const data = await response.json();
    return res.status(200).json(data);
  } catch (err) {
    console.error('Chart API error:', err);
    return res.status(500).json({ error: err.message });
  }
}
