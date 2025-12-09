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
            use_angle_cls=True,
            lang='korean',
            det_db_thresh=0.3,
            det_db_box_thresh=0.5,
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

        # Convert PaddleOCR result to Surya-compatible format
        print("  > Converting to standard format...")
        merged_result = convert_paddle_to_surya_format(result[0], image.shape)

        return merged_result

    except Exception as e:
        print(f"  [ERROR] PaddleOCR failed: {e}")
        import traceback
        traceback.print_exc()
        return None


def perform_hybrid_ocr(image, use_cuda=True):
    """
    Hybrid OCR: Surya for layout/table/bbox analysis, PaddleOCR for text recognition

    Args:
        image: Input image (numpy array, BGR or grayscale)
        use_cuda: Whether to use CUDA if available

    Returns:
        Dictionary with Surya layout/tables + PaddleOCR text
    """
    try:
        from surya.foundation import FoundationPredictor
        from surya.layout import LayoutPredictor
        from surya.table_rec import TableRecPredictor
        from surya.detection import DetectionPredictor
        from paddleocr import PaddleOCR
        from PIL import Image

        device = get_device(prefer_cuda=use_cuda)

        print(f"  > Using {device.upper()} for Hybrid OCR")

        # Convert to PIL for Surya
        if len(image.shape) == 2:
            pil_image = Image.fromarray(cv2.cvtColor(image, cv2.COLOR_GRAY2RGB))
        else:
            pil_image = Image.fromarray(cv2.cvtColor(image, cv2.COLOR_BGR2RGB))

        images = [pil_image]

        # Step 1: Surya for layout and table detection
        print("  > [SURYA] Initializing models...")
        foundation_predictor = FoundationPredictor(device=device)

        print("  > [SURYA] Analyzing layout...")
        layout_predictor = LayoutPredictor(foundation_predictor)
        layout_results = layout_predictor(images)

        print("  > [SURYA] Detecting tables...")
        table_predictor = TableRecPredictor(device=device)
        table_results = table_predictor(images)

        print("  > [SURYA] Detecting text bounding boxes...")
        detection_predictor = DetectionPredictor(device=device)
        detection_results = detection_predictor(images)

        # Step 2: PaddleOCR for text recognition
        # GPU is auto-detected if paddlepaddle-gpu is installed
        print("  > [PADDLE] Initializing OCR (Korean + Latin)...")
        paddle_ocr = PaddleOCR(
            use_angle_cls=True,
            lang='korean',
            det_db_thresh=0.3,
            det_db_box_thresh=0.5,
            rec_batch_num=6
        )

        # Convert grayscale to BGR if needed
        if len(image.shape) == 2:
            image_bgr = cv2.cvtColor(image, cv2.COLOR_GRAY2BGR)
        else:
            image_bgr = image

        print("  > [PADDLE] Recognizing text...")
        paddle_result = paddle_ocr.ocr(image_bgr)

        # Step 3: Merge Surya layout + PaddleOCR text
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
    """Convert PaddleOCR result to Surya-compatible format"""
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

    # Extract data from OCRResult object
    # PaddleOCR returns an OCRResult object with attributes:
    # - rec_texts: list of recognized texts
    # - rec_scores: list of confidence scores
    # - rec_polys: list of bounding box polygons

    try:
        # Access OCRResult attributes (dictionary-like object)
        texts = paddle_result['rec_texts'] if 'rec_texts' in paddle_result else []
        scores = paddle_result['rec_scores'] if 'rec_scores' in paddle_result else []
        polys = paddle_result['rec_polys'] if 'rec_polys' in paddle_result else []

        # Process each detected text line
        for idx in range(len(texts)):
            try:
                text = texts[idx]
                confidence = float(scores[idx]) if idx < len(scores) else 1.0
                bbox_points = polys[idx] if idx < len(polys) else None

                if bbox_points is None:
                    continue

                # Convert polygon to bounding box [x_min, y_min, x_max, y_max]
                # bbox_points is typically a list/array of [x, y] coordinates
                # Handle numpy arrays as well as lists
                if hasattr(bbox_points, '__len__') and len(bbox_points) > 0:
                    # Flatten if needed and extract x, y coordinates
                    x_coords = []
                    y_coords = []

                    for point in bbox_points:
                        # Handle numpy arrays, lists, and tuples
                        if hasattr(point, '__len__') and len(point) >= 2:
                            x_coords.append(float(point[0]))
                            y_coords.append(float(point[1]))

                    if not x_coords or not y_coords:
                        continue

                    bbox = [min(x_coords), min(y_coords), max(x_coords), max(y_coords)]

                    merged['text_lines'].append({
                        'text': text,
                        'bbox': bbox,
                        'confidence': confidence,
                        'region_type': 'Paragraph'
                    })

            except Exception as e:
                continue

    except Exception as e:
        print(f"  [ERROR] Failed to parse OCRResult: {e}")
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
    # PaddleOCR returns an OCRResult object (dictionary-like) with:
    # - rec_texts: list of recognized texts
    # - rec_scores: list of confidence scores
    # - rec_polys: list of bounding box polygons
    if paddle_result:
        try:
            # Extract data from OCRResult object
            texts = paddle_result['rec_texts'] if 'rec_texts' in paddle_result else []
            scores = paddle_result['rec_scores'] if 'rec_scores' in paddle_result else []
            polys = paddle_result['rec_polys'] if 'rec_polys' in paddle_result else []

            # Process each detected text line
            for idx in range(len(texts)):
                try:
                    text = texts[idx]
                    confidence = float(scores[idx]) if idx < len(scores) else 1.0
                    bbox_points = polys[idx] if idx < len(polys) else None

                    if bbox_points is None:
                        continue

                    # Convert polygon to bounding box [x_min, y_min, x_max, y_max]
                    # Handle numpy arrays as well as lists/tuples
                    if hasattr(bbox_points, '__len__') and len(bbox_points) > 0:
                        x_coords = []
                        y_coords = []

                        for point in bbox_points:
                            # Handle numpy arrays, lists, and tuples
                            if hasattr(point, '__len__') and len(point) >= 2:
                                x_coords.append(float(point[0]))
                                y_coords.append(float(point[1]))

                        if not x_coords or not y_coords:
                            continue

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
