from fastapi import APIRouter, HTTPException, Depends, Body
from sqlalchemy.orm import Session
from sqlalchemy import func, text
import logging

from app.core.database import get_db
from app.core.dependencies import require_admin
from app.models import CurrencyRate, ChatMessage

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/admin", tags=["admin-currency"])

@router.get("/currency-rates")
def get_currency_rates(db: Session = Depends(get_db)):
    try:
        rates = db.query(CurrencyRate).order_by(CurrencyRate.currency).all()
        
        return {
            "rates": [
                {
                    "currency": rate.currency,
                    "rate_to_twd": float(rate.rate_to_twd) if rate.rate_to_twd else 0.0,
                    "updated_at": rate.updated_at.isoformat() if rate.updated_at else None,
                    "notes": rate.notes
                }
                for rate in rates
            ]
        }
    except Exception as e:
        logger.error(f"Error fetching currency rates: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/currency-rates", dependencies=[Depends(require_admin)])
def upsert_currency_rate(
    currency: str = Body(...),
    rate_to_twd: float = Body(...),
    notes: str = Body(''),
    db: Session = Depends(get_db)
):
    try:
        if not currency or len(currency) > 10:
            raise HTTPException(status_code=400, detail="Invalid currency code")
        
        if rate_to_twd < 0:
            raise HTTPException(status_code=400, detail="Exchange rate must be non-negative")
        
        currency = currency.upper().strip()
        
        existing = db.query(CurrencyRate).filter(
            CurrencyRate.currency == currency
        ).first()
        
        if existing:
            existing.rate_to_twd = rate_to_twd
            existing.notes = notes
            existing.updated_at = func.now()
            message = f"Currency rate for {currency} updated successfully"
        else:
            new_rate = CurrencyRate(
                currency=currency,
                rate_to_twd=rate_to_twd,
                notes=notes
            )
            db.add(new_rate)
            message = f"Currency rate for {currency} added successfully"
        
        db.commit()
        
        return {
            "success": True,
            "message": message,
            "currency": currency,
            "rate_to_twd": rate_to_twd
        }
        
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        logger.error(f"Error upserting currency rate: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/currency-rates/unknown")
def get_unknown_currencies(db: Session = Depends(get_db)):
    try:
        # Raw SQL kept for JSONB operators (->>, ->).
        # SQLAlchemy ORM's JSONB support generates less readable code for
        # nested path traversal (raw_data->'money'->>'currency') and the
        # DISTINCT + GROUP BY combination on extracted JSONB fields.
        result = db.execute(text("""
            SELECT DISTINCT raw_data->'money'->>'currency' as currency,
                   COUNT(*) as message_count
            FROM chat_messages
            WHERE raw_data->'money' IS NOT NULL
              AND raw_data->'money'->>'currency' IS NOT NULL
            GROUP BY currency
            ORDER BY message_count DESC
        """))
        
        all_currencies = [(row[0], row[1]) for row in result if row[0]]
        
        existing_rates = db.query(CurrencyRate.currency).all()
        existing_currency_set = {rate[0] for rate in existing_rates}
        
        unknown = [
            {
                "currency": curr,
                "message_count": count
            }
            for curr, count in all_currencies
            if curr not in existing_currency_set
        ]
        
        return {
            "unknown_currencies": unknown,
            "total": len(unknown)
        }
        
    except Exception as e:
        logger.error(f"Error fetching unknown currencies: {e}")
        raise HTTPException(status_code=500, detail=str(e))
