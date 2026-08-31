import logging
from groq import AsyncGroq
from app.core.config import get_settings

logger = logging.getLogger(__name__)
settings = get_settings()

SYSTEM_PROMPT = (
    "You are a helpful, empathetic AI customer service agent for a telecom company called ConnectPlus. "
    "You handle queries about internet service, mobile plans, billing, and technical support. "
    "Keep responses brief (2-3 sentences), natural, and spoken-word friendly — no markdown, no lists. "
    "If the customer has a problem, acknowledge it warmly before offering help."
)


class BasicResponseGenerator:
    def __init__(self, model: str = "qwen/qwen3.8-27b"):

        self.model = model
        self._client = AsyncGroq(api_key=settings.groq_api_key)

    async def generate(self, transcript: str, conversation_history: list[dict] | None = None) -> str:
        messages: list[dict] = [{"role": "system", "content": SYSTEM_PROMPT}]

        if conversation_history:
            messages.extend(conversation_history[-6:])

        messages.append({"role": "user", "content": transcript})

        try:
            response = await self._client.chat.completions.create(
                model=self.model,
                messages=messages,
                max_tokens=120,
                temperature=0.7,
            )
            return response.choices[0].message.content or "I'm sorry, I didn't quite catch that. Could you repeat?"
        except Exception as exc:
            logger.error("Response generation failed: %s", exc)
            return "Thank you for reaching out. Let me look into that for you right away."
