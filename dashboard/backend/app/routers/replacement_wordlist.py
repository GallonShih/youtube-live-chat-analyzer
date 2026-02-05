"""Router for replacement wordlist CRUD operations.

Allows users to save, load, update, and delete named replacement word lists
for post-tokenization word replacement in word cloud feature.
"""
from fastapi import APIRouter, HTTPException, Depends
from sqlalchemy.orm import Session
from sqlalchemy.exc import IntegrityError
from typing import List, Optional
from pydantic import BaseModel, Field
import logging

from app.core.database import get_db
from app.core.dependencies import require_admin
from app.models import ReplacementWordlist

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/replacement-wordlists", tags=["replacement-wordlists"])


class ReplacementItem(BaseModel):
    """Schema for a single replacement pair."""
    source: str = Field(..., min_length=1, description="Source word to replace")
    target: str = Field(..., min_length=1, description="Target word to replace with")


class WordlistCreate(BaseModel):
    """Schema for creating a new replacement wordlist."""
    name: str = Field(..., min_length=1, max_length=100)
    replacements: List[ReplacementItem] = Field(default_factory=list)


class WordlistUpdate(BaseModel):
    """Schema for updating an existing replacement wordlist."""
    name: Optional[str] = Field(None, min_length=1, max_length=100)
    replacements: Optional[List[ReplacementItem]] = None


class WordlistResponse(BaseModel):
    """Schema for replacement wordlist response."""
    id: int
    name: str
    replacements: List[ReplacementItem]
    created_at: str
    updated_at: str

    class Config:
        from_attributes = True


@router.get("", response_model=List[WordlistResponse])
def list_wordlists(db: Session = Depends(get_db)):
    """List all saved replacement wordlists."""
    try:
        wordlists = db.query(ReplacementWordlist).order_by(ReplacementWordlist.name).all()
        return [
            WordlistResponse(
                id=wl.id,
                name=wl.name,
                replacements=[
                    ReplacementItem(source=r.get("source", ""), target=r.get("target", ""))
                    for r in (wl.replacements or [])
                ],
                created_at=wl.created_at.isoformat() if wl.created_at else "",
                updated_at=wl.updated_at.isoformat() if wl.updated_at else ""
            )
            for wl in wordlists
        ]
    except Exception as e:
        logger.error(f"Error listing replacement wordlists: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/{wordlist_id}", response_model=WordlistResponse)
def get_wordlist(wordlist_id: int, db: Session = Depends(get_db)):
    """Get a specific replacement wordlist by ID."""
    wordlist = db.query(ReplacementWordlist).filter(ReplacementWordlist.id == wordlist_id).first()
    if not wordlist:
        raise HTTPException(status_code=404, detail="Wordlist not found")
    
    return WordlistResponse(
        id=wordlist.id,
        name=wordlist.name,
        replacements=[
            ReplacementItem(source=r.get("source", ""), target=r.get("target", ""))
            for r in (wordlist.replacements or [])
        ],
        created_at=wordlist.created_at.isoformat() if wordlist.created_at else "",
        updated_at=wordlist.updated_at.isoformat() if wordlist.updated_at else ""
    )


@router.post("", response_model=WordlistResponse, status_code=201, dependencies=[Depends(require_admin)])
def create_wordlist(data: WordlistCreate, db: Session = Depends(get_db)):
    """Create a new replacement wordlist."""
    try:
        # Check for duplicate name
        existing = db.query(ReplacementWordlist).filter(ReplacementWordlist.name == data.name).first()
        if existing:
            raise HTTPException(status_code=400, detail="Wordlist name already exists")
        
        # Convert Pydantic models to dicts for JSON storage
        replacements_json = [{"source": r.source, "target": r.target} for r in data.replacements]
        
        wordlist = ReplacementWordlist(
            name=data.name.strip(),
            replacements=replacements_json
        )
        db.add(wordlist)
        db.flush()
        
        return WordlistResponse(
            id=wordlist.id,
            name=wordlist.name,
            replacements=[
                ReplacementItem(source=r.get("source", ""), target=r.get("target", ""))
                for r in (wordlist.replacements or [])
            ],
            created_at=wordlist.created_at.isoformat() if wordlist.created_at else "",
            updated_at=wordlist.updated_at.isoformat() if wordlist.updated_at else ""
        )
    except HTTPException:
        raise
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=400, detail="Wordlist name already exists")
    except Exception as e:
        logger.error(f"Error creating replacement wordlist: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.put("/{wordlist_id}", response_model=WordlistResponse, dependencies=[Depends(require_admin)])
def update_wordlist(wordlist_id: int, data: WordlistUpdate, db: Session = Depends(get_db)):
    """Update an existing replacement wordlist."""
    try:
        wordlist = db.query(ReplacementWordlist).filter(ReplacementWordlist.id == wordlist_id).first()
        if not wordlist:
            raise HTTPException(status_code=404, detail="Wordlist not found")
        
        # Check for duplicate name if name is being changed
        if data.name is not None and data.name.strip() != wordlist.name:
            existing = db.query(ReplacementWordlist).filter(
                ReplacementWordlist.name == data.name.strip(),
                ReplacementWordlist.id != wordlist_id
            ).first()
            if existing:
                raise HTTPException(status_code=400, detail="Wordlist name already exists")
            wordlist.name = data.name.strip()
        
        if data.replacements is not None:
            wordlist.replacements = [{"source": r.source, "target": r.target} for r in data.replacements]
        
        db.flush()
        
        return WordlistResponse(
            id=wordlist.id,
            name=wordlist.name,
            replacements=[
                ReplacementItem(source=r.get("source", ""), target=r.get("target", ""))
                for r in (wordlist.replacements or [])
            ],
            created_at=wordlist.created_at.isoformat() if wordlist.created_at else "",
            updated_at=wordlist.updated_at.isoformat() if wordlist.updated_at else ""
        )
    except HTTPException:
        raise
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=400, detail="Wordlist name already exists")
    except Exception as e:
        logger.error(f"Error updating replacement wordlist: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/{wordlist_id}", dependencies=[Depends(require_admin)])
def delete_wordlist(wordlist_id: int, db: Session = Depends(get_db)):
    """Delete a replacement wordlist."""
    try:
        wordlist = db.query(ReplacementWordlist).filter(ReplacementWordlist.id == wordlist_id).first()
        if not wordlist:
            raise HTTPException(status_code=404, detail="Wordlist not found")
        
        db.delete(wordlist)
        db.flush()
        
        return {"message": "Wordlist deleted successfully", "id": wordlist_id}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error deleting replacement wordlist: {e}")
        raise HTTPException(status_code=500, detail=str(e))
