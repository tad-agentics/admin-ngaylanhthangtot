#!/usr/bin/env python3
"""Patch downloaded Supabase edge function sources in-place (idempotent)."""
from __future__ import annotations

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SHARED = ROOT / "supabase" / "functions" / "_shared"

SHARED_FILES = [
    "user-engagement.ts",
    "auth-user.ts",
]


def sync_shared(workdir: Path) -> None:
    dest = workdir / "supabase" / "functions" / "_shared"
    dest.mkdir(parents=True, exist_ok=True)
    for name in SHARED_FILES:
        (dest / name).write_text((SHARED / name).read_text())


def strip_engagement_patches(content: str) -> str:
    content = content.replace(
        'import { requireAuthenticatedUser } from "../../auth-user.ts";\n', "",
    )
    content = content.replace(
        'import { trackProfileEngagement } from "../../user-engagement.ts";\n', "",
    )
    content = re.sub(
        r"\n      if \(\n        endpoint === \"la-so-chi-tiet\" &&[\s\S]*?\n      \) \{\n"
        r"        trackProfileEngagement\(auth\.admin, auth\.uid, \"bazi_luan\"\);\n"
        r"      \}\n",
        "\n",
        content,
    )
    content = re.sub(
        r"\n      trackProfileEngagement\(auth\.admin, auth\.uid, \"bazi_luan\"\);\n",
        "\n",
        content,
    )
    return content


def patch_create_handler(path: Path) -> None:
    content = strip_engagement_patches(path.read_text())
    content = content.replace(
        'import { corsHeadersForRequest } from "../../cors.ts";',
        'import { corsHeadersForRequest } from "../../cors.ts";\n'
        'import { requireAuthenticatedUser } from "../../auth-user.ts";\n'
        'import { trackProfileEngagement } from "../../user-engagement.ts";\n',
    )

    if 'trackProfileEngagement(auth.admin, auth.uid, "bazi_luan")' not in content:
        content = content.replace(
            "      rateLimitUserId = auth.uid;\n    }\n\n    const promptBody:",
            "      rateLimitUserId = auth.uid;\n"
            "      if (\n"
            "        endpoint === \"la-so-chi-tiet\" &&\n"
            "        !preview &&\n"
            "        !prewarmUserId\n"
            "      ) {\n"
            "        trackProfileEngagement(auth.admin, auth.uid, \"bazi_luan\");\n"
            "      }\n"
            "    }\n\n    const promptBody:",
        )

    path.write_text(content)


def patch_day_luan(path: Path) -> None:
    content = path.read_text()
    content = content.replace(
        'import { trackProfileEngagement } from "../_shared/user-engagement.ts";\n', "",
    )
    content = re.sub(
        r"\n    trackProfileEngagement\(admin, user\.id, \"day_luan_follow_up\"\);\n",
        "\n",
        content,
    )
    content = re.sub(
        r"\n  if \(action === \"cta_click\"\) \{[\s\S]*?\n  \}\n",
        "\n",
        content,
        count=1,
    )
    if "trackProfileEngagement" not in content:
        content = content.replace(
            'import { corsHeadersForRequest } from "../_shared/cors.ts";',
            'import { corsHeadersForRequest } from "../_shared/cors.ts";\n'
            'import { trackProfileEngagement } from "../_shared/user-engagement.ts";',
        )

    needle = """  const admin = createClient(supabaseUrl, serviceKey);

  if (action === "open") {"""

    replacement = """  const admin = createClient(supabaseUrl, serviceKey);

  if (action === "cta_click") {
    trackProfileEngagement(admin, user.id, "day_luan_follow_up");
    return json({ ok: true }, 200, req);
  }

  if (action === "open") {"""

    if needle not in content:
        raise RuntimeError(f"{path}: cta_click anchor not found")
    content = content.replace(needle, replacement, 1)
    content = content.replace(
        'message: \'action phải là "open" hoặc "ask".\'',
        'message: \'action phải là "open", "ask" hoặc "cta_click".\'',
    )
    path.write_text(content)


def main() -> None:
    workdir = Path(sys.argv[1])
    kind = sys.argv[2]
    sync_shared(workdir)
    fn_root = workdir / "supabase" / "functions"

    if kind == "day-luan-chat":
        patch_day_luan(fn_root / "day-luan-chat" / "index.ts")
    elif kind in ("generate-reading-la-so", "generate-reading-luu-nien"):
        patch_create_handler(
            fn_root / "_shared" / "generate-reading" / "handler" / "create-handler.ts",
        )
    else:
        raise SystemExit(f"unknown kind: {kind}")


if __name__ == "__main__":
    main()
