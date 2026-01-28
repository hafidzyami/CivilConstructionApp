"""PaddleOCR utilities for document analysis"""

import cv2
import numpy as np
from PIL import Image
from .device_utils import get_device


def perform_paddle_ocr(image, use_cuda=True):
    """
    Perform PaddleOCR text recognition (Korean + Latin only)

    Args:
        image: Input image (numpy array, BGR or grayscale)
        use_cuda: Whether to use CUDA if available

    Returns:
        Dictionary with text lines in Surya-compatible format
    """
    try:
        from paddleocr import PaddleOCR

        device = get_device(prefer_cuda=use_cuda)

        print(f"  > Using {device.upper()} for PaddleOCR")

        # Initialize PaddleOCR with Korean + Latin support
        # GPU is auto-detected if paddlepaddle-gpu is installed
        print("  > Initializing PaddleOCR (Korean + Latin)...")
        ocr = PaddleOCR(
            use_angle_cls=False,        # Disabled: orientation handled by DocImgOrientationClassification in preprocessing
            lang='korean',
            # Adjust thresholds to detect whole lines, not individual characters
            det_db_thresh=0.3,          # Binary threshold for text detection
            det_db_box_thresh=0.6,      # Box threshold (higher = fewer false positives)
            det_db_unclip_ratio=1.8,    # Expand text boxes (higher = larger boxes)
            rec_batch_num=6
        )

        # Convert grayscale to BGR if needed
        if len(image.shape) == 2:
            image_bgr = cv2.cvtColor(image, cv2.COLOR_GRAY2BGR)
        else:
            image_bgr = image

        print("  > Recognizing text...")
        result = ocr.ocr(image_bgr)

        if not result or not result[0]:
            print("  [WARNING] No text detected")
            return None

        # Extract OCRResult object - PaddleOCR 3.0.3 returns OCRResult objects
        ocr_result = result[0]

        # Access the actual OCR data from OCRResult dictionary
        # PaddleOCR 3.0.3 uses: rec_polys, rec_texts, rec_scores
        if 'rec_texts' in ocr_result and 'rec_scores' in ocr_result:
            texts = ocr_result['rec_texts']
            scores = ocr_result['rec_scores']

            print(f"  > PaddleOCR detected {len(texts)} text regions")

            # Debug: Print first 3 detections
            for i in range(min(3, len(texts))):
                print(f"    Line {i+1}: '{texts[i]}' (conf: {scores[i]:.2f})")
        else:
            print(f"  [WARNING] Unexpected OCRResult structure")
            print(f"  Available keys: {list(ocr_result.keys())}")

        # Convert PaddleOCR result to Surya-compatible format
        print("  > Converting to standard format...")
        merged_result = convert_paddle_to_surya_format(ocr_result, image.shape)

        return merged_result

    except Exception as e:
        print(f"  [ERROR] PaddleOCR failed: {e}")
        import traceback
        traceback.print_exc()
        return None


def perform_hybrid_ocr(image, use_cuda=True):
    """
    Hybrid OCR: Sequential execution to save memory
    1. Run Surya (Layout/Tables/Detection)
    2. DELETE Surya models & GC
    3. Run PaddleOCR (Text Recognition)
    """
    try:
        # Import lazily
        from surya.foundation import FoundationPredictor
        from surya.layout import LayoutPredictor
        from surya.table_rec import TableRecPredictor
        from surya.detection import DetectionPredictor
        from paddleocr import PaddleOCR
        from PIL import Image

        # Force CPU if needed (recommended for your Docker setup)
        # device = 'cpu' 
        device = get_device(prefer_cuda=use_cuda)
        print(f"  > Using {device.upper()} for Hybrid OCR")

        # --- STEP 1: PREPARE IMAGE ---
        if len(image.shape) == 2:
            pil_image = Image.fromarray(cv2.cvtColor(image, cv2.COLOR_GRAY2RGB))
        else:
            pil_image = Image.fromarray(cv2.cvtColor(image, cv2.COLOR_BGR2RGB))
        images = [pil_image]

        # --- STEP 2: RUN SURYA (Layout & Tables) ---
        print("  > [SURYA] Initializing Foundation Model...")
        foundation_predictor = FoundationPredictor(device=device)

        print("  > [SURYA] Analyzing layout...")
        layout_predictor = LayoutPredictor(foundation_predictor)
        layout_results = layout_predictor(images)
        
        # Cleanup Layout Predictor immediately
        del layout_predictor
        gc.collect()

        print("  > [SURYA] Recognizing tables...")
        table_predictor = TableRecPredictor(device=device)
        table_results = table_predictor(images)
        
        # Cleanup Table Predictor
        del table_predictor
        gc.collect()

        print("  > [SURYA] Detecting text boxes...")
        detection_predictor = DetectionPredictor(device=device)
        detection_results = detection_predictor(images)

        # Cleanup Detection & Foundation
        del detection_predictor
        del foundation_predictor
        
        # CRITICAL: Force Python to release the RAM back to the OS
        print("  > [MEMORY] Cleaning up Surya models...")
        gc.collect()

        # --- STEP 3: RUN PADDLE (Text Recognition) ---
        print("  > [PADDLE] Initializing OCR...")
        paddle_ocr = PaddleOCR(
            use_angle_cls=False,
            lang='korean',
            show_log=False,        # Reduce log spam
            det_db_thresh=0.3,
            det_db_box_thresh=0.6,
            det_db_unclip_ratio=1.8,
            rec_batch_num=1,       # <--- REDUCED from 6 to 1 to save RAM
            use_mp=True            # Use multi-processing for CPU speed
        )

        if len(image.shape) == 2:
            image_bgr = cv2.cvtColor(image, cv2.COLOR_GRAY2BGR)
        else:
            image_bgr = image

        print("  > [PADDLE] Recognizing text...")
        paddle_result = paddle_ocr.ocr(image_bgr)
        
        # Clean up Paddle
        del paddle_ocr
        gc.collect()

        # --- STEP 4: MERGE ---
        print("  > Merging hybrid results...")
        merged_result = merge_hybrid_results(
            layout_results[0],
            table_results[0],
            detection_results[0],
            paddle_result[0] if paddle_result and paddle_result[0] else []
        )

        return merged_result

    except Exception as e:
        print(f"  [ERROR] Hybrid OCR failed: {e}")
        import traceback
        traceback.print_exc()
        return None


