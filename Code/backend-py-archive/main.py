from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from core.config import settings
from db.session import engine
from models.all_models import Base
from auth import router as auth_router
from api import execute as execute_router

# Create tables (Auto-migration for POC simplicity)
Base.metadata.create_all(bind=engine)

app = FastAPI(title=settings.PROJECT_NAME)

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], # In production specify domains
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth_router.router, prefix="/auth", tags=["auth"])
app.include_router(execute_router.router, prefix="/api", tags=["execution"])

@app.get("/")
def read_root():
    return {"message": "Welcome to Dev01 Platform"}
