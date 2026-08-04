from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys
import threading
import uuid
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any

from normalize_bundle import write_bundle


ROOT = Path(__file__).resolve().parent
JOBS: dict[str, dict[str, Any]] = {}
LOCK = threading.Lock()


def allowed_origins() -> set[str]:
    configured = os.environ.get(
        "GLYMIZE_ADMIN_ORIGINS",
        "https://abbaselotfi.github.io,https://glymize.ir,https://www.glymize.ir,http://localhost:3000,http://127.0.0.1:3000",
    )
    return {origin.strip().rstrip("/") for origin in configured.split(",") if origin.strip()}


def update_job(job_id: str, **patch: Any) -> None:
    with LOCK:
        JOBS[job_id] = {**JOBS[job_id], **patch}


def execute_job(job_id: str, nfi_path: Path, work_dir: Path) -> None:
    update_job(job_id, status="running", message="در حال دریافت سه منبع بیمه‌ای…")
    try:
        if not nfi_path.exists():
            raise FileNotFoundError(
                "خروجی NFI پیدا نشد. مسیر فایل را در GLYMIZE_NFI_FILE تنظیم کنید."
            )
        work_dir.mkdir(parents=True, exist_ok=True)
        collector = ROOT / "collect_three_drug_sources.py"
        process = subprocess.run(
            [sys.executable, str(collector)],
            cwd=work_dir,
            capture_output=True,
            text=True,
            timeout=45 * 60,
            check=False,
        )
        if process.returncode != 0:
            message = (process.stderr or process.stdout or "collector failed")[-2000:]
            raise RuntimeError(f"دریافت منابع بیمه کامل نشد: {message}")
        insurance_path = work_dir / "output" / "drug_sources_latest.xlsx"
        if not insurance_path.exists():
            raise FileNotFoundError("فایل نهایی سه منبع بیمه‌ای ساخته نشد.")
        update_job(job_id, message="در حال استانداردسازی، تبدیل ریال به تومان و کنترل کدها…")
        output_path = work_dir / "output" / "glymize-drug-bundle.json"
        bundle = write_bundle(
            nfi_path,
            insurance_path,
            output_path,
            os.environ.get("GLYMIZE_DEFAULT_PRICE_CURRENCY"),
        )
        update_job(
            job_id,
            status="succeeded",
            message="بسته استاندارد آماده بازبینی ادمین است.",
            bundle=bundle,
            outputPath=str(output_path),
        )
    except Exception as exc:
        update_job(job_id, status="failed", message=str(exc))


class Handler(BaseHTTPRequestHandler):
    server_version = "GLYMIZEIranRunner/0.1"

    def end_headers(self) -> None:
        origin = self.headers.get("Origin", "").rstrip("/")
        if origin in allowed_origins():
            self.send_header("Access-Control-Allow-Origin", origin)
            self.send_header("Vary", "Origin")
        self.send_header("Access-Control-Allow-Headers", "content-type")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Private-Network", "true")
        self.send_header("Cache-Control", "no-store")
        self.send_header("X-Content-Type-Options", "nosniff")
        super().end_headers()

    def json_response(self, body: Any, status: int = 200) -> None:
        encoded = json.dumps(body, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(encoded)))
        self.end_headers()
        self.wfile.write(encoded)

    def do_OPTIONS(self) -> None:  # noqa: N802
        origin = self.headers.get("Origin", "").rstrip("/")
        self.send_response(204 if origin in allowed_origins() else 403)
        self.end_headers()

    def do_GET(self) -> None:  # noqa: N802
        if self.path == "/health":
            self.json_response({"status": "ok", "runnerVersion": "0.1", "boundTo": "127.0.0.1"})
            return
        if self.path.startswith("/jobs/"):
            job_id = self.path.split("/", 2)[-1]
            with LOCK:
                job = JOBS.get(job_id)
            self.json_response(job or {"error": "job_not_found"}, 200 if job else 404)
            return
        self.json_response({"error": "not_found"}, 404)

    def do_POST(self) -> None:  # noqa: N802
        if self.path != "/run":
            self.json_response({"error": "not_found"}, 404)
            return
        origin = self.headers.get("Origin", "").rstrip("/")
        if origin and origin not in allowed_origins():
            self.json_response({"error": "origin_not_allowed"}, 403)
            return
        job_id = str(uuid.uuid4())
        job = {"id": job_id, "status": "queued", "message": "در صف اجرا"}
        with LOCK:
            JOBS[job_id] = job
        nfi_path = Path(os.environ.get("GLYMIZE_NFI_FILE", ROOT / "input" / "nfi-latest.xlsx")).resolve()
        work_dir = (ROOT / "runs" / job_id).resolve()
        threading.Thread(target=execute_job, args=(job_id, nfi_path, work_dir), daemon=True).start()
        self.json_response(job, 202)

    def log_message(self, format: str, *args: Any) -> None:
        print(f"[runner] {self.address_string()} {format % args}")


def main() -> None:
    parser = argparse.ArgumentParser(description="GLYMIZE Iran local drug-data runner")
    parser.add_argument("--port", type=int, default=8765)
    args = parser.parse_args()
    server = ThreadingHTTPServer(("127.0.0.1", args.port), Handler)
    print(f"GLYMIZE Runner: http://127.0.0.1:{args.port}")
    print("برای توقف Ctrl+C را بزنید. این سرویس فقط به localhost متصل است.")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
