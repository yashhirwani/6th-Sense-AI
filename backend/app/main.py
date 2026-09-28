import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from . import __version__
from .api import router
from .config import get_settings
from .db import SessionLocal, init_db
from .models import Place
from .services.llm import get_router
from .services.navigation import DEMO_PLACE

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
log = logging.getLogger("sixthsense")


def _seed() -> None:
    with SessionLocal() as db:
        if db.get(Place, DEMO_PLACE["id"]) is None:
            db.add(Place(**DEMO_PLACE))
            db.commit()


@asynccontextmanager
async def lifespan(_: FastAPI):
    s = get_settings()
    init_db()
    _seed()
    r = get_router()
    await r.refresh()
    engine = r.pick()
    log.info("6th Sense AI backend %s - reasoning engine: %s", __version__, engine.name if engine else "none (rules only)")
    if s.warm_models_on_startup:
        # Load the CPU detectors in the background so the first user request isn't slow.
        import asyncio

        from PIL import Image

        from .services import vision

        blank = Image.new("RGB", (320, 320), "gray")

        def _warm() -> None:
            vision.detect_open_vocab(blank, list(vision.HAZARD_VOCAB)[:3])
            vision.people_cues(blank)
            vision.run_ocr(blank)
            log.info("perception models warmed up")

        asyncio.get_running_loop().run_in_executor(None, _warm)
    if not s.jwt_secret:
        log.warning("JWT_SECRET is not set: device tokens will be invalid after a restart. Set it in backend/.env.")
    yield


app = FastAPI(title="6th Sense AI", version=__version__, lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=[o.strip() for o in get_settings().cors_origins.split(",")],
    allow_methods=["*"],
    allow_headers=["*"],
)
app.include_router(router)
