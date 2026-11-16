import os
import sys
import threading
import time
import webbrowser
from pathlib import Path

# Add project root to sys.path
BASE_DIR = Path(__file__).resolve().parent
if str(BASE_DIR) not in sys.path:
    sys.path.insert(0, str(BASE_DIR))

import uvicorn
from backend.app.core.config import settings

def open_browser_delayed(url: str, delay: float = 1.5):
    def _worker():
        time.sleep(delay)
        print(f"\n[INFO] Opening Groundwater Platform in default browser: {url}\n")
        webbrowser.open(url)
    t = threading.Thread(target=_worker, daemon=True)
    t.start()

if __name__ == "__main__":
    host = settings.host
    port = settings.port
    app_url = f"http://{host}:{port}"
    print("=" * 70)
    print("  CGWB HydroEval · Quality-Controlled Groundwater Level Platform")
    print(f"  Localhost Web Browser URL : {app_url}")
    print(f"  Interactive OpenAPI Docs   : {app_url}/docs")
    print("=" * 70)

    # Launch browser automatically
    open_browser_delayed(app_url, delay=1.5)

    uvicorn.run(
        "backend.app.main:app",
        host=host,
        port=port,
        reload=False,
        log_level="info"
    )

