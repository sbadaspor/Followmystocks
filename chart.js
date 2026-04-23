// api/chart.js — Proxy para dados históricos do Yahoo Finance (sparkline)
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'public, max-age=300'); // cache 5 min

  const { symbol } = req.query;
  if (!symbol) return res.status(400).json({ error: 'symbol param required' });

  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=1mo&interval=1d&includePrePost=false`;

    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'application/json',
        'Referer': 'https://finance.yahoo.com',
      }
    });

    if (!response.ok) {
      throw new Error(`Yahoo Finance HTTP ${response.status}`);
    }

    const data = await response.json();
    return res.status(200).json(data);

  } catch (err) {
    console.error('Chart API error:', err);
    return res.status(500).json({ error: err.message });
  }
}