def convert_paddle_to_surya_format(paddle_result, image_shape):
    """Convert PaddleOCR result to Surya-compatible format

    PaddleOCR 3.0.3 returns OCRResult objects with:
    - rec_polys: list of polygon coordinates
    - rec_texts: list of recognized text strings
    - rec_scores: list of confidence scores
    """
    merged = {
        'layout': {'regions': []},
        'tables': [],
        'text_lines': []
    }

    # PaddleOCR doesn't have layout/table detection, so we create a single "Paragraph" region
    height, width = image_shape[:2]
    merged['layout']['regions'].append({
        'bbox': [0, 0, width, height],
        'type': 'Paragraph'
    })

    # Process PaddleOCR result
    try:
        # Check if paddle_result is an OCRResult object (PaddleOCR 3.0.3)
        if hasattr(paddle_result, 'keys') and 'rec_polys' in paddle_result and 'rec_texts' in paddle_result and 'rec_scores' in paddle_result:
            boxes = paddle_result['rec_polys']
            texts = paddle_result['rec_texts']
            scores = paddle_result['rec_scores']

            # Process each detected text line
            for i in range(len(texts)):
                try:
                    bbox_points = boxes[i]  # [[x1,y1], [x2,y2], [x3,y3], [x4,y4]]
                    text = texts[i]
                    confidence = float(scores[i])

                    # Convert polygon to bounding box [x_min, y_min, x_max, y_max]
                    x_coords = [float(point[0]) for point in bbox_points]
                    y_coords = [float(point[1]) for point in bbox_points]

                    bbox = [min(x_coords), min(y_coords), max(x_coords), max(y_coords)]

                    merged['text_lines'].append({
                        'text': text,
                        'bbox': bbox,
                        'confidence': confidence,
                        'region_type': 'Paragraph'
                    })

                except Exception as e:
                    print(f"  [WARNING] Skipping line due to error: {e}")
                    continue

        else:
            # Fallback: Try old PaddleOCR format (list of [bbox, (text, confidence)])
            for line in paddle_result:
                try:
                    if not line or len(line) < 2:
                        continue

                    bbox_points = line[0]  # [[x1,y1], [x2,y2], [x3,y3], [x4,y4]]
                    text_info = line[1]    # ('text', confidence)

                    # Extract text and confidence
                    text = text_info[0] if isinstance(text_info, (list, tuple)) and len(text_info) > 0 else str(text_info)
                    confidence = float(text_info[1]) if isinstance(text_info, (list, tuple)) and len(text_info) > 1 else 1.0

                    # Convert polygon to bounding box [x_min, y_min, x_max, y_max]
                    x_coords = [float(point[0]) for point in bbox_points]
                    y_coords = [float(point[1]) for point in bbox_points]

                    bbox = [min(x_coords), min(y_coords), max(x_coords), max(y_coords)]

                    merged['text_lines'].append({
                        'text': text,
                        'bbox': bbox,
                        'confidence': confidence,
                        'region_type': 'Paragraph'
                    })

                except Exception as e:
                    print(f"  [WARNING] Skipping line due to error: {e}")
                    continue

    except Exception as e:
        print(f"  [ERROR] Failed to parse PaddleOCR result: {e}")
        import traceback
        traceback.print_exc()

    return merged


