import json
import logging
import re
from dataclasses import dataclass, field
from groq import AsyncGroq
from app.core.config import get_settings

logger = logging.getLogger(__name__)
settings = get_settings()

EXTRACTION_PROMPT = """You are an intent and entity extraction engine for an insurance customer service system (InsureAI).

Given a customer utterance, extract:
- intents: list of detected intents (use snake_case). Choose from:
  claim_inquiry, claim_filing, claim_status, billing_inquiry, billing_dispute, refund_request,
  policy_renewal, policy_upgrade, policy_cancellation, coverage_inquiry, account_inquiry,
  surveyor_request, complaint, general_inquiry, verify_account, payment_inquiry
- entities: dict of key entities (policy_number, claim_id, coverage_type, account_number, amount, invoice_id, date, plan_name, issue_type)
- sentiment: one of positive | neutral | frustrated | angry
- urgency: one of low | medium | high
- confidence: float 0.0-1.0

Respond ONLY with valid JSON. No prose, no markdown.
Example: {"intents": ["billing_dispute", "refund_request"], "entities": {"amount": "5000", "invoice_id": "INV-2024-001", "coverage_type": "health"}, "sentiment": "frustrated", "urgency": "high", "confidence": 0.92}"""


def _extract_json(text: str) -> dict:
    text = text.strip()
    match = re.search(r'```(?:json)?\s*({.*?})\s*```', text, re.DOTALL)
    if match:
        text = match.group(1)
    else:
        start = text.find('{')
        end = text.rfind('}')
        if start != -1 and end != -1:
            text = text[start:end + 1]
    try:
        return json.loads(text)
    except Exception:
        # Fallback simple regex extraction for intents, sentiment, urgency
        intents = re.findall(r'"intents"\s*:\s*\[(.*?)\]', text)
        intent_list = []
        if intents:
            intent_list = [i.strip(' "\'') for i in intents[0].split(',') if i.strip(' "\'')]
        sentiment_m = re.search(r'"sentiment"\s*:\s*"(\w+)"', text)
        urgency_m = re.search(r'"urgency"\s*:\s*"(\w+)"', text)
        confidence_m = re.search(r'"confidence"\s*:\s*([\d\.]+)', text)
        return {
            "intents": intent_list or ["general_inquiry"],
            "entities": {},
            "sentiment": sentiment_m.group(1) if sentiment_m else "neutral",
            "urgency": urgency_m.group(1) if urgency_m else "medium",
            "confidence": float(confidence_m.group(1)) if confidence_m else 0.8,
        }


@dataclass
class IntentResult:
    intents: list[str] = field(default_factory=list)
    entities: dict = field(default_factory=dict)
    sentiment: str = "neutral"
    urgency: str = "medium"
    confidence: float = 0.8


class IntentExtractor:
    def __init__(self):
        self._client = AsyncGroq(api_key=settings.groq_api_key)

    async def extract(self, transcript: str, conversation_history: list[dict] | None = None) -> IntentResult:
        messages = [{"role": "system", "content": EXTRACTION_PROMPT}]

        if conversation_history:
            for turn in conversation_history[-4:]:
                messages.append(turn)

        messages.append({"role": "user", "content": f"Customer utterance: {transcript}"})

        try:
            response = await self._client.chat.completions.create(
                model="qwen/qwen3.8-27b",
                messages=messages,
                max_tokens=200,
                temperature=0.0,
            )


            raw = response.choices[0].message.content or "{}"
            data = _extract_json(raw)
            return IntentResult(
                intents=data.get("intents", ["general_inquiry"]),
                entities=data.get("entities", {}),
                sentiment=data.get("sentiment", "neutral"),
                urgency=data.get("urgency", "medium"),
                confidence=float(data.get("confidence", 0.8)),
            )
        except Exception as exc:
            logger.error("Intent extraction error: %s", exc)
            return IntentResult(intents=["general_inquiry"])
