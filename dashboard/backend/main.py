from fastapi import FastAPI
import logging

from app.core.config import setup_cors
from app.core.database import get_db_manager
from app.routers import stats, chat, admin_words, admin_currency, admin_settings, wordcloud, playback, exclusion_wordlist, playback_wordcloud, text_mining, replacement_wordlist, emojis

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(title="Hermes Dashboard API")

setup_cors(app)

db_manager = get_db_manager()

@app.on_event("startup")
async def startup_event():
    try:
        db_manager.create_tables()
        logger.info("✓ Database tables created/verified successfully")
    except Exception as e:
        logger.error(f"Error creating tables on startup: {e}")
        raise

@app.get("/health")
def health_check():
    return {"status": "ok"}

app.include_router(stats.router)
app.include_router(chat.router)
app.include_router(admin_words.router)
app.include_router(admin_currency.router)
app.include_router(admin_settings.router)
app.include_router(wordcloud.router)
app.include_router(playback.router)
app.include_router(exclusion_wordlist.router)
app.include_router(playback_wordcloud.router)
app.include_router(text_mining.router)
app.include_router(replacement_wordlist.router)
app.include_router(emojis.router)
