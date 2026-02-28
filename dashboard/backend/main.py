import os
from contextlib import asynccontextmanager

from fastapi import FastAPI
import logging

from app.core.config import setup_cors
from app.core.database import get_db_manager
from app.routers import (
    stats, chat, admin_words, admin_currency, admin_settings,
    wordcloud, playback, exclusion_wordlist, playback_wordcloud,
    text_mining, replacement_wordlist, emojis, word_trends, word_detail,
    etl_jobs, prompt_templates, auth, stream_info, incense_map
)
from app.etl import init_scheduler, shutdown_scheduler, ETLConfig
from app.etl.scheduler import register_jobs, start_scheduler


logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# 是否啟用 ETL Scheduler（可透過環境變數控制）
ENABLE_ETL_SCHEDULER = os.getenv('ENABLE_ETL_SCHEDULER', 'true').lower() == 'true'


@asynccontextmanager
async def lifespan(app: FastAPI):
    """
    Application lifespan handler
    處理啟動和關閉事件
    """
    # Startup
    db_manager = get_db_manager()
    try:
        db_manager.create_tables()
        logger.info("✓ Database tables created/verified successfully")
    except Exception as e:
        logger.error(f"Error creating tables on startup: {e}")
        raise

    # 初始化 ETL Scheduler
    if ENABLE_ETL_SCHEDULER:
        try:
            database_url = os.getenv('DATABASE_URL')
            if database_url:
                # 初始化 ETL 設定引擎
                ETLConfig.init_engine(database_url)

                # 初始化排程器
                init_scheduler(database_url)

                # 註冊排程任務
                register_jobs()

                # 啟動排程器
                start_scheduler()

                logger.info("✓ ETL Scheduler initialized and started")
            else:
                logger.warning("DATABASE_URL not set, ETL Scheduler disabled")
        except Exception as e:
            logger.error(f"Error initializing ETL Scheduler: {e}")
            # 不拋出異常，讓 API 服務繼續運行

    yield

    # Shutdown
    if ENABLE_ETL_SCHEDULER:
        try:
            shutdown_scheduler(wait=False)
            logger.info("✓ ETL Scheduler shutdown completed")
        except Exception as e:
            logger.error(f"Error shutting down ETL Scheduler: {e}")


app = FastAPI(
    title="YouTube Live Chat Analyzer API",
    lifespan=lifespan
)

setup_cors(app)


@app.get("/health")
def health_check():
    return {"status": "ok"}


# 註冊路由
app.include_router(auth.router)
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
app.include_router(word_trends.router)
app.include_router(word_detail.router)
app.include_router(etl_jobs.router)
app.include_router(prompt_templates.router)
app.include_router(stream_info.router)
app.include_router(incense_map.router)
