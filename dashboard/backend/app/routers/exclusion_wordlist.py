"""Router for exclusion wordlist CRUD operations.

Allows users to save, load, update, and delete named exclusion word lists
for the word cloud feature.
"""
from fastapi import APIRouter, HTTPException, Depends, Body
from sqlalchemy.orm import Session
from sqlalchemy.exc import IntegrityError
from typing import List
from pydantic import BaseModel, Field
import logging

from app.core.database import get_db
from app.core.dependencies import require_admin
from app.models import ExclusionWordlist

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/exclusion-wordlists", tags=["exclusion-wordlists"])


class WordlistCreate(BaseModel):
    """Schema for creating a new wordlist."""
    name: str = Field(..., min_length=1, max_length=100)
    words: List[str] = Field(..., min_items=0)


class WordlistUpdate(BaseModel):
    """Schema for updating an existing wordlist."""
    name: str = Field(None, min_length=1, max_length=100)
    words: List[str] = Field(None, min_items=0)


class WordlistResponse(BaseModel):
    """Schema for wordlist response."""
    id: int
    name: str
    words: List[str]
    created_at: str
    updated_at: str

    class Config:
        from_attributes = True


@router.get("", response_model=List[WordlistResponse])
def list_wordlists(db: Session = Depends(get_db)):
    """List all saved exclusion wordlists."""
    try:
        wordlists = db.query(ExclusionWordlist).order_by(ExclusionWordlist.name).all()
        return [
            WordlistResponse(
                id=wl.id,
                name=wl.name,
                words=wl.words or [],
                created_at=wl.created_at.isoformat() if wl.created_at else "",
                updated_at=wl.updated_at.isoformat() if wl.updated_at else ""
            )
            for wl in wordlists
        ]
    except Exception as e:
        logger.error(f"Error listing wordlists: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/{wordlist_id}", response_model=WordlistResponse)
def get_wordlist(wordlist_id: int, db: Session = Depends(get_db)):
    """Get a specific wordlist by ID."""
    wordlist = db.query(ExclusionWordlist).filter(ExclusionWordlist.id == wordlist_id).first()
    if not wordlist:
        raise HTTPException(status_code=404, detail="Wordlist not found")
    
    return WordlistResponse(
        id=wordlist.id,
        name=wordlist.name,
        words=wordlist.words or [],
        created_at=wordlist.created_at.isoformat() if wordlist.created_at else "",
        updated_at=wordlist.updated_at.isoformat() if wordlist.updated_at else ""
    )


@router.post("", response_model=WordlistResponse, status_code=201, dependencies=[Depends(require_admin)])
def create_wordlist(data: WordlistCreate, db: Session = Depends(get_db)):
    """Create a new exclusion wordlist."""
    try:
        # Check for duplicate name
        existing = db.query(ExclusionWordlist).filter(ExclusionWordlist.name == data.name).first()
        if existing:
            raise HTTPException(status_code=400, detail="Wordlist name already exists")
        
        wordlist = ExclusionWordlist(
            name=data.name.strip(),
            words=data.words
        )
        db.add(wordlist)
        db.flush()
        
        return WordlistResponse(
            id=wordlist.id,
            name=wordlist.name,
            words=wordlist.words or [],
            created_at=wordlist.created_at.isoformat() if wordlist.created_at else "",
            updated_at=wordlist.updated_at.isoformat() if wordlist.updated_at else ""
        )
    except HTTPException:
        raise
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=400, detail="Wordlist name already exists")
    except Exception as e:
        logger.error(f"Error creating wordlist: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.put("/{wordlist_id}", response_model=WordlistResponse, dependencies=[Depends(require_admin)])
def update_wordlist(wordlist_id: int, data: WordlistUpdate, db: Session = Depends(get_db)):
    """Update an existing wordlist."""
    try:
        wordlist = db.query(ExclusionWordlist).filter(ExclusionWordlist.id == wordlist_id).first()
        if not wordlist:
            raise HTTPException(status_code=404, detail="Wordlist not found")
        
        # Check for duplicate name if name is being changed
        if data.name is not None and data.name.strip() != wordlist.name:
            existing = db.query(ExclusionWordlist).filter(
                ExclusionWordlist.name == data.name.strip(),
                ExclusionWordlist.id != wordlist_id
            ).first()
            if existing:
                raise HTTPException(status_code=400, detail="Wordlist name already exists")
            wordlist.name = data.name.strip()
        
        if data.words is not None:
            wordlist.words = data.words
        
        db.flush()
        
        return WordlistResponse(
            id=wordlist.id,
            name=wordlist.name,
            words=wordlist.words or [],
            created_at=wordlist.created_at.isoformat() if wordlist.created_at else "",
            updated_at=wordlist.updated_at.isoformat() if wordlist.updated_at else ""
        )
    except HTTPException:
        raise
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=400, detail="Wordlist name already exists")
    except Exception as e:
        logger.error(f"Error updating wordlist: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/{wordlist_id}", dependencies=[Depends(require_admin)])
def delete_wordlist(wordlist_id: int, db: Session = Depends(get_db)):
    """Delete a wordlist."""
    try:
        wordlist = db.query(ExclusionWordlist).filter(ExclusionWordlist.id == wordlist_id).first()
        if not wordlist:
            raise HTTPException(status_code=404, detail="Wordlist not found")
        
        db.delete(wordlist)
        db.flush()
        
        return {"message": "Wordlist deleted successfully", "id": wordlist_id}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error deleting wordlist: {e}")
        raise HTTPException(status_code=500, detail=str(e))
