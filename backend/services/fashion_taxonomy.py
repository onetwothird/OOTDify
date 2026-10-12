"""Normalize raw third-party fashion metadata into OOTDify's catalog schema.

The shared catalog (`public.clothing`) speaks one small vocabulary:

  categories  Tops · Bottoms · Shoes · Outerwear · Dresses · Bags · Accessories · Other
  occasions   Casual · School · Office · Interview · Date · Formal · Party · Travel · Gym · Beach
  gender      men · women · unisex

Public fashion datasets (e.g. the Fashion Product Images dataset) use their own
taxonomy (`masterCategory` / `subCategory` / `articleType` / `usage`). This module
is the single translation layer between the two, so the ingestion script stays a
thin downloader and every mapping rule is unit-testable in isolation.

Pure Python, no third-party imports: runnable from tests without pandas.
"""
from __future__ import annotations

import re
from typing import Any, Dict, Iterable, List, Optional, Sequence

# ---------------------------------------------------------------------------
# Category vocabulary
# ---------------------------------------------------------------------------
CATEGORIES = (
    "Tops",
    "Bottoms",
    "Shoes",
    "Outerwear",
    "Dresses",
    "Bags",
    "Accessories",
    "Other",
)

# Fine-grained subCategory → OOTDify category. Checked before masterCategory so
# e.g. an Apparel/Topwear blazer does not get silently treated as a plain tee.
_SUBCATEGORY_CATEGORY = {
    "topwear": "Tops",
    "bottomwear": "Bottoms",
    "dress": "Dresses",
    "saree": "Dresses",
    "apparel set": "Dresses",
    "suit": "Dresses",
    "outerwear": "Outerwear",
    "innerwear": "Other",
    "loungewear and nightwear": "Other",
    "sleepwear": "Other",
    "nightwear": "Other",
    "socks": "Accessories",
    "ties and cuffs": "Accessories",
    "wrist accessories": "Accessories",
    "eyewear": "Accessories",
    "headwear": "Accessories",
    "jewellery": "Accessories",
    "belts": "Accessories",
    "scarves": "Accessories",
    "stoles": "Accessories",
    "gloves": "Accessories",
    "ties": "Accessories",
    "mufflers": "Accessories",
    "umbrellas": "Accessories",
    "wallets": "Bags",
    "bags": "Bags",
    "backpacks": "Bags",
    "clutches": "Bags",
    "laptop bag": "Bags",
    "duffel bag": "Bags",
    "messenger bag": "Bags",
}

_MASTERCATEGORY_CATEGORY = {
    "footwear": "Shoes",
    "accessories": "Accessories",
    "personal care": "Accessories",
    "free items": "Accessories",
    "sports equipment": "Accessories",
    "apparel": "Tops",  # last-resort Apparel fallback
}

# Any of these substrings in subCategory/articleType means it's a bag.
_BAG_HINTS = ("bag", "backpack", "wallet", "clutch", "duffel", "tote", "rucksack")

# Any of these means outerwear regardless of the dataset's own labelling.
_OUTER_HINTS = ("jacket", "coat", "blazer", "trench", "parka", "windcheater", "rain")

# Any of these means footwear.
_SHOE_HINTS = (
    "shoe", "sandal", "sneaker", "heel", "flip flop", "flip-flop",
    "boot", "flat", "loafer", "moccasin",
)

# ---------------------------------------------------------------------------
# Subcategory (display label) normalization
# ---------------------------------------------------------------------------
_SUBCATEGORY_ALIASES = {
    "tshirts": "T-Shirts",
    "t-shirt": "T-Shirts",
    "t shirts": "T-Shirts",
    "tee": "T-Shirts",
    "tees": "T-Shirts",
    "shirts": "Shirts",
    "tops": "Tops",
    "sweatshirts": "Sweatshirts",
    "sweaters": "Sweaters",
    "kurtas": "Kurtas",
    "kurtis": "Kurtis",
    "jeans": "Jeans",
    "trousers": "Trousers",
    "shorts": "Shorts",
    "skirts": "Skirts",
    "track pants": "Track Pants",
    "leggings": "Leggings",
    "jeggings": "Leggings",
    "dresses": "Dresses",
    "casual shoes": "Casual Shoes",
    "sports shoes": "Sneakers",
    "sneakers": "Sneakers",
    "formal shoes": "Formal Shoes",
    "sandals": "Sandals",
    "flip flops": "Flip Flops",
    "flats": "Flats",
    "heels": "Heels",
    "jackets": "Jackets",
    "rain jacket": "Jackets",
    "coats": "Coats",
    "sweatshirt": "Sweatshirts",
    "sweater": "Sweaters",
}

