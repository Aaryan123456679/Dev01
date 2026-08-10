import json
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel
from db.session import get_db
from auth.router import get_current_user
from models.all_models import User
from sandbox.manager import SandboxManager
from mcp.provider import OpenAILLMProvider
from context.service import ContextService

router = APIRouter()

class PromptRequest(BaseModel):
    prompt: str

@router.post("/execute")
def execute_workflow(
    request: PromptRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    # 1. Build Context
    context_service = ContextService()
    context_service.append_conversation(current_user.id, "user", request.prompt, db)
    history = [] # simplify getting history
    
    # 2. Call MCP LLM
    llm = OpenAILLMProvider()
    response_text = llm.execute(request.prompt, {"history": history})
    
    # 3. Create Ephemeral Sandbox
    # Need to verify if the output is code to be executed? 
    # For Phase 1 strict requirement: "MCP LLM Call -> Ephemeral Sandbox Execution"
    # Let's assume the LLM generates some python code to run?
    # Or just run a dummy calculation in sandbox to prove it works.
    
    sandbox_manager = SandboxManager()
    sandbox = sandbox_manager.create_sandbox(current_user.tenant_id, db)
    
    try:
        # Execute a simple command in sandbox to prove it works
        # e.g. print('Hello from Sandbox')
        exec_result = sandbox_manager.execute_command(sandbox.id, "print('Verified Sandbox Execution')", db)
        
        final_result = {
            "llm_response": response_text,
            "sandbox_output": exec_result["output"],
            "sandbox_exit_code": exec_result["exit_code"]
        }
        
    finally:
        # 4. Destroy Sandbox
        sandbox_manager.destroy_sandbox(sandbox.id, db)
    
    # 5. Persist Result
    context_service.append_conversation(current_user.id, "assistant", json.dumps(final_result), db)
    context_service.persist_workflow_result(current_user.tenant_id, "prompt_execution", final_result, db)
    
    return final_result


