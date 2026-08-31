import uuid
from datetime import datetime, date
from typing import Any
from pydantic import BaseModel, EmailStr


# ── Shared config ─────────────────────────────────────────────────────────────

class _Base(BaseModel):
    class Config:
        from_attributes = True


# ── Account ───────────────────────────────────────────────────────────────────

class AccountResponse(_Base):
    account_id:      uuid.UUID
    customer_id:     uuid.UUID
    plan_name:       str | None
    status:          str
    balance:         float
    billing_cycle:   str
    plan_start_date: date | None = None
    plan_end_date:   date | None = None
    auto_renew:      bool        = True
    data_used_gb:    float       = 0.0
    credit_limit:    float       = 0.0
    payment_method:  str         = "UPI"
    custom_fields:   dict        = {}


# ── Customer — list view (compact) ───────────────────────────────────────────

class CustomerResponse(_Base):
    customer_id:        uuid.UUID
    name:               str
    phone:              str | None
    email:              str | None
    account_number:     str | None
    plan:               str | None
    customer_tier:      str       = "standard"
    preferred_channel:  str       = "voice"
    last_contact_at:    datetime | None = None
    created_at:         datetime


# ── Customer — full detail ────────────────────────────────────────────────────

class CustomerDetailResponse(_Base):
    customer_id:        uuid.UUID
    name:               str
    phone:              str | None
    email:              str | None
    account_number:     str | None
    plan:               str | None
    # Extended profile
    date_of_birth:      date | None     = None
    gender:             str | None      = None
    address_line1:      str | None      = None
    address_line2:      str | None      = None
    city:               str | None      = None
    state:              str | None      = None
    pincode:            str | None      = None
    country:            str             = "India"
    customer_tier:      str             = "standard"
    customer_since:     date | None     = None
    preferred_language: str             = "en"
    preferred_channel:  str             = "voice"
    tags:               list            = []
    custom_fields:      dict            = {}
    notes:              str | None      = None
    last_contact_at:    datetime | None = None
    created_at:         datetime
    updated_at:         datetime | None = None
    # Related
    accounts:           list[AccountResponse] = []


# ── Create / Update ───────────────────────────────────────────────────────────

class CustomerCreateRequest(BaseModel):
    name:               str
    phone:              str | None      = None
    email:              str | None      = None
    account_number:     str | None      = None
    plan:               str | None      = None
    date_of_birth:      date | None     = None
    gender:             str | None      = None
    address_line1:      str | None      = None
    address_line2:      str | None      = None
    city:               str | None      = None
    state:              str | None      = None
    pincode:            str | None      = None
    country:            str             = "India"
    customer_tier:      str             = "standard"
    customer_since:     date | None     = None
    preferred_language: str             = "en"
    preferred_channel:  str             = "voice"
    tags:               list            = []
    custom_fields:      dict            = {}
    notes:              str | None      = None


class CustomerUpdateRequest(BaseModel):
    name:               str | None = None
    phone:              str | None = None
    email:              str | None = None
    plan:               str | None = None
    date_of_birth:      date | None = None
    gender:             str | None = None
    address_line1:      str | None = None
    address_line2:      str | None = None
    city:               str | None = None
    state:              str | None = None
    pincode:            str | None = None
    country:            str | None = None
    customer_tier:      str | None = None
    customer_since:     date | None = None
    preferred_language: str | None = None
    preferred_channel:  str | None = None
    tags:               list | None = None
    custom_fields:      dict | None = None
    notes:              str | None = None


# ── Interactions ──────────────────────────────────────────────────────────────

class InteractionResponse(_Base):
    interaction_id:  uuid.UUID
    customer_id:     uuid.UUID
    conversation_id: uuid.UUID | None
    channel:         str
    direction:       str
    duration_sec:    int
    outcome:         str
    sentiment:       str
    resolution:      str
    agent_id:        str | None
    summary:         str | None
    started_at:      datetime
    ended_at:        datetime | None


# ── Notes ────────────────────────────────────────────────────────────────────

class CustomerNoteResponse(_Base):
    note_id:    uuid.UUID
    customer_id:uuid.UUID
    author:     str
    content:    str
    note_type:  str
    created_at: datetime


class CustomerNoteCreate(BaseModel):
    author:    str    = "agent"
    content:   str
    note_type: str    = "general"


# ── Search result (lightweight) ───────────────────────────────────────────────

class CustomerSearchResult(BaseModel):
    customer_id:    uuid.UUID
    name:           str
    phone:          str | None
    email:          str | None
    account_number: str | None
    customer_tier:  str
    last_contact_at:datetime | None

    class Config:
        from_attributes = True
