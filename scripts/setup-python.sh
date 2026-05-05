#!/bin/bash
# setup-python.sh — Create the Python venv and install requirements for batchcontent.
# Run from the project root: bash scripts/setup-python.sh

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PYTHON_DIR="$SCRIPT_DIR/../python"

cd "$PYTHON_DIR"

echo "[setup-python] Creating virtual environment..."
python3 -m venv venv

echo "[setup-python] Activating virtual environment..."
source venv/bin/activate

echo "[setup-python] Upgrading pip..."
pip install --upgrade pip

echo "[setup-python] Installing requirements..."
# nemo_toolkit[asr] has heavy GPU/CUDA dependencies.
# On a CPU-only machine the install may warn about missing CUDA — that is OK.
# The package will still work for CPU inference.
pip install -r requirements.txt || {
  echo ""
  echo "============================================================"
  echo "WARNING: One or more packages failed to install."
  echo "This is often due to CUDA/GPU driver requirements for NeMo."
  echo "Try installing manually if needed:"
  echo "  pip install nemo_toolkit[asr] mediapipe opencv-python-headless numpy yt-dlp"
  echo "============================================================"
  echo ""
  exit 1
}

echo ""
echo "[setup-python] Done! Python environment ready at: $PYTHON_DIR/venv"
echo "Run 'npm run setup:python' to re-run this script."
