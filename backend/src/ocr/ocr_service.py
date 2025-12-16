"""
OCR Service Wrapper
Handles OCR processing and returns results as JSON
Called from Node.js backend
"""

import sys
import json
import cv2
import base64
from pathlib import Path
import io
import time

# Configure stdout to use UTF-8 encoding (for Korean text)
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

# Add modules directory to path
sys.path.insert(0, str(Path(__file__).parent / 'modules'))

from modules.preprocessing import preprocess_image
from modules.surya_utils import perform_ocr
from modules.paddle_utils import perform_paddle_ocr, perform_hybrid_ocr


def image_to_base64(image):
    """Convert image to base64 string"""
    try:
        _, buffer = cv2.imencode('.png', image)
        return base64.b64encode(buffer).decode('utf-8')
    except Exception as e:
        return None


def extract_text_from_results(ocr_results):
    """Extract plain text from OCR results, sorted by position"""
    if not ocr_results or 'text_lines' not in ocr_results:
        return ""

    text_lines = []
    for line in ocr_results['text_lines']:
        if 'text' in line and 'bbox' in line:
            # Store text with vertical position (y coordinate)
            bbox = line['bbox']
            y_pos = bbox[1] if len(bbox) >= 2 else 0  # y_min
            x_pos = bbox[0] if len(bbox) >= 1 else 0  # x_min
            text_lines.append({
                'text': line['text'],
                'y': y_pos,
                'x': x_pos
            })

    # Sort by vertical position (top to bottom), then horizontal (left to right)
    text_lines.sort(key=lambda item: (item['y'], item['x']))

    # Group lines that are on the same horizontal level (same line)
    # and join them with space instead of newline
    if not text_lines:
        return ""

    grouped_lines = []
    current_line_group = []
    current_y = text_lines[0]['y']
    y_threshold = 20  # pixels - lines within this range are considered same line

    for item in text_lines:
        # If this text is on roughly the same horizontal level, add to current group
        if abs(item['y'] - current_y) < y_threshold:
            current_line_group.append(item['text'])
        else:
            # New line detected, save current group and start new one
            if current_line_group:
                grouped_lines.append(' '.join(current_line_group))
            current_line_group = [item['text']]
            current_y = item['y']

    # Don't forget the last group
    if current_line_group:
        grouped_lines.append(' '.join(current_line_group))

    return '\n'.join(grouped_lines)


