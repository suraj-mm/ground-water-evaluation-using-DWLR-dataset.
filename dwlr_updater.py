import argparse
import json
import sys
import time
from pathlib import Path

# Ensure project root is in sys.path
BASE_DIR = Path(__file__).resolve().parent
if str(BASE_DIR) not in sys.path:
    sys.path.insert(0, str(BASE_DIR))

from backend.app.services.dwlr_service import dwlr_service

SIX_HOURS_SECONDS = 6 * 60 * 60

def run_update():
    print("=" * 70)
    print("  CGWB DWLR (Digital Water Level Recorder) 6-Hour Update Service")
    print("=" * 70)
    print("  Connecting to India-WRIS portal (Department of Water Resources)...")
    manifest = dwlr_service.perform_6hour_update()
    
    print("\n[UPDATE MANIFEST]")
    print(f"  Dataset Name       : {manifest.get('dataset_name')}")
    print(f"  Update Interval    : {manifest.get('update_interval')}")
    print(f"  Last Update (Local): {manifest.get('last_update_local')}")
    print(f"  Next Update (UTC)  : {manifest.get('next_scheduled_update_utc')}")
    print(f"  Status             : {manifest.get('status')}")
    print(f"  Records Ingested   : {manifest.get('total_records_ingested')}")
    print(f"  Saved File Path    : {manifest.get('telemetry_file_path')}")

    print("\n[PROOF OF 6-HOUR TELEMETRY INTERVALS]")
    proof = manifest.get("proof_of_6hour_intervals", [])
    if proof:
        for p in proof:
            print(f"  • {p['timestamp']} | Well: {p['station_code']} ({p['station_name']}) | Water Level: {p['water_level_mbgl']} mbgl | Mode: {p['mode']}")
    else:
        print("  No telemetric records retrieved in the selected window.")
    print("=" * 70)
    return manifest

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="CGWB DWLR 6-Hour Automated Ingestion Worker")
    parser.add_argument("--daemon", action="store_true", help="Run continuously in background, updating every 6 hours")
    args = parser.parse_args()

    if args.daemon:
        print("[INFO] Starting DWLR updater in DAEMON mode (updates every 6 hours). Press Ctrl+C to stop.")
        while True:
            try:
                run_update()
                print(f"\n[INFO] Sleeping for 6 hours until next scheduled update...\n")
                time.sleep(SIX_HOURS_SECONDS)
            except KeyboardInterrupt:
                print("\n[INFO] DWLR daemon stopped by user.")
                break
            except Exception as e:
                print(f"[ERROR] Update failed: {e}. Retrying in 5 minutes...")
                time.sleep(300)
    else:
        run_update()

