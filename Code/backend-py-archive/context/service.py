from sqlalchemy.orm import Session
from models.all_models import Conversation, WorkflowState
import json

class ContextService:
    def build_snapshot(self, user_id: str, db: Session):
        # build from recent conversation
        # Simplified: fetch last conversation
        # In real world, complex logic
        return {"user_id": str(user_id)}

    def append_conversation(self, user_id: str, role: str, content: str, db: Session):
        # Find active conversation or create new
        # Simplified: one conversation per user for POC
        conversation = db.query(Conversation).filter(Conversation.user_id == user_id).first()
        if not conversation:
            conversation = Conversation(user_id=user_id, messages=[])
            db.add(conversation)
            
        messages = conversation.messages if conversation.messages else []
        messages.append({"role": role, "content": content})
        conversation.messages = messages
        
        # Force update for JSON/SQLAlchemy detection
        from sqlalchemy.orm.attributes import flag_modified
        flag_modified(conversation, "messages")
        
        db.commit()
        return messages

    def persist_workflow_result(self, tenant_id: str, name: str, result: dict, db: Session):
        workflow = WorkflowState(
            tenant_id=tenant_id,
            name=name,
            status="completed",
            result=result
        )
        db.add(workflow)
        db.commit()
