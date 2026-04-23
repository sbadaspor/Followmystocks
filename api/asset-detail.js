// api/asset-detail.js — Dados fundamentais detalhados via Yahoo Finance
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'public, max-age=1800');

  const { symbol } = req.query;
  if (!symbol) return res.status(400).json({ error: 'symbol required' });

  const h = {
    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept': 'application/json',
    'Referer': 'https://finance.yahoo.com',
  };

  try {
    const modules = [
      'summaryProfile', 'summaryDetail', 'defaultKeyStatistics',
      'financialData', 'incomeStatementHistory', 'balanceSheetHistory',
      'cashflowStatementHistory', 'earnings'
    ].join(',');

    // Fetch summary + chart (for dividends) in parallel
    const [summaryRes, chartRes] = await Promise.all([
      fetch(`https://query1.finance.yahoo.com/v11/finance/quoteSummary/${encodeURIComponent(symbol)}?modules=${modules}`, { headers: h }),
      fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=10y&interval=3mo&events=div`, { headers: h }),
    ]);

    if (!summaryRes.ok) throw new Error(`Summary HTTP ${summaryRes.status}`);

    const [summaryData, chartData] = await Promise.all([summaryRes.json(), chartRes.json()]);

    const r = summaryData.quoteSummary?.result?.[0];
    if (!r) throw new Error('No data returned for ' + symbol);

    // Helper: extract raw number from Yahoo Finance {raw, fmt} objects
    const raw = (obj) => {
      if (obj == null) return null;
      if (typeof obj === 'number') return obj;
      if (typeof obj.raw === 'number') return obj.raw;
      return null;
    };

    // Currency conversion to EUR
    const currency = r.summaryDetail?.currency || 'USD';
    let fxRate = 1;
    if (currency === 'USD' || currency === 'GBp') {
      try {
        const fxSym = currency === 'GBp' ? 'EURGBP=X' : 'EURUSD=X';
        const fxRes = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${fxSym}?range=1d&interval=1d`, { headers: h });
        const fxData = await fxRes.json();
        const fxClose = fxData.chart?.result?.[0]?.indicators?.quote?.[0]?.close;
        if (fxClose?.length) {
          const rate = fxClose[fxClose.length - 1];
          fxRate = currency === 'GBp' ? (rate / 100) : (1 / rate); // EUR per unit
        }
      } catch {}
    }

    const profile = r.summaryProfile || {};
    const sd      = r.summaryDetail  || {};
    const dks     = r.defaultKeyStatistics || {};
    const fd      = r.financialData  || {};

    // ── Annual statements (up to 4 years from Yahoo Finance) ────────────
    const incStmts = r.incomeStatementHistory?.incomeStatementHistory || [];
    const bsStmts  = r.balanceSheetHistory?.balanceSheetStatements   || [];
    const cfStmts  = r.cashflowStatementHistory?.cashflowStatements  || [];

    // EPS history from earnings chart
    const earningsYearly = r.earnings?.financialsChart?.yearly || [];
    const epsMap = {};
    earningsYearly.forEach(e => { epsMap[e.date] = raw(e.earnings); });

    const annual = incStmts.map((s, i) => {
      const bs = bsStmts[i]  || {};
      const cf = cfStmts[i]  || {};

      const year    = s.endDate?.raw ? new Date(s.endDate.raw * 1000).getFullYear() : null;
      const revenue = raw(s.totalRevenue);
      const gross   = raw(s.grossProfit);
      const opInc   = raw(s.operatingIncome) || raw(s.totalOperatingExpenses);
      const netInc  = raw(s.netIncome) ?? raw(s.netIncomeApplicableToCommonShares);
      const ebitda  = raw(s.ebitda);

      const equity   = raw(bs.totalStockholderEquity);
      const curAsset = raw(bs.totalCurrentAssets);
      const curLiab  = raw(bs.totalCurrentLiabilities);
      const ltDebt   = raw(bs.longTermDebt) ?? 0;
      const totalLiab= raw(bs.totalLiab);
      const recv     = raw(bs.netReceivables);

      const opCF  = raw(cf.totalCashFromOperatingActivities);
      const capex = Math.abs(raw(cf.capitalExpenditures) ?? 0);
      const fcf   = opCF != null ? opCF - capex : raw(cf.freeCashFlow);

      // Derived ratios
      const grossMargin = revenue && gross   ? gross   / revenue : null;
      const opMargin    = revenue && opInc   ? opInc   / revenue : null;
      const netMargin   = revenue && netInc  ? netInc  / revenue : null;
      const curRatio    = curLiab  ? (curAsset ?? 0) / curLiab  : null;
      const totalCap    = equity != null ? equity + ltDebt : null;
      const ltDC        = totalCap ? ltDebt / totalCap   : null;
      const debtEq      = equity   ? (totalLiab ?? 0) / equity  : null;
      const daysSales   = revenue && recv ? (recv / revenue) * 365 : null;
      // ROIC ≈ NOPAT / Invested Capital (NOPAT ≈ opInc * 0.79)
      const roic = opInc && equity ? (opInc * 0.79) / (equity + ltDebt) : null;

      return {
        year,
        eps:         (epsMap[year] ?? null) != null ? (epsMap[year] * fxRate) : null,
        revenue:     revenue  != null ? revenue  * fxRate : null,
        grossProfit: gross    != null ? gross    * fxRate : null,
        opIncome:    opInc    != null ? opInc    * fxRate : null,
        netIncome:   netInc   != null ? netInc   * fxRate : null,
        ebitda:      ebitda   != null ? ebitda   * fxRate : null,
        fcf:         fcf      != null ? fcf      * fxRate : null,
        grossMargin, opMargin, netMargin,
        currentRatio: curRatio,
        ltDebtCapital: ltDC,
        debtEquity:   debtEq,
        daysSales,
        roic,
      };
    });

    // ── Current metrics ──────────────────────────────────────────────────
    const netDebt   = (raw(fd.totalDebt) ?? 0) - (raw(fd.totalCash) ?? 0);
    const ebitdaCur = raw(fd.ebitda);

    const metrics = {
      pe:                  raw(sd.trailingPE) ?? raw(dks.trailingPE),
      eps:                 raw(dks.trailingEps) != null ? raw(dks.trailingEps) * fxRate : null,
      netDebtEbitda:       ebitdaCur ? (netDebt * fxRate) / (ebitdaCur * fxRate) : null,
      marketCap:           raw(sd.marketCap) != null ? raw(sd.marketCap) * fxRate : null,
      beta:                raw(dks.beta),
      dividendYield:       raw(sd.dividendYield) ?? raw(sd.trailingAnnualDividendYield),
      roic:                raw(fd.returnOnEquity),   // ROE as ROIC proxy
      currentRatio:        raw(fd.currentRatio),
      freeCashflow:        raw(fd.freeCashflow) != null ? raw(fd.freeCashflow) * fxRate : null,
      ebitda:              ebitdaCur != null ? ebitdaCur * fxRate : null,
      debtToEquity:        raw(fd.debtToEquity),
      grossMargin:         raw(fd.grossMargins),
      opMargin:            raw(fd.operatingMargins),
      netMargin:           raw(fd.profitMargins),
      daysSalesReceivables: annual[0]?.daysSales ?? null,
    };

    // Net Debt / EBITDA
    metrics.netDebtEbitda = (ebitdaCur && ebitdaCur !== 0)
      ? netDebt / ebitdaCur
      : null;

    // ── Fiscal year end ──────────────────────────────────────────────────
    let fiscalYearEnd = null;
    if (incStmts[0]?.endDate?.fmt) {
      const d = new Date(incStmts[0].endDate.raw * 1000);
      fiscalYearEnd = d.toLocaleDateString('pt-PT', { day: 'numeric', month: 'short' });
    }

    // ── Dividend history ─────────────────────────────────────────────────
    const divEvents = chartData.chart?.result?.[0]?.events?.dividends || {};
    const divByYear = {};
    Object.values(divEvents).forEach(d => {
      const yr = new Date(d.date * 1000).getFullYear();
      divByYear[yr] = (divByYear[yr] || 0) + (d.amount * fxRate);
    });
    const dividends = Object.entries(divByYear)
      .map(([y, amount]) => ({ year: +y, amount }))
      .sort((a, b) => a.year - b.year);

    return res.status(200).json({
      currency,
      fxRate,
      info: {
        sector:       profile.sector        || null,
        industry:     profile.industry      || null,
        country:      profile.country       || null,
        fiscalYearEnd,
        website:      profile.website       || null,
        description:  profile.longBusinessSummary || null,
      },
      metrics,
      annual,
      dividends,
    });

  } catch (err) {
    console.error(`asset-detail error [${symbol}]:`, err.message);
    return res.status(500).json({ error: err.message });
  }
}
