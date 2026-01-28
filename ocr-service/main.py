"""
FastAPI OCR Service
Microservice for handling OCR processing with Surya, PaddleOCR, and Hybrid modes
"""
from fastapi import FastAPI, File, UploadFile, Form, HTTPException
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
import uvicorn
import logging
import sys
import os
import time
from pathlib import Path
from typing import Optional
import shutil
os.environ["PYTORCH_NO_CUDA_MEMORY_CACHING"] = "1"
# Configure logging for production
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s [%(levelname)s] %(name)s: %(message)s',
    handlers=[
        logging.StreamHandler(sys.stdout)
    ]
)

logger = logging.getLogger("ocr-service")

# Import OCR processing functions
sys.path.insert(0, str(Path(__file__).parent))
from modules.surya_utils import perform_ocr as perform_surya_ocr
from modules.paddle_utils import perform_paddle_ocr, perform_hybrid_ocr
from modules.preprocessing import preprocess_image, image_to_base64
import cv2
import numpy as np

app = FastAPI(
    title="OCR Service",
    description="Microservice for OCR processing with multiple engines",
    version="1.0.0"
)

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Create upload directory
UPLOAD_DIR = Path("/app/uploads")
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)


def extract_text_from_results(ocr_results):
    """Extract plain text from OCR results, sorted by position"""
    if not ocr_results or 'text_lines' not in ocr_results:
        return ""

    text_lines = []
    for line in ocr_results['text_lines']:
        if 'text' in line and 'bbox' in line:
            bbox = line['bbox']
            y_pos = bbox[1] if len(bbox) >= 2 else 0
            x_pos = bbox[0] if len(bbox) >= 1 else 0
            text_lines.append({
                'text': line['text'],
                'y': y_pos,
                'x': x_pos
            })

    text_lines.sort(key=lambda item: (item['y'], item['x']))

    if not text_lines:
        return ""

    grouped_lines = []
    current_line_group = []
    current_y = text_lines[0]['y']
    y_threshold = 20

    for item in text_lines:
        if abs(item['y'] - current_y) < y_threshold:
            current_line_group.append(item['text'])
        else:
            if current_line_group:
                grouped_lines.append(' '.join(current_line_group))
            current_line_group = [item['text']]
            current_y = item['y']

    if current_line_group:
        grouped_lines.append(' '.join(current_line_group))

    return '\n'.join(grouped_lines)


def clean_results_for_json(results):
    """Clean OCR results for JSON serialization"""
    if not results:
        return None

    cleaned = {
        'layout': {'regions': []},
        'tables': [],
        'text_lines': []
    }

    if 'layout' in results and 'regions' in results['layout']:
        for region in results['layout']['regions']:
            cleaned['layout']['regions'].append({
                'bbox': region.get('bbox', []),
                'type': region.get('type', 'Unknown')
            })

    if 'tables' in results:
        for table in results['tables']:
            cleaned['tables'].append({
                'bbox': table.get('bbox', []),
                'confidence': float(table.get('confidence', 1.0))
            })

    if 'text_lines' in results:
        for line in results['text_lines']:
            cleaned['text_lines'].append({
                'text': line.get('text', ''),
                'bbox': line.get('bbox', []),
                'confidence': float(line.get('confidence', 1.0)),
                'region_type': line.get('region_type', 'Unknown')
            })

    return cleaned


@app.get("/")
async def root():
    """Health check endpoint"""
    return {
        "service": "OCR Service",
        "status": "healthy",
        "version": "1.0.0"
    }


@app.get("/health")
async def health():
    """Health check endpoint"""
    return {"status": "healthy"}