# ---------------------------------------------------------------------------
# Occasion vocabulary
# ---------------------------------------------------------------------------
_OCCASION_BY_USAGE = {
    "casual": ["Casual", "School", "Travel"],
    "ethnic": ["Party", "Formal"],
    "formal": ["Formal", "Office", "Interview"],
    "sports": ["Gym", "Travel"],
    "smart casual": ["Office", "Date", "Casual"],
    "travel": ["Travel", "Casual"],
    "party": ["Party", "Date", "Formal"],
    "home": ["Casual"],
}

# ---------------------------------------------------------------------------
# Gender / sizes / colors
# ---------------------------------------------------------------------------
_GENDER_BY_RAW = {
    "men": "men",
    "man": "men",
    "male": "men",
    "boys": "men",
    "boy": "men",
    "women": "women",
    "woman": "women",
    "female": "women",
    "girls": "women",
    "girl": "women",
    "unisex": "unisex",
}

# Sensible defaults when the dataset carries no sizes (Fashion Product Images
# does not). Keeps the catalog honest: a range the shopper could plausibly pick.
_DEFAULT_SIZES = {
    "Tops": ["XS", "S", "M", "L", "XL"],
    "Dresses": ["XS", "S", "M", "L", "XL"],
    "Outerwear": ["XS", "S", "M", "L", "XL"],
    "Bottoms": ["28", "30", "32", "34", "36"],
    "Shoes": ["6", "7", "8", "9", "10", "11"],
    "Bags": ["One Size"],
    "Accessories": ["One Size"],
    "Other": ["One Size"],
}

_NA_VALUES = {"", "na", "n/a", "nan", "none", "null", "-", "--"}


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
def _clean(value: Any) -> str:
    if value is None:
        return ""
    text = str(value).strip()
    if text.lower() in _NA_VALUES:
        return ""
    return text


def _norm(value: Any) -> str:
    return _clean(value).lower()


def _contains_any(haystack: str, needles: Iterable[str]) -> bool:
    return any(n in haystack for n in needles)


def normalize_category(
    master_category: Any = None,
    sub_category: Any = None,
    article_type: Any = None,
) -> str:
    """Map a dataset row's taxonomy onto one OOTDify catalog category."""
    master = _norm(master_category)
    sub = _norm(sub_category)
    article = _norm(article_type)
    haystack = f"{sub} {article}"

    if _contains_any(haystack, _BAG_HINTS):
        return "Bags"
    if _contains_any(haystack, _OUTER_HINTS) and master in ("apparel", ""):
        return "Outerwear"

    if sub in _SUBCATEGORY_CATEGORY:
        return _SUBCATEGORY_CATEGORY[sub]
    if article in _SUBCATEGORY_CATEGORY:
        return _SUBCATEGORY_CATEGORY[article]
    if master in _MASTERCATEGORY_CATEGORY:
        return _MASTERCATEGORY_CATEGORY[master]

    # Footwear master/subcategory always resolves to Shoes.
    if master in ("footwear", "") and sub == "footwear":
        return "Shoes"
    if _contains_any(haystack, _SHOE_HINTS) and master in ("footwear", ""):
        return "Shoes"
    return "Other"


def _title_case(value: str) -> str:
    return re.sub(r"\s+", " ", value).strip().title()


def normalize_subcategory(article_type: Any = None, sub_category: Any = None) -> Optional[str]:
    """Human display label (e.g. 'T-Shirts', 'Shorts', 'Sneakers')."""
    article = _clean(article_type) or _clean(sub_category)
    if not article:
        return None
    alias = _SUBCATEGORY_ALIASES.get(article.lower())
    if alias:
        return alias
    return _title_case(article)


def normalize_gender(raw: Any) -> str:
    return _GENDER_BY_RAW.get(_norm(raw), "unisex")


