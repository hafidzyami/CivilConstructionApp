# RunPod Serverless Dockerfile — OCR Only (Surya + PaddleOCR + Hybrid)
# Target GPU: RTX 4090 (Ada Lovelace, 24GB VRAM)
# Build context: ocr-service/ (parent of runpod/)
#   docker build -t ocr-runpod -f runpod/ocr/Dockerfile .

FROM runpod/pytorch:2.8.0-py3.11-cuda12.8.1-cudnn-devel-ubuntu22.04

ENV DEBIAN_FRONTEND=noninteractive
ENV PYTHONUNBUFFERED=1

WORKDIR /app

# Install system dependencies for OpenCV and PDF support
RUN apt-get update && apt-get install -y --no-install-recommends \
    libgl1 \
    libglib2.0-0 \
    libsm6 \
    libxext6 \
    libxrender-dev \
    libgomp1 \
    poppler-utils \
    && rm -rf /var/lib/apt/lists/*

# Install PaddlePaddle GPU for CUDA 12.6 (compatible with 12.8 runtime)
RUN pip install --no-cache-dir \
    paddlepaddle-gpu==3.3.0 \
    -i https://www.paddlepaddle.org.cn/packages/stable/cu126/

# Copy and install Python dependencies
COPY runpod/ocr/requirements.txt /tmp/requirements.txt
RUN pip install --no-cache-dir -r /tmp/requirements.txt

# Create langchain compatibility shim for PaddleX
RUN SITE_PKG=$(python3 -c "import site; print(site.getsitepackages()[0])") && \
    mkdir -p "$SITE_PKG/langchain/docstore" && \
    echo "# Compatibility shim for PaddleX" > "$SITE_PKG/langchain/__init__.py" && \
    echo "from langchain_core.documents import Document" > "$SITE_PKG/langchain/docstore/__init__.py" && \
    echo "from langchain_core.documents import Document" > "$SITE_PKG/langchain/docstore/document.py" && \
    echo "from langchain_text_splitters import RecursiveCharacterTextSplitter" > "$SITE_PKG/langchain/text_splitter.py"

# Pre-download Surya models at build time (avoids runtime download)
RUN python3 -c "\
from surya.foundation import FoundationPredictor; \
from surya.layout import LayoutPredictor; \
from surya.table_rec import TableRecPredictor; \
from surya.detection import DetectionPredictor; \
print('Downloading Surya models...'); \
fp = FoundationPredictor(device='cpu'); \
lp = LayoutPredictor(fp); \
tp = TableRecPredictor(device='cpu'); \
dp = DetectionPredictor(device='cpu'); \
print('Surya models downloaded successfully'); \
del lp, tp, dp, fp"

# NOTE: PaddleOCR models (~100MB) cannot be pre-downloaded at build time
# because paddlepaddle-gpu requires libcuda.so (GPU) even for model download.
# Models will auto-download on first request at runtime (~10s one-time cost).

# Copy OCR modules (reused from existing ocr-service)
COPY modules/ /app/modules/

# Copy handler
COPY runpod/ocr/handler.py /app/handler.py

# Environment variables
ENV NVIDIA_VISIBLE_DEVICES=all
ENV NVIDIA_DRIVER_CAPABILITIES=compute,utility
ENV CUDA_MODULE_LOADING=LAZY

CMD ["python3", "-u", "handler.py"]
