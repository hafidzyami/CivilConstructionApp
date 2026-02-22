# RunPod Serverless Dockerfile — VLM Only (Qwen2.5-VL-7B via vLLM)
# Target GPU: A6000 (Ampere, 48GB VRAM)
# Build context: ocr-service/ (parent of runpod/)
#   docker build -t vlm-runpod -f runpod/vlm/Dockerfile .
#
# The Qwen2.5-VL-7B model (~15GB) is baked into the image for
# zero cold-start latency (no runtime download needed).

FROM runpod/pytorch:2.8.0-py3.11-cuda12.8.1-cudnn-devel-ubuntu22.04

ENV DEBIAN_FRONTEND=noninteractive
ENV PYTHONUNBUFFERED=1

WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    libgl1 \
    libglib2.0-0 \
    poppler-utils \
    && rm -rf /var/lib/apt/lists/*

# Copy and install Python dependencies
COPY runpod/vlm/requirements.txt /tmp/requirements.txt
RUN pip install --no-cache-dir -r /tmp/requirements.txt

# Install vLLM for VLM serving
RUN pip install --no-cache-dir vllm

# Download model at build time (~15GB, baked into image)
RUN pip install --no-cache-dir huggingface-hub && \
    huggingface-cli download Qwen/Qwen2.5-VL-7B-Instruct \
      --local-dir /app/models/Qwen--Qwen2.5-VL-7B-Instruct

# Copy handler files
COPY runpod/vlm/handler.py /app/handler.py
COPY runpod/vlm/vlm_engine.py /app/vlm_engine.py

# Environment variables
ENV MODEL_NAME=Qwen/Qwen2.5-VL-7B-Instruct
ENV MODEL_CACHE_DIR=/app/models
ENV MAX_NEW_TOKENS=2048
ENV TEMPERATURE=0.1
ENV NVIDIA_VISIBLE_DEVICES=all
ENV NVIDIA_DRIVER_CAPABILITIES=compute,utility
ENV CUDA_MODULE_LOADING=LAZY

CMD ["python3", "-u", "handler.py"]
