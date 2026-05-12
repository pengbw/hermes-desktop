# /// script
# requires-python = ">=3.10"
# dependencies = [
#     "transformers>=4.36,<4.50",
#     "torch",
#     "onnx",
#     "optimum[onnxruntime]",
# ]
# ///
"""Export all-MiniLM-L6-v2 to ONNX format using optimum.

Cross-platform: works on macOS, Windows, and Linux.
Output goes to the system temp directory, then copy model.onnx to
src-tauri/models/all-MiniLM-L6-v2/ for bundling.
"""

import os
import sys
import tempfile
from optimum.onnxruntime import ORTModelForFeatureExtraction
from transformers import AutoTokenizer

MODEL_NAME = "sentence-transformers/all-MiniLM-L6-v2"
OUTPUT_DIR = os.path.join(tempfile.gettempdir(), "all-MiniLM-L6-v2-onnx")

os.makedirs(OUTPUT_DIR, exist_ok=True)

print(f"Loading and exporting model: {MODEL_NAME}")
model = ORTModelForFeatureExtraction.from_pretrained(MODEL_NAME, export=True)
model.save_pretrained(OUTPUT_DIR)

tokenizer = AutoTokenizer.from_pretrained(MODEL_NAME)
tokenizer.save_pretrained(OUTPUT_DIR)

print(f"ONNX model exported to: {OUTPUT_DIR}")
for f in os.listdir(OUTPUT_DIR):
    path = os.path.join(OUTPUT_DIR, f)
    if os.path.isfile(path):
        print(f"  {f}: {os.path.getsize(path) / 1024 / 1024:.1f} MB")

script_dir = os.path.dirname(os.path.abspath(__file__))
target_dir = os.path.join(script_dir, "..", "src-tauri", "models", "all-MiniLM-L6-v2")
os.makedirs(target_dir, exist_ok=True)

src = os.path.join(OUTPUT_DIR, "model.onnx")
dst = os.path.join(target_dir, "model.onnx")

if os.path.exists(src):
    import shutil
    shutil.copy2(src, dst)
    print(f"Copied model.onnx to: {os.path.abspath(dst)}")
else:
    print(f"ERROR: model.onnx not found in {OUTPUT_DIR}", file=sys.stderr)
    sys.exit(1)