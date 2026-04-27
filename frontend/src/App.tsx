import { useState } from 'react'
import './App.css'

type AnalyzeResponse = {
  success: boolean
  data?: unknown
  raw_analysis?: string
  error?: string
}

type UnderwritingData = {
  property?: {
    address?: string
    source_url?: string | null
    list_price?: number
    sqft?: number
    beds?: number
    baths?: number
    year_built?: number
    property_type?: string
    taxes_annual?: number
    hoa_annual?: number
    days_on_market?: number
    condition?: string
  }
  valuation?: {
    arv?: number
    estimated_rent_monthly?: number
    rent_to_price_ratio?: number
    value_vs_market?: string
    price_per_sqft_subject?: number
    avg_comp_price_per_sqft?: number
  }
  financials?: {
    annual_cash_flow?: number
    cap_rate?: number
    cash_on_cash_return?: number
    gross_rent_multiplier?: number
    one_percent_rule_passes?: boolean
    monthly_mortgage?: number
    down_payment?: number
    loan_amount?: number
  }
  risk_flags?: string[]
  opportunity_flags?: string[]
  verdict?: {
    decision?: string
    confidence?: string
    score?: number
    summary?: string
    recommended_offer?: number
    key_reasons?: string[]
  }
}

function asNumber(v: unknown): number | undefined {
  return typeof v === 'number' && Number.isFinite(v) ? v : undefined
}

function asString(v: unknown): string | undefined {
  return typeof v === 'string' ? v : undefined
}

function formatMoney(n?: number) {
  if (typeof n !== 'number') return '—'
  return n.toLocaleString(undefined, { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })
}

function formatPercent(n?: number) {
  if (typeof n !== 'number') return '—'
  return `${n.toFixed(1)}%`
}

function formatNumber(n?: number) {
  if (typeof n !== 'number') return '—'
  return n.toLocaleString()
}