def merge_hybrid_results(layout_result, table_result, detection_result, paddle_result):
    """Merge Surya layout/tables with PaddleOCR text recognition"""
    merged = {
        'layout': {'regions': []},
        'tables': [],
        'text_lines': []
    }

    # Add Surya layout regions
    if hasattr(layout_result, 'bboxes'):
        for bbox_obj in layout_result.bboxes:
            merged['layout']['regions'].append({
                'bbox': bbox_obj.bbox,
                'type': bbox_obj.label
            })

    # Add Surya table detections
    if hasattr(table_result, 'bboxes'):
        for bbox_obj in table_result.bboxes:
            merged['tables'].append({
                'bbox': bbox_obj.bbox,
                'confidence': getattr(bbox_obj, 'confidence', 1.0)
            })

    # Add PaddleOCR text lines
    # PaddleOCR 3.0.3 returns OCRResult objects (dict-like)
    if paddle_result:
        try:
            # Check if paddle_result is an OCRResult object (PaddleOCR 3.0.3) - dictionary-based access
            # PaddleOCR 3.0.3 uses: rec_polys, rec_texts, rec_scores
            if hasattr(paddle_result, 'keys') and 'rec_polys' in paddle_result and 'rec_texts' in paddle_result and 'rec_scores' in paddle_result:
                boxes = paddle_result['rec_polys']
                texts = paddle_result['rec_texts']
                scores = paddle_result['rec_scores']

                # Process each detected text line
                for i in range(len(texts)):
                    try:
                        bbox_points = boxes[i]  # [[x1,y1], [x2,y2], [x3,y3], [x4,y4]]
                        text = texts[i]
                        confidence = float(scores[i])

                        # Convert polygon to bounding box [x_min, y_min, x_max, y_max]
                        x_coords = [float(point[0]) for point in bbox_points]
                        y_coords = [float(point[1]) for point in bbox_points]

                        line_bbox = [min(x_coords), min(y_coords), max(x_coords), max(y_coords)]

                        # Find best matching region from Surya layout
                        best_region = find_best_region(line_bbox, merged['layout']['regions'])

                        merged['text_lines'].append({
                            'text': text,
                            'bbox': line_bbox,
                            'confidence': confidence,
                            'region_type': best_region['type'] if best_region else 'Unknown'
                        })

                    except Exception as e:
                        print(f"  [WARNING] Skipping line in hybrid mode: {e}")
                        continue

            else:
                # Fallback: Try old PaddleOCR format (list of [bbox, (text, confidence)])
                # This handles the old API format if needed
                for line in paddle_result:
                    try:
                        if not line or len(line) < 2:
                            continue

                        bbox_points = line[0]  # [[x1,y1], [x2,y2], [x3,y3], [x4,y4]]
                        text_info = line[1]    # ('text', confidence)

                        # Extract text and confidence
                        text = text_info[0] if isinstance(text_info, (list, tuple)) and len(text_info) > 0 else str(text_info)
                        confidence = float(text_info[1]) if isinstance(text_info, (list, tuple)) and len(text_info) > 1 else 1.0

                        # Convert polygon to bounding box [x_min, y_min, x_max, y_max]
                        x_coords = [float(point[0]) for point in bbox_points]
                        y_coords = [float(point[1]) for point in bbox_points]

                        line_bbox = [min(x_coords), min(y_coords), max(x_coords), max(y_coords)]

                        # Find best matching region from Surya layout
                        best_region = find_best_region(line_bbox, merged['layout']['regions'])

                        merged['text_lines'].append({
                            'text': text,
                            'bbox': line_bbox,
                            'confidence': confidence,
                            'region_type': best_region['type'] if best_region else 'Unknown'
                        })

                    except Exception as e:
                        print(f"  [WARNING] Skipping line in hybrid mode: {e}")
                        continue

        except Exception as e:
            print(f"  [ERROR] Failed to parse PaddleOCR result in hybrid mode: {e}")
            import traceback
            traceback.print_exc()

    return merged


def find_best_region(line_bbox, regions):
    """Find the region with highest overlap for a text line"""
    best_region = None
    best_overlap = 0

    for region in regions:
        region_bbox = region['bbox']
        overlap = calculate_overlap(line_bbox, region_bbox)

        if overlap > best_overlap:
            best_overlap = overlap
            best_region = region

    return best_region


def calculate_overlap(bbox1, bbox2):
    """Calculate overlap between two bounding boxes"""
    x1_min, y1_min, x1_max, y1_max = bbox1
    x2_min, y2_min, x2_max, y2_max = bbox2

    x_overlap = max(0, min(x1_max, x2_max) - max(x1_min, x2_min))
    y_overlap = max(0, min(y1_max, y2_max) - max(y1_min, y2_min))

    overlap_area = x_overlap * y_overlap
    bbox1_area = (x1_max - x1_min) * (y1_max - y1_min)

    if bbox1_area == 0:
        return 0

    return overlap_area / bbox1_area
