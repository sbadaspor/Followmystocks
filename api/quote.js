// api/quote.js — Proxy para Yahoo Finance com fallback e cookies
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'no-store');

  const { symbols } = req.query;
  if (!symbols) return res.status(400).json({ error: 'symbols param required' });

  const headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    'Accept': 'application/json, text/plain, */*',
    'Accept-Language': 'en-US,en;q=0.9',
    'Accept-Encoding': 'gzip, deflate, br',
    'Origin': 'https://finance.yahoo.com',
    'Referer': 'https://finance.yahoo.com/',
    'Sec-Fetch-Dest': 'empty',
    'Sec-Fetch-Mode': 'cors',
    'Sec-Fetch-Site': 'same-site',
  };

  const fields = [
    'regularMarketPrice', 'regularMarketChange', 'regularMarketChangePercent',
    'trailingPE', 'currency', 'shortName', 'longName', 'quoteType',
    'marketCap', 'regularMarketVolume',
  ].join(',');

  // Try v7 on query1, then query2 as fallback
  const urls = [
    `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${encodeURIComponent(symbols)}&fields=${fields}`,
    `https://query2.finance.yahoo.com/v7/finance/quote?symbols=${encodeURIComponent(symbols)}&fields=${fields}`,
    // v8 fallback
    `https://query1.finance.yahoo.com/v8/finance/quote?symbols=${encodeURIComponent(symbols)}`,
  ];

  let lastError = null;

  for (const url of urls) {
    try {
      const response = await fetch(url, { headers });

      if (!response.ok) {
        lastError = `HTTP ${response.status}`;
        continue;
      }

      const data = await response.json();
      const result = data.quoteResponse?.result;

      if (result && result.length > 0) {
        return res.status(200).json(data);
      }

      lastError = 'Empty result';
    } catch (err) {
      lastError = err.message;
    }
  }

  // All attempts failed
  console.error(`Quote failed for ${symbols}: ${lastError}`);
  return res.status(200).json({
    quoteResponse: { result: [], error: lastError }
  });
}
