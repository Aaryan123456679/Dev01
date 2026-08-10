from sqlalchemy import Column, String, ForeignKey, JSON, Integer, DateTime
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from db.session import Base
from models.base import BaseIDMixin, TimestampMixin

class Tenant(Base, BaseIDMixin, TimestampMixin):
    __tablename__ = "tenants"
    name = Column(String, unique=True, index=True)
    plan_type = Column(String, default="standard")
    
    users = relationship("User", back_populates="tenant")
    workflows = relationship("WorkflowState", back_populates="tenant")
    sandboxes = relationship("SandboxInstance", back_populates="tenant")

class User(Base, BaseIDMixin, TimestampMixin):
    __tablename__ = "users"
    email = Column(String, unique=True, index=True)
    password_hash = Column(String)
    role = Column(String, default="standard")
    tenant_id = Column(UUID(as_uuid=True), ForeignKey("tenants.id"))
    
    tenant = relationship("Tenant", back_populates="users")
    sessions = relationship("Session", back_populates="user")
    conversations = relationship("Conversation", back_populates="user")
    
class Session(Base, BaseIDMixin, TimestampMixin):
    __tablename__ = "sessions"
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id"))
    token = Column(String, unique=True, index=True) # Could be just a hash or rely on JWT statelessness. Using for invalidation/tracking.
    expires_at = Column(DateTime(timezone=True))
    
    user = relationship("User", back_populates="sessions")

class Conversation(Base, BaseIDMixin, TimestampMixin):
    __tablename__ = "conversations"
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id"))
    messages = Column(JSON, default=list) # List of chat messages
    
    user = relationship("User", back_populates="conversations")

class WorkflowState(Base, BaseIDMixin, TimestampMixin):
    __tablename__ = "workflow_state"
    tenant_id = Column(UUID(as_uuid=True), ForeignKey("tenants.id"))
    name = Column(String)
    status = Column(String)
    context_snapshot = Column(JSON) # Snapshot before execution
    result = Column(JSON) # Execution result
    
    tenant = relationship("Tenant", back_populates="workflows")

class Artifact(Base, BaseIDMixin, TimestampMixin):
    __tablename__ = "artifacts"
    tenant_id = Column(UUID(as_uuid=True), ForeignKey("tenants.id"))
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id"))
    storage_path = Column(String)
    artifact_type = Column(String)
    
class SandboxInstance(Base, BaseIDMixin, TimestampMixin):
    __tablename__ = "sandbox_instances"
    tenant_id = Column(UUID(as_uuid=True), ForeignKey("tenants.id"))
    type = Column(String)
    state = Column(String)
    container_id = Column(String)
    expires_at = Column(DateTime(timezone=True))
    
    tenant = relationship("Tenant", back_populates="sandboxes")