function App() {
  const [input, setInput] = useState('')
  const [market, setMarket] = useState('Tulsa, OK')
  const [investmentBudget, setInvestmentBudget] = useState<string>('')

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<AnalyzeResponse | null>(null)

  const apiBase = (import.meta.env.VITE_API_BASE as string | undefined)?.replace(/\/$/, '')
  const analyzeUrl = apiBase ? `${apiBase}/analyze` : '/analyze'

  async function onAnalyze(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setResult(null)

    if (!input.trim()) {
      setError('Enter an address or listing URL.')
      return
    }

    const budgetNumber = investmentBudget.trim() ? Number(investmentBudget) : undefined
    if (investmentBudget.trim() && Number.isNaN(budgetNumber)) {
      setError('Investment budget must be a number.')
      return
    }

    setLoading(true)
    try {
      const res = await fetch(analyzeUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          input,
          market,
          investment_budget: budgetNumber,
        }),
      })

      const body = (await res.json()) as AnalyzeResponse
      if (!res.ok) {
        throw new Error((body as any)?.detail || body.error || `Request failed (${res.status})`)
      }

      setResult(body)
      if (!body.success) {
        setError(body.error || 'Analysis failed.')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unexpected error')
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      <header className="top">
        <div className="top-inner">
          <div>
            <div className="kicker">Property Acquisition Agent</div>
            <h1>
              <span className="title-line">First-pass underwriting</span>
              <span className="title-line accent">in seconds</span>
            </h1>
            <p className="sub">
              Paste a Zillow/Redfin URL or a raw address. Get a quick, plain-English snapshot of deal quality and
              key numbers.
            </p>
          </div>
        </div>
      </header>

      <main className="content">
        <form className="card" onSubmit={onAnalyze}>
          <div className="grid">
            <label className="field span-2">
              <div className="label">Address or listing URL</div>
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                rows={4}
                placeholder="e.g. 1234 S Peoria Ave, Tulsa, OK 74105 or https://www.zillow.com/..."
              />
            </label>

            <label className="field">
              <div className="label">Target market</div>
              <input value={market} onChange={(e) => setMarket(e.target.value)} placeholder="Tulsa, OK" />
            </label>

            <label className="field">
              <div className="label">Investment budget (optional)</div>
              <input
                value={investmentBudget}
                onChange={(e) => setInvestmentBudget(e.target.value)}
                inputMode="decimal"
                placeholder="250000"
              />
            </label>
          </div>

          <div className="actions">
            <button className="primary" type="submit" disabled={loading}>
              {loading ? 'Analyzing…' : 'Analyze'}
            </button>
            <button
              className="secondary"
              type="button"
              disabled={loading}
              onClick={() => {
                setInput('')
                setResult(null)
                setError(null)
              }}
            >
              Clear
            </button>
          </div>

          {error ? <div className="alert">{error}</div> : null}
        </form>

        <section className="card">
          <div className="card-head">
            <h2>Result</h2>
          </div>

          {!result ? (
            <div className="placeholder">Run an analysis to see structured output here.</div>
          ) : (
            (() => {
              const d = (result.data || {}) as UnderwritingData
              const decision = d.verdict?.decision || '—'
              const confidence = d.verdict?.confidence || '—'
              const score = asNumber(d.verdict?.score)
              const summary = d.verdict?.summary || ''

              const address = d.property?.address || ''
              const listPrice = asNumber(d.property?.list_price)
              const arv = asNumber(d.valuation?.arv)
              const recommendedOffer = asNumber(d.verdict?.recommended_offer)

              const rent = asNumber(d.valuation?.estimated_rent_monthly)
              const capRate = asNumber(d.financials?.cap_rate)
              const coc = asNumber(d.financials?.cash_on_cash_return)
              const cashFlow = asNumber(d.financials?.annual_cash_flow)
              const grm = asNumber(d.financials?.gross_rent_multiplier)
              const onePercent = d.financials?.one_percent_rule_passes

              const mortgage = asNumber(d.financials?.monthly_mortgage)
              const dom = asNumber(d.property?.days_on_market)

              return (
                <div className="result">
                  <div className="result-top">
                    <div className="headline">
                      <div className="address">{address || 'Property analysis'}</div>
                      <div className="badges">
                        <span className={`badge badge-${String(decision).toLowerCase()}`}>{decision}</span>
                        <span className="badge badge-neutral">Confidence: {confidence}</span>
                        <span className="badge badge-neutral">Score: {typeof score === 'number' ? score : '—'}</span>
                      </div>
                    </div>
                    {summary ? <div className="summary">{summary}</div> : null}
                  </div>

                  <div className="kpi-grid">
                    <div className="kpi">
                      <div className="kpi-label">List price</div>
                      <div className="kpi-value">{formatMoney(listPrice)}</div>
                      <div className="kpi-sub">DOM: {formatNumber(dom)}</div>
                    </div>
                    <div className="kpi">
                      <div className="kpi-label">ARV (estimated)</div>
                      <div className="kpi-value">{formatMoney(arv)}</div>
                      <div className="kpi-sub">Offer: {formatMoney(recommendedOffer)}</div>
                    </div>
                    <div className="kpi">
                      <div className="kpi-label">Rent (est.)</div>
                      <div className="kpi-value">{rent ? `${formatMoney(rent)}/mo` : '—'}</div>
                      <div className="kpi-sub">Mortgage: {mortgage ? `${formatMoney(mortgage)}/mo` : '—'}</div>
                    </div>
                    <div className="kpi">
                      <div className="kpi-label">Cap rate</div>
                      <div className="kpi-value">{formatPercent(capRate)}</div>
                      <div className="kpi-sub">CoC: {formatPercent(coc)}</div>
                    </div>
                    <div className="kpi">
                      <div className="kpi-label">Cash flow</div>
                      <div className="kpi-value">{cashFlow ? `${formatMoney(cashFlow)}/yr` : '—'}</div>
                      <div className="kpi-sub">GRM: {typeof grm === 'number' ? grm.toFixed(1) : '—'}</div>
                    </div>
                    <div className="kpi">
                      <div className="kpi-label">1% rule</div>
                      <div className="kpi-value">{onePercent === true ? 'Pass' : onePercent === false ? 'Fail' : '—'}</div>
                      <div className="kpi-sub">Market: {asString(d.valuation?.value_vs_market) || '—'}</div>
                    </div>
                  </div>

                  {(d.risk_flags?.length || d.opportunity_flags?.length) ? (
                    <div className="flags">
                      {d.opportunity_flags?.length ? (
                        <div className="flag-block">
                          <div className="flag-title">Opportunities</div>
                          <ul className="flag-list">
                            {d.opportunity_flags.slice(0, 6).map((f, i) => (
                              <li key={`opp-${i}`}>{f}</li>
                            ))}
                          </ul>
                        </div>
                      ) : null}
                      {d.risk_flags?.length ? (
                        <div className="flag-block">
                          <div className="flag-title">Risks</div>
                          <ul className="flag-list">
                            {d.risk_flags.slice(0, 6).map((f, i) => (
                              <li key={`risk-${i}`}>{f}</li>
                            ))}
                          </ul>
                        </div>
                      ) : null}
                    </div>
                  ) : null}

                  <div className="details">
                    <button
                      className="secondary"
                      type="button"
                      disabled={!result?.data}
                      onClick={async () => {
                        if (!result?.data) return
                        await navigator.clipboard.writeText(JSON.stringify(result.data, null, 2))
                      }}
                    >
                      Copy JSON
                    </button>
                  </div>

                  <details className="disclosure">
                    <summary>Details JSON</summary>
                    <pre className="pre">{JSON.stringify(result.data ?? null, null, 2)}</pre>
                  </details>

                  <details className="disclosure">
                    <summary>Raw model output</summary>
                    <pre className="pre">{result.raw_analysis || ''}</pre>
                  </details>
                </div>
              )
            })()
          )}
        </section>
      </main>
    </>
  )
}

export default App