@app.post("/ocr/process")
async def process_ocr(
    file: UploadFile = File(...),
    preprocessing: bool = Form(default=True),
    engine: str = Form(default="hybrid")
):
    """
    Process OCR on uploaded image

    Args:
        file: Image file (JPEG, PNG, etc.)
        preprocessing: Apply preprocessing (default: True)
        engine: OCR engine to use - 'surya', 'paddle', or 'hybrid' (default: 'hybrid')

    Returns:
        JSON response with OCR results
    """
    request_id = f"{int(time.time() * 1000)}"
    logger.info(f"[REQ {request_id}] ========== OCR REQUEST START ==========")
    start_time = time.time()

    temp_file_path = None

    try:
        # Validate file type
        if not file.content_type or not file.content_type.startswith('image/'):
            logger.error(f"[REQ {request_id}] Invalid file type: {file.content_type}")
            raise HTTPException(status_code=400, detail="File must be an image")

        # Validate engine
        if engine not in ['surya', 'paddle', 'hybrid']:
            logger.error(f"[REQ {request_id}] Invalid engine: {engine}")
            raise HTTPException(status_code=400, detail="Engine must be 'surya', 'paddle', or 'hybrid'")

        logger.info(f"[REQ {request_id}] File: {file.filename}")
        logger.info(f"[REQ {request_id}] Engine: {engine}")
        logger.info(f"[REQ {request_id}] Preprocessing: {preprocessing}")

        # Save uploaded file temporarily
        save_start = time.time()
        temp_file_path = UPLOAD_DIR / f"{request_id}_{file.filename}"
        with temp_file_path.open("wb") as buffer:
            shutil.copyfileobj(file.file, buffer)

        file_size_kb = temp_file_path.stat().st_size / 1024
        logger.info(f"[REQ {request_id}] File saved: {file_size_kb:.2f} KB (took {time.time() - save_start:.2f}s)")

        # Load image
        load_start = time.time()
        image = cv2.imread(str(temp_file_path))
        if image is None:
            logger.error(f"[REQ {request_id}] Failed to load image")
            raise HTTPException(status_code=400, detail="Failed to load image")

        logger.info(f"[REQ {request_id}] Image loaded: {image.shape} (took {time.time() - load_start:.2f}s)")

        result = {
            'text': '',
            'preprocessedImage': None,
            'preprocessingMetadata': None,
            'results': None
        }

        # Preprocessing
        image_for_ocr = image
        if preprocessing:
            logger.info(f"[REQ {request_id}] Starting preprocessing...")
            preprocess_start = time.time()

            preprocessed, metadata = preprocess_image(image, save_steps_dir=None)
            image_for_ocr = preprocessed

            preprocess_duration = time.time() - preprocess_start
            logger.info(f"[REQ {request_id}] Preprocessing completed in {preprocess_duration:.2f}s")
            logger.info(f"[REQ {request_id}] Preprocessing metadata: {metadata}")

            # Convert to base64
            b64_start = time.time()
            result['preprocessedImage'] = image_to_base64(preprocessed)
            result['preprocessingMetadata'] = metadata
            logger.info(f"[REQ {request_id}] Base64 encoding took {time.time() - b64_start:.2f}s")

        # OCR Processing
        logger.info(f"[REQ {request_id}] Starting OCR with engine: {engine}")
        ocr_start = time.time()

        ocr_results = None
        if engine == 'surya':
            ocr_results = perform_surya_ocr(image_for_ocr, use_cuda=True)
        elif engine == 'paddle':
            ocr_results = perform_paddle_ocr(image_for_ocr, use_cuda=True)
        else:  # hybrid
            ocr_results = perform_hybrid_ocr(image_for_ocr, use_cuda=True)

        ocr_duration = time.time() - ocr_start
        logger.info(f"[REQ {request_id}] OCR completed in {ocr_duration:.2f}s")

        if not ocr_results:
            logger.warning(f"[REQ {request_id}] OCR processing returned no results")
            raise HTTPException(status_code=500, detail="OCR processing returned no results")

        # Extract text
        extract_start = time.time()
        text_content = extract_text_from_results(ocr_results)
        logger.info(f"[REQ {request_id}] Text extraction took {time.time() - extract_start:.2f}s")
        logger.info(f"[REQ {request_id}] Extracted {len(text_content)} characters")

        result['text'] = text_content

        # Clean results for JSON
        json_start = time.time()
        result['results'] = clean_results_for_json(ocr_results)
        logger.info(f"[REQ {request_id}] JSON conversion took {time.time() - json_start:.2f}s")

        total_duration = time.time() - start_time
        logger.info(f"[REQ {request_id}] ========== REQUEST COMPLETED in {total_duration:.2f}s ==========")

        return JSONResponse(content=result)

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"[REQ {request_id}] OCR processing failed: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"OCR processing failed: {str(e)}")

    finally:
        # Cleanup temporary file
        if temp_file_path and temp_file_path.exists():
            try:
                temp_file_path.unlink()
                logger.info(f"[REQ {request_id}] Temporary file cleaned up")
            except Exception as e:
                logger.warning(f"[REQ {request_id}] Failed to cleanup temp file: {e}")


if __name__ == "__main__":
    logger.info("Starting OCR Service on port 7000...")
    uvicorn.run(app, host="0.0.0.0", port=7000)