def normalize_colors(raw: Any) -> List[str]:
    """Accept a string or an iterable; return lower-cased, de-duped colors."""
    if raw is None:
        return []
    if isinstance(raw, str):
        parts: Sequence[str] = re.split(r"[,/|]", raw)
    elif isinstance(raw, (list, tuple, set)):
        parts = [str(p) for p in raw]
    else:
        parts = [str(raw)]
    out: List[str] = []
    for part in parts:
        cleaned = _norm(part)
        if cleaned and cleaned not in out:
            out.append(cleaned)
    return out


def normalize_sizes(raw: Any, category: str) -> List[str]:
    """Use dataset sizes when present, otherwise a category default."""
    if raw is not None:
        if isinstance(raw, str):
            parts = re.split(r"[,/|]", raw)
        elif isinstance(raw, (list, tuple, set)):
            parts = [str(p) for p in raw]
        else:
            parts = [str(raw)]
        cleaned = [c.strip().upper() for c in parts if _clean(c)]
        if cleaned:
            return cleaned
    return list(_DEFAULT_SIZES.get(category, ["One Size"]))


def normalize_occasions(raw: Any) -> List[str]:
    """Map a dataset `usage` value (or list of them) onto occasions."""
    if raw is None:
        return ["Casual"]
    values: Sequence[Any] = raw if isinstance(raw, (list, tuple, set)) else [raw]
    occasions: List[str] = []
    for value in values:
        for occ in _OCCASION_BY_USAGE.get(_norm(value), []):
            if occ not in occasions:
                occasions.append(occ)
    return occasions or ["Casual"]


def normalize_style(raw: Any) -> Optional[str]:
    """A single display style derived from the usage/season hints."""
    cleaned = _clean(raw)
    if not cleaned:
        return None
    return _title_case(cleaned)


def normalize_row(
    row: Dict[str, Any],
    *,
    source: str = "kaggle",
    external_id: Any = None,
) -> Dict[str, Any]:
    """Convert one raw dataset row into a `public.clothing` insert payload.

    The caller is responsible for supplying real `image_url`/`thumbnail_url`
    (the raw image bytes are handled by the ingestion script). `metadata`
    carries provenance so re-ingestion stays idempotent.
    """
    category = normalize_category(
        row.get("masterCategory") or row.get("master_category"),
        row.get("subCategory") or row.get("sub_category"),
        row.get("articleType") or row.get("article_type"),
    )
    article = row.get("articleType") or row.get("article_type")
    sub_category = row.get("subCategory") or row.get("sub_category")

    name = _clean(
        row.get("productDisplayName")
        or row.get("name")
        or row.get("title")
        or article
        or sub_category
        or category
    )
    if not name:
        name = f"{category} item"

    raw_colors = row.get("baseColour") or row.get("base_color") or row.get("color")
    colors = normalize_colors(raw_colors)

    ext = _clean(external_id if external_id is not None else row.get("id"))
    metadata: Dict[str, Any] = {"source": source}
    if ext:
        metadata["external_id"] = ext
    for key in ("masterCategory", "subCategory", "articleType", "season", "year"):
        value = _clean(row.get(key))
        if value and value.lower() != "nan":
            metadata[key] = value

    description_bits = [
        _clean(row.get("masterCategory")),
        _clean(sub_category),
        _clean(article),
    ]
    description = " · ".join(b for b in description_bits if b) or None

    price = row.get("price")
    try:
        price = float(price) if price not in (None, "") and str(price).lower() != "nan" else None
    except (TypeError, ValueError):
        price = None

    return {
        "name": name[:255],
        "description": description,
        "category": category,
        "subcategory": normalize_subcategory(article, sub_category),
        "gender": normalize_gender(row.get("gender")),
        "color": colors[:10],
        "sizes": normalize_sizes(row.get("sizes") or row.get("size"), category),
        "style": normalize_style(row.get("usage") or row.get("style")),
        "brand": _clean(row.get("brand")) or None,
        "occasion": normalize_occasions(row.get("usage") or row.get("occasion")),
        "price": price,
        "currency": _clean(row.get("currency")) or "USD",
        "metadata": metadata,
    }
