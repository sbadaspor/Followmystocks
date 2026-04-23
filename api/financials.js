// api/financials.js — Dados fundamentais via Yahoo Finance quoteSummary
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'public, max-age=3600'); // cache 1h (dados mudam pouco)

  const { symbol } = req.query;
  if (!symbol) return res.status(400).json({ error: 'symbol required' });

  try {
    const modules = 'keyStatistics,financialData,summaryDetail,defaultKeyStatistics';
    const url = `https://query1.finance.yahoo.com/v11/finance/quoteSummary/${encodeURIComponent(symbol)}?modules=${modules}`;

    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'application/json',
        'Referer': 'https://finance.yahoo.com',
      }
    });

    if (!response.ok) throw new Error(`Yahoo Finance HTTP ${response.status}`);

    const data = await response.json();
    const result = data.quoteSummary?.result?.[0];

    if (!result) throw new Error('No data returned for symbol');

    const ks = result.keyStatistics        || {};
    const fd = result.financialData        || {};
    const sd = result.summaryDetail        || {};
    const dk = result.defaultKeyStatistics || {};

    // Helper: extract raw value from Yahoo Finance's {raw, fmt} objects
    const raw = obj => (obj && obj.raw !== undefined) ? obj.raw : (typeof obj === 'number' ? obj : null);

    // Long-term debt to equity:
    // Yahoo Finance returns "debtToEquity" = total debt/equity in financialData.
    // For long-term only: longTermDebt / (totalStockholdersEquity)
    // We approximate from available fields or use longTermDebtToCapitalization from keyStatistics
    const ltDebtToEq = (() => {
      // Try longTermDebtToCapitalization from keyStatistics — not exactly Debt/Eq but closest
      // More accurate: try from balance sheet. As fallback use same as debtToEquity
      const ltdc = raw(dk.longTermDebtToCapitalization);
      // Convert capitalization ratio to equity ratio: D/(E) = (D/C) / (1 - D/C)
      if (ltdc != null && ltdc < 1) {
        return (ltdc / (1 - ltdc)) * 100; // return in same scale as debtToEquity
      }
      return null;
    })();

    const out = {
      // P/E (trailing)
      pe:                  raw(sd.trailingPE)              ?? raw(ks.trailingPE),
      // PEG ratio
      peg:                 raw(ks.pegRatio),
      // Total Debt / Equity (%) — divide by 100 on frontend
      debtToEquity:        raw(fd.debtToEquity),
      // Long-term Debt / Equity (%) — divide by 100 on frontend
      longTermDebtToEquity: ltDebtToEq,
      // EPS (trailing twelve months)
      eps:                 raw(ks.trailingEps),
      // Dividend Yield (decimal, e.g. 0.023 = 2.3%) — multiply by 100 on frontend
      dividendYield:       raw(sd.dividendYield)           ?? raw(sd.trailingAnnualDividendYield),
      // ROIC — Yahoo doesn't have it directly; use Return on Equity as proxy
      roic:                raw(fd.returnOnEquity),
      // Gross Margin (decimal, e.g. 0.43 = 43%) — multiply by 100 on frontend
      grossMargin:         raw(fd.grossMargins),
    };

    return res.status(200).json(out);

  } catch (err) {
    console.error(`Financials error for ${symbol}:`, err.message);
    // Return nulls instead of error — table shows "—" gracefully
    return res.status(200).json({
      pe: null, peg: null, debtToEquity: null, longTermDebtToEquity: null,
      eps: null, dividendYield: null, roic: null, grossMargin: null,
      _error: err.message
    });
  }
}
