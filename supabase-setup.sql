-- ============================================================
--  Follow Stocks — Supabase Schema
--  Corre este SQL no SQL Editor do teu projeto Supabase
-- ============================================================

-- Tabela: assets
-- Todos os ativos que o utilizador acompanha (em carteira ou watchlist)
CREATE TABLE IF NOT EXISTS assets (
  id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  isin        TEXT UNIQUE NOT NULL,
  ticker      TEXT NOT NULL,        -- Yahoo Finance ticker (ex: AAPL, VWCE.DE, BTC-USD)
  name        TEXT NOT NULL,        -- Nome curto (ex: Apple Inc.)
  full_name   TEXT,                 -- Nome completo (opcional)
  sector      TEXT DEFAULT 'Outros',
  asset_type  TEXT DEFAULT 'Stock', -- Stock | ETF | Crypto | Bond | etc.
  currency    TEXT DEFAULT 'EUR',
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- Tabela: holdings
-- Ativos que o utilizador tem em carteira (com nº ações e preço médio)
CREATE TABLE IF NOT EXISTS holdings (
  id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  asset_id    UUID REFERENCES assets(id) ON DELETE CASCADE UNIQUE,
  num_shares  DECIMAL(18,6) NOT NULL DEFAULT 0,
  avg_price   DECIMAL(18,4) NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

-- Tabela: watchlist
-- Ativos que o utilizador quer acompanhar mas não tem em carteira
CREATE TABLE IF NOT EXISTS watchlist (
  id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  asset_id    UUID REFERENCES assets(id) ON DELETE CASCADE UNIQUE,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ── Row Level Security ──────────────────────────────────────
-- Leitura pública (para a página principal funcionar sem auth)
-- Escrita apenas via service_role (admin)

ALTER TABLE assets    ENABLE ROW LEVEL SECURITY;
ALTER TABLE holdings  ENABLE ROW LEVEL SECURITY;
ALTER TABLE watchlist ENABLE ROW LEVEL SECURITY;

-- Permitir SELECT público
CREATE POLICY "public_read_assets"    ON assets    FOR SELECT USING (true);
CREATE POLICY "public_read_holdings"  ON holdings  FOR SELECT USING (true);
CREATE POLICY "public_read_watchlist" ON watchlist FOR SELECT USING (true);

-- INSERT/UPDATE/DELETE apenas com service_role (página de admin usa service_role key)
-- Não é necessário criar policies — o service_role bypassa o RLS por defeito.

-- ── Trigger: auto-update updated_at ────────────────────────
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER holdings_updated_at
  BEFORE UPDATE ON holdings
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ── Dados de exemplo (opcional — apaga se não quiseres) ─────
-- INSERT INTO assets (isin, ticker, name, full_name, sector, asset_type) VALUES
--   ('US0378331005', 'AAPL',    'Apple Inc.',           'Apple Inc.',               'Tecnologia',  'Stock'),
--   ('US67066G1040', 'NVDA',    'NVIDIA Corp.',         'NVIDIA Corporation',        'Tecnologia',  'Stock'),
--   ('US5949181045', 'MSFT',    'Microsoft Corp.',      'Microsoft Corporation',     'Tecnologia',  'Stock'),
--   ('US6541061031', 'NKE',     'Nike Inc.',            'NIKE Inc.',                 'Consumo',     'Stock'),
--   ('US1912161007', 'KO',      'Coca-Cola Co.',        'The Coca-Cola Company',     'Consumo',     'Stock'),
--   ('IE00B3RBWM25', 'VWCE.DE', 'Vanguard FTSE All-World', 'Vanguard FTSE All-World UCITS ETF', 'ETF', 'ETF'),
--   ('US78462F1030', 'SPY',     'SPDR S&P 500 ETF',    'SPDR S&P 500 ETF Trust',   'ETF',         'ETF'),
--   ('BTC',          'BTC-USD', 'Bitcoin',              'Bitcoin',                   'Crypto',      'Crypto');

-- INSERT INTO holdings (asset_id, num_shares, avg_price)
-- SELECT id, 12, 154.74 FROM assets WHERE ticker = 'AAPL';
