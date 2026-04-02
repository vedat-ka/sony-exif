from __future__ import annotations

from datetime import datetime, timezone
from pathlib import Path
import json
import re
import shutil
import subprocess
from typing import Any

import exifread


BINARY_TAG_HINTS = (
    'thumbnail',
    'previewimage',
    'preview image',
    'tiffmeteringimage',
)

HIDDEN_GROUP_PREFIXES = (
    'file ',
    'exiftool ',
    'system ',
)

SHUTTER_COUNT_HINTS = ('shuttercount', 'shutter count')
SHOT_COUNT_HINTS = ('imagecount', 'image count', 'shotnumbersincepowerup', 'shot number since power up')


def _find_exiftool_command() -> list[str] | None:
    backend_dir = Path(__file__).resolve().parents[1]
    vendored_roots = sorted((backend_dir / 'vendor' / 'exiftool').glob('Image-ExifTool-*/exiftool'))
    if vendored_roots:
        return ['perl', str(vendored_roots[-1])]

    system_exiftool = shutil.which('exiftool')
    if system_exiftool:
        return [system_exiftool]

    return None


def _extract_tags_with_exiftool(file_path: Path) -> dict[str, Any]:
    exiftool_command = _find_exiftool_command()
    if exiftool_command is None:
        return {}

    result = subprocess.run(
        [*exiftool_command, '-j', '-G1', '-a', '-s', str(file_path)],
        capture_output=True,
        text=True,
        check=True,
    )
    payload = json.loads(result.stdout)
    if not payload:
        return {}

    raw_tags = payload[0]
    tags: dict[str, Any] = {}
    for key, value in raw_tags.items():
        if key == 'SourceFile':
            continue

        normalized_key = key.replace('[', '').replace(']', ' ').replace(':', ' ').strip()
        tags[normalized_key] = value

    return tags


def _extract_tags_with_exifread(file_path: Path) -> dict[str, Any]:
    with file_path.open('rb') as image_file:
        return exifread.process_file(
            image_file,
            details=True,
            debug=False,
            extract_thumbnail=False,
        )


def _looks_binary_text(text: str) -> bool:
    if len(text) < 24:
        return False

    replacement_count = text.count('\ufffd')
    control_count = sum(1 for char in text if ord(char) < 32 and char not in '\n\r\t')
    return replacement_count > max(3, len(text) // 20) or control_count > 0


def _should_hide_tag(name: str, value: Any) -> bool:
    lowered_name = name.lower()
    if any(lowered_name.startswith(prefix) for prefix in HIDDEN_GROUP_PREFIXES):
        return True

    if any(hint in lowered_name for hint in BINARY_TAG_HINTS):
        return True

    return _looks_binary_text(_serialize_value(value))


def _first_integer(value: Any) -> int | None:
    match = re.search(r'\d+', _serialize_value(value))
    if match is None:
        return None
    return int(match.group())


def _find_first_matching_tag(tags: dict[str, Any], hints: tuple[str, ...]) -> tuple[str, int] | None:
    for name, value in tags.items():
        lowered_name = name.lower()
        if any(hint in lowered_name for hint in hints):
            number = _first_integer(value)
            if number is not None:
                return name, number
    return None


def _build_highlights(tags: dict[str, Any], metadata_source: str) -> dict[str, Any]:
    shutter_count = _find_first_matching_tag(tags, SHUTTER_COUNT_HINTS)
    shot_count = None if shutter_count else _find_first_matching_tag(tags, SHOT_COUNT_HINTS)

    shutter_note = None
    shutter_value = None
    shutter_source = None

    if shutter_count is not None:
        shutter_source, shutter_value = shutter_count
    elif shot_count is not None:
        shutter_source, shutter_value = shot_count
        shutter_note = (
            'Möglicher Zaehler aus ImageCount oder ShotNumberSincePowerUp. '
            'Das ist nicht bei jedem Sony-Modell identisch mit den mechanischen Ausloesungen.'
        )
    elif metadata_source != 'exiftool':
        shutter_note = (
            'Keine Ausloesungszahl in den dekodierten EXIF-Daten gefunden. '
            'Bei vielen Sony-Modellen steckt ShutterCount in erweiterten MakerNotes und wird '
            'zuverlaessiger von exiftool erkannt.'
        )

    return {
        'camera_model': tags.get('Image Model') or tags.get('EXIF Model'),
        'lens_model': tags.get('EXIF LensModel') or tags.get('MakerNote LensType2') or tags.get('MakerNote LensType'),
        'captured_at': tags.get('EXIF DateTimeOriginal') or tags.get('Image DateTime'),
        'iso': tags.get('EXIF ISOSpeedRatings') or tags.get('MakerNote SonyISO'),
        'shutter_count': shutter_value,
        'shutter_count_source': shutter_source,
        'shutter_count_note': shutter_note,
    }


def _serialize_value(value: Any) -> Any:
    if isinstance(value, bytes):
        return value.decode("utf-8", errors="replace")
    if isinstance(value, (list, tuple)):
        return [_serialize_value(item) for item in value]
    if isinstance(value, dict):
        return {str(key): _serialize_value(item) for key, item in value.items()}
    return str(value)


def extract_metadata(
    file_path: Path,
    *,
    original_name: str | None = None,
    content_type: str | None = None,
) -> dict[str, Any]:
    stat = file_path.stat()

    metadata_source = 'exifread'
    tags = _extract_tags_with_exiftool(file_path)
    if tags:
        metadata_source = 'exiftool'
    else:
        tags = _extract_tags_with_exifread(file_path)

    hidden_binary_tags: list[str] = []
    exif_tags: dict[str, Any] = {}

    for name, value in sorted(tags.items()):
        if _should_hide_tag(name, value):
            hidden_binary_tags.append(name)
            continue
        exif_tags[name] = _serialize_value(value)

    highlights = _build_highlights(exif_tags, metadata_source)

    return {
        "file": {
            "name": original_name or file_path.name,
            "suffix": file_path.suffix.lower(),
            "content_type": content_type or "application/octet-stream",
            "size_bytes": stat.st_size,
            "created_at": datetime.fromtimestamp(stat.st_ctime, tz=timezone.utc).isoformat(),
            "modified_at": datetime.fromtimestamp(stat.st_mtime, tz=timezone.utc).isoformat(),
        },
        "summary": {
            "tag_count": len(exif_tags),
            "raw_tag_count": len(tags),
            "hidden_binary_tag_count": len(hidden_binary_tags),
            "has_exif": bool(exif_tags),
            "metadata_source": metadata_source,
        },
        "highlights": highlights,
        "exif": exif_tags,
    }
