from pydantic_settings import BaseSettings
from typing import Optional

class Settings(BaseSettings):
    PROJECT_NAME: str = "Project DEV01"
    API_V1_STR: str = "/api/v1"
    
    # DATABASE
    POSTGRES_USER: str
    POSTGRES_PASSWORD: str
    POSTGRES_SERVER: str
    POSTGRES_DB: str
    DATABASE_URL: Optional[str] = None

    # REDIS
    REDIS_HOST: str = "redis"
    REDIS_PORT: int = 6379

    # SECURITY
    SECRET_KEY: str
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 30
    
    # OPENAI / LLM
    OPENAI_API_KEY: Optional[str] = None
    
    class Config:
        env_file = ".env"

    def assemble_db_url(self):
        if self.DATABASE_URL:
            return self.DATABASE_URL
        return f"postgresql://{self.POSTGRES_USER}:{self.POSTGRES_PASSWORD}@{self.POSTGRES_SERVER}/{self.POSTGRES_DB}"

settings = Settings()
