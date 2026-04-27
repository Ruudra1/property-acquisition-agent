"""
Property Acquisition Agent - FastAPI Backend
=============================================
Vercel Serverless Function Entry Point
"""

import os
import json
import re
from urllib.parse import urlparse
from typing import Optional
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from groq import Groq
from dotenv import load_dotenv

load_dotenv()

app = FastAPI(title="Property Acquisition Agent API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

MODEL_NAME = os.getenv("GROQ_MODEL", "llama-3.3-70b-versatile")
client = Groq(api_key=os.getenv("GROQ_API_KEY"))

def infer_market_from_input(user_input: str) -> Optional[str]:
    if not user_input:
        return None

    text = user_input.strip()
    if not re.match(r"^https?://", text, flags=re.IGNORECASE):
        return None

    try:
        path = urlparse(text).path.lower()
    except Exception:
        return None

    # Common Zillow/Redfin pattern: /apartments/atlanta-ga/... or /homes/atlanta-ga/...
    m = re.search(r"/(?:apartments|homes|homedetails|b)/([a-z\-]+)-([a-z]{2})(?:/|$)", path)
    if not m:
        m = re.search(r"/([a-z\-]+)-([a-z]{2})(?:/|$)", path)
    if not m:
        return None

    city_slug, state = m.group(1), m.group(2)
    city = " ".join([w.capitalize() for w in city_slug.split("-") if w])
    state = state.upper()
    if not city or len(state) != 2:
        return None

    return f"{city}, {state}"


SYSTEM_PROMPT = """You are an expert real estate underwriter and acquisition analyst. You perform rigorous first-pass property analysis.

When given a property address or URL, you will:

1. EXTRACT property details (use realistic estimates if scraping isn't available):
   - Address, price, sqft, bedrooms/bathrooms, year built, property taxes, HOA fees
   - Property type (SFR, duplex, multifamily, commercial)
   - Days on market, list price history

2. FIND COMPARABLE SALES (comps):
   - Identify 3-5 recent sales (last 6-12 months) within 0.5-1 mile radius
   - Match on: property type, sqft (±20%), bedrooms, condition
   - Calculate Price Per Sqft for each comp
   - Derive adjusted ARV (After Repair Value)

3. CALCULATE FINANCIAL METRICS using Tulsa/Midwest market assumptions:
   - Vacancy Rate: 8% (Tulsa avg)
   - Property Management: 8-10% of gross rents
   - Maintenance/CapEx: 10% of gross rents
   - Insurance: $1,200-1,800/year typical
   - Gross Rent Multiplier benchmark: 10-12x for Tulsa
   - Cap Rate target: 6-10% (8%+ preferred)
   - Cash-on-Cash target: 8%+ (assuming 25% down, 7.5% interest rate, 30yr)
   - 1% Rule: Monthly rent should be ≥ 1% of purchase price

4. OUTPUT a structured JSON analysis with this exact schema:
{
  "property": {
    "address": "string",
    "source_url": "string or null",
    "list_price": number,
    "sqft": number,
    "beds": number,
    "baths": number,
    "year_built": number,
    "property_type": "SFR|Duplex|Triplex|Quad|Multifamily|Commercial",
    "taxes_annual": number,
    "hoa_annual": number,
    "days_on_market": number,
    "condition": "Excellent|Good|Fair|Poor|Unknown"
  },
  "comps": [
    {
      "address": "string",
      "sale_price": number,
      "sqft": number,
      "price_per_sqft": number,
      "sold_date": "string",
      "distance_miles": number
    }
  ],
  "valuation": {
    "arv": number,
    "price_per_sqft_subject": number,
    "avg_comp_price_per_sqft": number,
    "value_vs_market": "Below|At|Above",
    "estimated_rent_monthly": number,
    "rent_to_price_ratio": number
  },
  "financials": {
    "down_payment": number,
    "loan_amount": number,
    "monthly_mortgage": number,
    "gross_annual_rent": number,
    "vacancy_loss": number,
    "net_operating_income": number,
    "annual_operating_expenses": number,
    "annual_cash_flow": number,
    "cap_rate": number,
    "cash_on_cash_return": number,
    "gross_rent_multiplier": number,
    "one_percent_rule_passes": boolean
  },
  "risk_flags": ["string"],
  "opportunity_flags": ["string"],
  "verdict": {
    "decision": "PASS|REVIEW|FAST-TRACK",
    "confidence": "Low|Medium|High",
    "score": number,
    "summary": "string",
    "recommended_offer": number,
    "key_reasons": ["string"]
  }
}

Be realistic and conservative with estimates. Use actual Tulsa, OK market data where possible.
Always respond with ONLY valid JSON, no markdown, no preamble."""


class AnalyzeRequest(BaseModel):
    input: str  # Zillow/Redfin URL or raw address
    market: Optional[str] = "Tulsa, OK"
    investment_budget: Optional[float] = None


class AnalyzeResponse(BaseModel):
    success: bool
    data: Optional[dict] = None
    raw_analysis: Optional[str] = None
    error: Optional[str] = None


@app.post("/analyze", response_model=AnalyzeResponse)
async def analyze_property(request: AnalyzeRequest):
    try:
        inferred_market = infer_market_from_input(request.input)
        effective_market = request.market

        # If the user left the default market but pasted a URL that clearly points elsewhere,
        # auto-switch to that market.
        if (effective_market is None or effective_market.strip() == "" or effective_market.strip() == "Tulsa, OK") and inferred_market:
            effective_market = inferred_market

        user_prompt = f"""Analyze this property for acquisition:

Input: {request.input}
Target Market: {effective_market}
{f'Investment Budget: ${request.investment_budget:,.0f}' if request.investment_budget else ''}

Perform a complete first-pass underwriting analysis. If this is a URL, extract the address and simulate pulling the listing data. 
Use realistic market data and comparables for the Target Market above. Do not use Tulsa/Midwest assumptions unless the Target Market is actually in that area.

Return ONLY the JSON object."""

        try:
            completion = client.chat.completions.create(
                model=MODEL_NAME,
                messages=[
                    {"role": "system", "content": SYSTEM_PROMPT},
                    {"role": "user", "content": user_prompt},
                ],
                max_tokens=4096,
                temperature=0.2,
            )
        except Exception as e:
            raise HTTPException(status_code=502, detail=f"Groq API error: {str(e)}")

        raw_text = (completion.choices[0].message.content or "").strip()

        # Strip any accidental markdown fences
        raw_text = re.sub(r"^```(?:json)?\s*", "", raw_text, flags=re.IGNORECASE)
        raw_text = re.sub(r"\s*```\s*$", "", raw_text)

        # If the model returned extra text, extract the JSON object
        start = raw_text.find("{")
        end = raw_text.rfind("}")
        if start != -1 and end != -1 and end > start:
            raw_text = raw_text[start : end + 1].strip()

        parsed = json.loads(raw_text)

        return AnalyzeResponse(success=True, data=parsed, raw_analysis=raw_text)

    except json.JSONDecodeError as e:
        return AnalyzeResponse(
            success=False,
            raw_analysis=raw_text if "raw_text" in locals() else None,
            error=f"Failed to parse AI response as JSON: {str(e)}",
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/health")
async def health():
    return {"status": "ok", "model": MODEL_NAME, "market": "Tulsa/Midwest"}


@app.get("/")
async def root():
    return {
        "name": "Property Acquisition Agent API",
        "version": "1.0.0",
        "endpoints": {
            "POST /analyze": "Analyze a property for acquisition",
            "GET /health": "Health check",
        },
    }
