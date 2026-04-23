# 📈 Follow Stocks

Dashboard para acompanhar a tua carteira de investimentos com preços em tempo real.

---

## Stack
- **Frontend**: HTML/CSS/JS puro (sem framework)
- **Backend**: Vercel Serverless Functions (proxy Yahoo Finance)
- **Base de dados**: Supabase (PostgreSQL)
- **Deploy**: Vercel + GitHub

---

## Setup (15 min)

### Parte 1 — Supabase

1. Vai ao teu projeto em [supabase.com](https://supabase.com)
2. Menu lateral → **SQL Editor**
3. Copia e cola o conteúdo de `supabase-setup.sql` e clica **Run**
4. Vai a **Settings → API** e copia:
   - `Project URL` → vai ser o `SUPABASE_URL`
   - `anon public` key → vai ser o `SUPABASE_ANON_KEY`
   - `service_role` key → vai ser usada na página de Admin (guarda em segurança!)

---

### Parte 2 — Configurar o index.html

Abre `index.html` e substitui no topo do script:

```js
const SUPABASE_URL      = 'https://xxxx.supabase.co';   // ← o teu URL
const SUPABASE_ANON_KEY = 'eyJhbGci...';                // ← a tua anon key
```

---

### Parte 3 — GitHub

1. Faz push de todos os ficheiros para o teu repositório GitHub
2. Estrutura esperada:
   ```
   /
   ├── index.html
   ├── vercel.json
   ├── api/
   │   ├── quote.js
   │   └── chart.js
   └── supabase-setup.sql  (só para referência, não é servido)
   ```

---

### Parte 4 — Vercel

1. Vai a [vercel.com](https://vercel.com) → **New Project**
2. Importa o teu repositório GitHub
3. Clica **Deploy** (sem configurações extra)
4. Acede ao URL gerado — deverás ver o dashboard com dados de demo

---

## Como adicionar ativos (Admin)

*(A página de Admin será criada na próxima fase)*

Por agora, podes adicionar diretamente no Supabase:

1. **SQL Editor** no Supabase:

```sql
-- 1. Adicionar o ativo
INSERT INTO assets (isin, ticker, name, sector, asset_type)
VALUES ('US0378331005', 'AAPL', 'Apple Inc.', 'Tecnologia', 'Stock');

-- 2. Adicionar à carteira (num_shares = nº de ações, avg_price = preço médio de compra)
INSERT INTO holdings (asset_id, num_shares, avg_price)
SELECT id, 12, 154.74 FROM assets WHERE ticker = 'AAPL';
```

### Tickers do Yahoo Finance

| Tipo   | Exemplos                                |
|--------|-----------------------------------------|
| Stocks | `AAPL`, `MSFT`, `NVDA`, `NKE`, `KO`    |
| ETFs   | `SPY`, `VWCE.DE`, `IWDA.AS`             |
| Crypto | `BTC-USD`, `ETH-USD`                    |
| PT     | `EDP.LS`, `GALP.LS`, `SNC.LS`          |

> Confirma o ticker correto em [finance.yahoo.com](https://finance.yahoo.com) antes de inserir.

---

## Auto-refresh

Os preços atualizam automaticamente a cada **30 segundos**.
O sparkline (gráfico mini) usa dados dos últimos **30 dias**.

---

## Próximas páginas

- [ ] `admin.html` — Gestão de ativos (ISIN, nº ações, preço médio)
- [ ] `asset.html` — Detalhe de um ativo
- [ ] Página **Explorar** — Lista de todos os ativos com filtros
