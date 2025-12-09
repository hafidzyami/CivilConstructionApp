"""Surya OCR utilities for document analysis"""

import cv2
import json
from PIL import Image
from .device_utils import get_device


def perform_ocr(image, use_cuda=True):
    """
    Perform Surya OCR on image (Layout + Table + Text Recognition)

    Args:
        image: Input image (numpy array, BGR or grayscale)
        use_cuda: Whether to use CUDA if available

    Returns:
        Dictionary with layout regions, tables, and text lines
    """
    try:
        from surya.foundation import FoundationPredictor
        from surya.layout import LayoutPredictor
        from surya.table_rec import TableRecPredictor
        from surya.detection import DetectionPredictor
        from surya.recognition import RecognitionPredictor
        import torch

        device = get_device(prefer_cuda=use_cuda)
        print(f"  > Using {device.upper()} for Surya OCR")

        if len(image.shape) == 2:
            pil_image = Image.fromarray(cv2.cvtColor(image, cv2.COLOR_GRAY2RGB))
        else:
            pil_image = Image.fromarray(cv2.cvtColor(image, cv2.COLOR_BGR2RGB))

        images = [pil_image]

        print("  > Initializing models...")
        foundation_predictor = FoundationPredictor(device=device)

        print("  > Analyzing layout...")
        layout_predictor = LayoutPredictor(foundation_predictor)
        layout_results = layout_predictor(images)

        print("  > Detecting tables...")
        table_predictor = TableRecPredictor(device=device)
        table_results = table_predictor(images)

        print("  > Detecting text...")
        detection_predictor = DetectionPredictor(device=device)
        detection_results = detection_predictor(images)

        print("  > Recognizing text...")
        recognition_predictor = RecognitionPredictor(foundation_predictor)
        ocr_results = recognition_predictor(images, det_predictor=detection_predictor)

        print("  > Merging results...")
        merged_result = merge_results(layout_results[0], table_results[0], ocr_results[0])

        return merged_result

    except Exception as e:
        print(f"  [ERROR] Surya OCR failed: {e}")
        import traceback
        traceback.print_exc()
        return None


def merge_results(layout_result, table_result, ocr_result):
    """Merge Surya layout, table, and OCR results"""
    merged = {
        'layout': {'regions': []},
        'tables': [],
        'text_lines': []
    }

    if hasattr(layout_result, 'bboxes'):
        for bbox_obj in layout_result.bboxes:
            merged['layout']['regions'].append({
                'bbox': bbox_obj.bbox,
                'type': bbox_obj.label
            })

    if hasattr(table_result, 'bboxes'):
        for bbox_obj in table_result.bboxes:
            merged['tables'].append({
                'bbox': bbox_obj.bbox,
                'confidence': getattr(bbox_obj, 'confidence', 1.0)
            })

    if hasattr(ocr_result, 'text_lines'):
        for line in ocr_result.text_lines:
            line_bbox = line.bbox
            text = line.text

            best_region = find_best_region(line_bbox, merged['layout']['regions'])

            merged['text_lines'].append({
                'text': text,
                'bbox': line_bbox,
                'confidence': getattr(line, 'confidence', 1.0),
                'region_type': best_region['type'] if best_region else 'Unknown'
            })

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


def extract_text(ocr_results):
    """Extract plain text from OCR results"""
    text_lines = []
    for line in ocr_results.get('text_lines', []):
        text_lines.append(line.get('text', ''))
    return '\n'.join(text_lines)


def group_by_region(ocr_results):
    """Group text lines by region type"""
    grouped = {}
    for line in ocr_results.get('text_lines', []):
        region_type = line.get('region_type', 'Unknown')
        if region_type not in grouped:
            grouped[region_type] = []
        grouped[region_type].append(line.get('text', ''))
    return grouped


def save_results(ocr_results, output_dir, filename_base):
    """Save OCR results in multiple formats"""
    from pathlib import Path

    output_dir = Path(output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)

    json_path = output_dir / f"{filename_base}_results.json"
    with open(json_path, 'w', encoding='utf-8') as f:
        json.dump(ocr_results, f, ensure_ascii=False, indent=2)
    print(f"[SAVED] JSON results: {json_path}")

    text_path = output_dir / f"{filename_base}_text.txt"
    text_content = extract_text(ocr_results)
    with open(text_path, 'w', encoding='utf-8') as f:
        f.write(text_content)
    print(f"[SAVED] Plain text: {text_path}")

    region_dir = output_dir / "text_by_region"
    region_dir.mkdir(exist_ok=True)
    grouped = group_by_region(ocr_results)
    for region_type, texts in grouped.items():
        region_file = region_dir / f"{region_type}.txt"
        with open(region_file, 'w', encoding='utf-8') as f:
            f.write('\n'.join(texts))
    print(f"[SAVED] Text by region: {region_dir}")

    return json_path, text_path
