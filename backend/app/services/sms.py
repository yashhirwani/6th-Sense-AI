"""Automatic emergency SMS through Twilio's REST API (optional - only when configured in .env)."""
from __future__ import annotations

import logging

import httpx

from ..config import get_settings

log = logging.getLogger(__name__)


async def send_sms(to: str, body: str) -> bool:
    s = get_settings()
    if not s.sms_enabled:
        return False
    url = f"https://api.twilio.com/2010-04-01/Accounts/{s.twilio_account_sid}/Messages.json"
    try:
        async with httpx.AsyncClient(timeout=10.0, auth=(s.twilio_account_sid, s.twilio_auth_token)) as c:
            r = await c.post(url, data={"To": to, "From": s.twilio_from_number, "Body": body})
    except httpx.HTTPError as e:
        log.warning("SMS to %s failed: %s", to[-4:], e)
        return False
    if r.status_code >= 300:
        log.warning("SMS to ...%s rejected: %s", to[-4:], r.text[:200])
        return False
    return True
