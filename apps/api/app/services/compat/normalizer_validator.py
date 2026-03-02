import re
from typing import Any


def normalize_option_text(value: Any) -> str:
    text = str(value or "").strip()
    if not text:
        return ""

    labeled = re.match(r"^(?:선택지|보기|옵션|option)\s*[0-9A-Da-d]+(?:\s*[:.)-]\s*|\s+)(.+)$", text, re.IGNORECASE)
    if labeled:
        return str(labeled.group(1)).strip()

    numbered = re.match(r"^\s*(?:\(?[1-9]\)?[.)-]|[A-Da-d][.)-])\s*(.+)$", text)
    if numbered:
        return str(numbered.group(1)).strip()

    return text


def is_placeholder_option(text: str) -> bool:
    lowered = str(text or "").strip().lower()
    if not lowered:
        return True
    if re.fullmatch(r"\d+", lowered):
        return True
    if re.fullmatch(r"[a-d]", lowered):
        return True
    if re.fullmatch(r"\d+\s*번", lowered):
        return True
    if re.fullmatch(r"(?:선택지|보기|옵션|option)\s*[0-9a-d]+", lowered, re.IGNORECASE):
        return True
    return False


def extract_enumerated_options(*sources: Any, max_options: int = 4) -> list[str]:
    extracted: list[str] = []
    for source in sources:
        text = str(source or "")
        if not text.strip():
            continue
        for line in text.splitlines():
            match = re.match(r"^\s*(?:\(?[1-9]\)?[.)]|[A-Da-d][.)])\s*(.+?)\s*$", line.strip())
            if not match:
                continue
            candidate = normalize_option_text(match.group(1))
            if not candidate or is_placeholder_option(candidate):
                continue
            if candidate not in extracted:
                extracted.append(candidate)
            if len(extracted) >= max_options:
                return extracted
    return extracted
