"""
seed_complete_database.py
=========================
Convenience entry point to run the master seeder from inside backend/.
"""
import sys
from pathlib import Path

root_dir = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(root_dir / "scripts"))

import seed_all
import asyncio

if __name__ == "__main__":
    asyncio.run(seed_all.main())