def process_ocr(image_path, use_preprocessing=True, engine='hybrid'):
    """
    Process OCR on an image

    Args:
        image_path: Path to input image
        use_preprocessing: Whether to apply preprocessing
        engine: OCR engine to use ('surya', 'paddle', 'hybrid')

    Returns:
        JSON result with OCR data
    """
    total_start = time.time()
    result = {
        'success': False,
        'textContent': '',
        'results': None,
        'preprocessedImage': None,
        'metadata': None,
        'error': None
    }

    try:
        # Load image
        load_start = time.time()
        image = cv2.imread(str(image_path))
        if image is None:
            result['error'] = f'Failed to load image: {image_path}'
            return result
        print(f"[TIMING] Image load: {time.time() - load_start:.2f}s", file=sys.stderr)

        # Preprocessing
        if use_preprocessing:
            try:
                preprocess_start = time.time()
                preprocessed, metadata = preprocess_image(image, save_steps_dir=None)
                image_for_ocr = preprocessed
                result['metadata'] = {
                    'steps_completed': metadata.get('steps_completed', []),
                    'rotation_applied': metadata.get('rotation_applied', 0.0),
                    'original_size': list(metadata.get('original_size', [])),
                    'final_size': list(metadata.get('final_size', []))
                }
                # Convert preprocessed image to base64
                b64_start = time.time()
                result['preprocessedImage'] = image_to_base64(preprocessed)
                print(f"[TIMING] Base64 encode: {time.time() - b64_start:.2f}s", file=sys.stderr)
                print(f"[TIMING] Preprocessing total: {time.time() - preprocess_start:.2f}s", file=sys.stderr)
            except Exception as e:
                print(f"[WARNING] Preprocessing failed: {e}", file=sys.stderr)
                image_for_ocr = image
                result['metadata'] = {'preprocessing_error': str(e)}
        else:
            image_for_ocr = image
            result['metadata'] = {
                'steps_completed': [],
                'rotation_applied': 0.0
            }

        # OCR Processing
        print(f"[TIMING] Starting OCR with engine: {engine}", file=sys.stderr)
        ocr_start = time.time()

        if engine == 'surya':
            ocr_results = perform_ocr(image_for_ocr, use_cuda=True)
        elif engine == 'paddle':
            ocr_results = perform_paddle_ocr(image_for_ocr, use_cuda=True)
        else:  # hybrid
            ocr_results = perform_hybrid_ocr(image_for_ocr, use_cuda=True)

        ocr_duration = time.time() - ocr_start
        print(f"[TIMING] OCR processing: {ocr_duration:.2f}s", file=sys.stderr)

        if not ocr_results:
            result['error'] = 'OCR processing returned no results'
            print(f"[DEBUG] OCR returned None or empty", file=sys.stderr)
            return result

        # Check if text_lines exists and has content
        if 'text_lines' not in ocr_results:
            result['error'] = 'OCR results missing text_lines key'
            print(f"[DEBUG] Missing text_lines. Keys: {ocr_results.keys()}", file=sys.stderr)
            return result

        if not ocr_results['text_lines']:
            result['error'] = 'OCR processing found no text lines'
            print(f"[DEBUG] text_lines is empty", file=sys.stderr)
            return result

        print(f"[DEBUG] Found {len(ocr_results['text_lines'])} text lines", file=sys.stderr)

        # Extract text content
        extract_start = time.time()
        text_content = extract_text_from_results(ocr_results)
        result['textContent'] = text_content
        print(f"[TIMING] Text extraction: {time.time() - extract_start:.2f}s", file=sys.stderr)

        # Store OCR results (convert numpy arrays to lists for JSON serialization)
        json_start = time.time()
        result['results'] = clean_results_for_json(ocr_results)
        result['success'] = True
        print(f"[TIMING] JSON conversion: {time.time() - json_start:.2f}s", file=sys.stderr)

        total_duration = time.time() - total_start
        print(f"[TIMING] ⏱️  Python total time: {total_duration:.2f}s", file=sys.stderr)

        return result

    except Exception as e:
        result['error'] = f'OCR processing failed: {str(e)}'
        import traceback
        print(traceback.format_exc(), file=sys.stderr)
        return result


def clean_results_for_json(data):
    """Convert numpy arrays and other non-JSON types to JSON-serializable types"""
    import numpy as np

    if isinstance(data, np.ndarray):
        return data.tolist()
    elif isinstance(data, dict):
        return {key: clean_results_for_json(value) for key, value in data.items()}
    elif isinstance(data, list):
        return [clean_results_for_json(item) for item in data]
    elif isinstance(data, (np.integer, np.floating)):
        return float(data)
    elif isinstance(data, np.bool_):
        return bool(data)
    else:
        return data


def main():
    """Main entry point"""
    if len(sys.argv) < 4:
        print(json.dumps({
            'success': False,
            'error': 'Usage: python ocr_service.py <image_path> <use_preprocessing> <engine>'
        }))
        sys.exit(1)

    image_path = sys.argv[1]
    use_preprocessing = sys.argv[2].lower() == 'true'
    engine = sys.argv[3]

    # Redirect stdout to stderr during processing to suppress progress messages
    # Only the final JSON result should go to stdout
    original_stdout = sys.stdout
    sys.stdout = sys.stderr

    try:
        result = process_ocr(image_path, use_preprocessing, engine)
    finally:
        # Restore stdout for JSON output
        sys.stdout = original_stdout

    # Output JSON result to stdout
    print(json.dumps(result, ensure_ascii=False))


if __name__ == '__main__':
    main()
