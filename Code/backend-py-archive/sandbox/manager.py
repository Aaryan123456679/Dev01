import docker
from sqlalchemy.orm import Session
from models.all_models import SandboxInstance
import uuid
from datetime import datetime, timezone

class SandboxManager:
    def __init__(self):
        self.client = docker.from_env()

    def create_sandbox(self, tenant_id: str, db: Session):
        # Create a container that stays alive but does nothing initially
        container = self.client.containers.run(
            "python:3.12-slim",
            command="tail -f /dev/null",
            detach=True,
            mem_limit="128m",
            nano_cpus=500000000, # 0.5 CPU
            network_mode="none", # Isolation
            # pids_limit=10,
            security_opt=["no-new-privileges"],
            # read_only=True, # Maybe too strict for now if we need to write tmp files
        )
        
        sandbox = SandboxInstance(
            tenant_id=tenant_id,
            type="ephemeral",
            state="running",
            container_id=container.id,
            expires_at=datetime.now(timezone.utc)
        )
        db.add(sandbox)
        db.commit()
        db.refresh(sandbox)
        return sandbox

    def execute_command(self, sandbox_id: str, command: str, db: Session):
        sandbox = db.query(SandboxInstance).filter(SandboxInstance.id == sandbox_id).first()
        if not sandbox:
            raise ValueError("Sandbox not found")
            
        container = self.client.containers.get(sandbox.container_id)
        
        # Simple exec
        # We assume command is a python script or similar
        # For POC, let's just run python -c "..."
        exec_cmd = f"python -c '{command}'"
        
        exit_code, output = container.exec_run(exec_cmd)
        
        return {
            "exit_code": exit_code,
            "output": output.decode("utf-8")
        }

    def destroy_sandbox(self, sandbox_id: str, db: Session):
        sandbox = db.query(SandboxInstance).filter(SandboxInstance.id == sandbox_id).first()
        if sandbox:
            try:
                container = self.client.containers.get(sandbox.container_id)
                container.kill()
                container.remove()
            except Exception as e:
                print(f"Error destroying sandbox: {e}")
            
            sandbox.state = "terminated"
            db.commit()
