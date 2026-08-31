import uuid
from datetime import datetime, timedelta

_TICKETS: dict[str, dict] = {}


class TicketingService:
    async def create_ticket(
        self,
        customer_id: str,
        issue_type: str,
        description: str = "",
        priority: str = "medium",
    ) -> dict:
        ticket_id = f"TKT-{str(uuid.uuid4())[:8].upper()}"
        ticket = {
            "ticket_id": ticket_id,
            "customer_id": customer_id,
            "issue_type": issue_type,
            "description": description,
            "priority": priority,
            "status": "open",
            "created_at": datetime.utcnow().isoformat(),
            "sla_deadline": (datetime.utcnow() + timedelta(hours=24 if priority == "high" else 48)).isoformat(),
        }
        _TICKETS[ticket_id] = ticket
        return {"success": True, "ticket": ticket}

    async def update_ticket(
        self,
        ticket_id: str,
        status: str | None = None,
        notes: str | None = None,
    ) -> dict:
        ticket = _TICKETS.get(ticket_id)
        if not ticket:
            return {"success": False, "error": f"Ticket {ticket_id} not found"}
        if status:
            ticket["status"] = status
        if notes:
            ticket.setdefault("notes", []).append({"note": notes, "at": datetime.utcnow().isoformat()})
        return {"success": True, "ticket": ticket}

    async def get_ticket(self, ticket_id: str) -> dict:
        ticket = _TICKETS.get(ticket_id)
        if ticket:
            return {"found": True, "ticket": ticket}
        return {"found": False, "error": f"Ticket {ticket_id} not found"}

    async def list_tickets(self, customer_id: str) -> dict:
        tickets = [t for t in _TICKETS.values() if t["customer_id"] == customer_id]
        return {"count": len(tickets), "tickets": tickets}
