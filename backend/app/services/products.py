"""Product facts from the Open Food Facts public database (barcode lookup)."""
from __future__ import annotations

import logging
from typing import Any

import httpx

from ..config import get_settings

log = logging.getLogger(__name__)

FIELDS = "product_name,brands,quantity,ingredients_text,allergens_tags,nutriments,labels,categories"


async def lookup_barcode(code: str) -> dict[str, Any] | None:
    code = "".join(ch for ch in code if ch.isdigit())
    if not 8 <= len(code) <= 14:
        return None
    s = get_settings()
    try:
        async with httpx.AsyncClient(timeout=6.0, headers={"User-Agent": s.http_user_agent}) as c:
            r = await c.get(f"{s.open_food_facts_url}/{code}.json", params={"fields": FIELDS})
    except httpx.HTTPError as e:
        log.info("product lookup failed: %s", e)
        return None
    if r.status_code != 200:
        return None
    data = r.json()
    if data.get("status") != 1:
        return None
    p = data.get("product", {})
    n = p.get("nutriments", {})
    return {
        "barcode": code,
        "name": p.get("product_name") or None,
        "brand": p.get("brands") or None,
        "quantity": p.get("quantity") or None,
        "ingredients": p.get("ingredients_text") or None,
        "allergens": [a.split(":", 1)[-1].replace("-", " ") for a in p.get("allergens_tags", [])],
        "nutrition": {
            "energy_kcal_100g": n.get("energy-kcal_100g"),
            "protein_100g": n.get("proteins_100g"),
            "sugars_100g": n.get("sugars_100g"),
            "fat_100g": n.get("fat_100g"),
            "salt_100g": n.get("salt_100g"),
        },
        "source": "Open Food Facts",
    }
