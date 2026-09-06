#!/usr/bin/env python3
"""DEPRECATED entrypoint — forwards to vps-split-free-paid-models.py (free *-free + paid bare)."""
import os
import runpy
import sys

here = os.path.dirname(os.path.abspath(__file__))
sys.argv[0] = os.path.join(here, "vps-split-free-paid-models.py")
runpy.run_path(sys.argv[0], run_name="__main__")
