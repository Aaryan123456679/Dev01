from abc import ABC, abstractmethod
from typing import Any, Dict
import openai
from core.config import settings

class MCPProvider(ABC):
    @abstractmethod
    def execute(self, input_data: Any, context: Dict) -> Any:
        pass

    @abstractmethod
    def get_capabilities(self) -> Dict:
        pass

class OpenAILLMProvider(MCPProvider):
    def __init__(self):
        self.client = openai.OpenAI(api_key=settings.OPENAI_API_KEY)

    def execute(self, input_data: str, context: Dict) -> str:
        # Construct messages from context + input
        messages = [{"role": "system", "content": "You are a helpful assistant."}]
        
        # Add context history if available (simplified)
        if "history" in context:
            for msg in context["history"]:
                messages.append(msg)
                
        messages.append({"role": "user", "content": input_data})
        
        try:
            response = self.client.chat.completions.create(
                model="gpt-3.5-turbo",
                messages=messages
            )
            return response.choices[0].message.content
        except Exception as e:
            print(f"LLM Error (returning mock): {e}")
            return f"Mock LLM Response: I received your input '{input_data}'. (The execution continued despite missing API key)."

    def get_capabilities(self) -> Dict:
        return {"type": "llm", "model": "gpt-3.5-turbo"}
