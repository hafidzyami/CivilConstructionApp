"""
VLM Engine for document OCR using Qwen2.5-VL-7B.

Uses vLLM as the model server with OpenAI-compatible API for inference.
"""

import os
import sys
import subprocess
import time
import logging

import requests

logger = logging.getLogger("vlm-engine")

MODEL_HF_NAME = os.environ.get("MODEL_NAME", "Qwen/Qwen2.5-VL-7B-Instruct")
MODEL_CACHE_DIR = os.environ.get("MODEL_CACHE_DIR", "/app/models")
SERVE_PORT = int(os.environ.get("SERVE_PORT", "8080"))
SERVE_HOST = "127.0.0.1"
SERVE_URL = f"http://{SERVE_HOST}:{SERVE_PORT}"
MAX_NEW_TOKENS = int(os.environ.get("MAX_NEW_TOKENS", "2048"))
TEMPERATURE = float(os.environ.get("TEMPERATURE", "0.1"))


def ensure_model_downloaded() -> str:
    """Download model to network volume if not already present. Returns local path."""
    local_dir = os.path.join(MODEL_CACHE_DIR, MODEL_HF_NAME.replace("/", "--"))
    marker = os.path.join(local_dir, ".download_complete")

    if os.path.exists(marker):
        logger.info(f"Model already cached at {local_dir}")
        return local_dir

    logger.info(f"Downloading model {MODEL_HF_NAME} to {local_dir}...")
    os.makedirs(local_dir, exist_ok=True)

    from huggingface_hub import snapshot_download
    snapshot_download(
        MODEL_HF_NAME,
        local_dir=local_dir,
    )

    # Write marker so we skip download next time
    with open(marker, "w") as f:
        f.write("ok")

    logger.info(f"Model downloaded to {local_dir}")
    return local_dir

# Generic document extraction prompt
DOCUMENT_PROMPT = """You are a document OCR assistant. Extract ALL text from this document image.

Rules:
1. Extract every piece of text visible in the document, preserving the reading order
2. For tables, extract row by row, separating columns with " | "
3. For forms, extract label-value pairs as "Label: Value"
4. Preserve line breaks between paragraphs
5. Include headers, footers, stamps, and handwritten text if visible
6. Return the extracted text as plain text, NOT JSON

Output the raw text content only."""


class VLMEngine:
    """Manages vLLM subprocess and provides VLM inference."""

    def __init__(self):
        self.serve_process = None
        self.model_path = None
        self._start_server()

    def _start_server(self):
        """Download model if needed, then start vLLM as a background process."""
        self.model_path = ensure_model_downloaded()
        logger.info(f"Starting vLLM with model: {self.model_path}")
        logger.info(f"Listening on: {SERVE_HOST}:{SERVE_PORT}")

        cmd = [
            "python3", "-m", "vllm.entrypoints.openai.api_server",
            "--model", self.model_path,
            "--host", SERVE_HOST,
            "--port", str(SERVE_PORT),
            "--max-model-len", "16384",
            "--gpu-memory-utilization", "0.90",
            "--trust-remote-code",
            "--limit-mm-per-prompt", '{"image": 1}',
        ]

        self.serve_process = subprocess.Popen(
            cmd,
            stdout=sys.stdout,
            stderr=sys.stderr,
        )

        # Wait for server to be ready
        if not self._wait_for_server(timeout=300):
            raise RuntimeError("vLLM failed to start within timeout")

        logger.info("vLLM is ready!")

    def _wait_for_server(self, timeout=300):
        """Wait for vLLM to be ready."""
        logger.info("Waiting for model server to start...")
        start = time.time()
        while time.time() - start < timeout:
            try:
                resp = requests.get(f"{SERVE_URL}/health", timeout=5)
                if resp.status_code == 200:
                    logger.info(f"Model server ready! (took {time.time() - start:.1f}s)")
                    return True
            except requests.ConnectionError:
                pass
            time.sleep(2)

        logger.error(f"Server did not start within {timeout}s")
        return False

    def _call_vlm(self, image_b64: str, prompt: str) -> str:
        """Call VLM via OpenAI-compatible API with a base64 image."""
        payload = {
            "model": self.model_path,
            "messages": [
                {
                    "role": "user",
                    "content": [
                        {"type": "text", "text": prompt},
                        {
                            "type": "image_url",
                            "image_url": {
                                "url": f"data:image/jpeg;base64,{image_b64}"
                            }
                        }
                    ]
                }
            ],
            "max_tokens": MAX_NEW_TOKENS,
            "temperature": TEMPERATURE,
        }

        resp = requests.post(
            f"{SERVE_URL}/v1/chat/completions",
            json=payload,
            timeout=120,
        )
        if resp.status_code != 200:
            logger.error(f"vLLM API error {resp.status_code}: {resp.text[:500]}")
        resp.raise_for_status()
        data = resp.json()
        return data["choices"][0]["message"]["content"]

    def process_image(self, image_b64: str, prompt: str = None) -> dict:
        """
        Process an image with VLM and return structured results.

        Args:
            image_b64: Base64-encoded image
            prompt: Optional custom prompt (defaults to DOCUMENT_PROMPT)

        Returns:
            dict with 'text' and 'text_lines' keys
        """
        start_time = time.time()

        if prompt is None:
            prompt = DOCUMENT_PROMPT

        try:
            result_text = self._call_vlm(image_b64, prompt)
            inference_time = time.time() - start_time

            # Convert text to text_lines format
            text_lines = []
            for i, line in enumerate(result_text.split('\n')):
                if line.strip():
                    text_lines.append({
                        'text': line.strip(),
                        'bbox': [0, i * 20, 500, (i + 1) * 20],
                        'confidence': 0.95,
                        'region_type': 'VLM'
                    })

            return {
                'text': result_text,
                'text_lines': text_lines,
                '_vlm_metadata': {
                    'model': MODEL_HF_NAME,
                    'inference_time_ms': round(inference_time * 1000, 2),
                    'prompt_length': len(prompt),
                    'output_length': len(result_text)
                }
            }

        except Exception as e:
            logger.error(f"VLM inference failed: {e}")
            raise RuntimeError(f"VLM inference failed: {e}")
