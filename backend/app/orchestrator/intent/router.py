from app.orchestrator.intent.extractor import IntentResult


DOMAIN_MAP: dict[str, list[str]] = {
    "technical": [
        "technical_issue", "check_outage", "schedule_engineer",
    ],
    "billing": [
        "billing_inquiry", "billing_dispute", "refund_request", "get_invoice",
    ],
    "sales": [
        "plan_upgrade", "plan_downgrade", "cancellation_request",
    ],
    "account": [
        "account_inquiry", "verify_account",
    ],
    "complaint": [
        "complaint",
    ],
}

_INTENT_TO_DOMAIN: dict[str, str] = {}
for domain, intents in DOMAIN_MAP.items():
    for intent in intents:
        _INTENT_TO_DOMAIN[intent] = domain


class BusinessContextRouter:
    def route(self, intent_result: IntentResult) -> str:
        domain_scores: dict[str, int] = {}
        for intent in intent_result.intents:
            domain = _INTENT_TO_DOMAIN.get(intent)
            if domain:
                domain_scores[domain] = domain_scores.get(domain, 0) + 1

        if not domain_scores:
            return "general"

        return max(domain_scores, key=lambda d: domain_scores[d])
