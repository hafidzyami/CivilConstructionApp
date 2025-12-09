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
    """Extract plain text from OCR results"""
    if not ocr_results or 'text_lines' not in ocr_results:
        return ""

    text_lines = []
    for line in ocr_results['text_lines']:
        if 'text' in line:
            text_lines.append(line['text'])

    return '\n'.join(text_lines)


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
        image = cv2.imread(str(image_path))
        if image is None:
            result['error'] = f'Failed to load image: {image_path}'
            return result

        # Preprocessing
        if use_preprocessing:
            try:
                preprocessed, metadata = preprocess_image(image, save_steps_dir=None)
                image_for_ocr = preprocessed
                result['metadata'] = {
                    'steps_completed': metadata.get('steps_completed', []),
                    'rotation_applied': metadata.get('rotation_applied', 0.0),
                    'original_size': list(metadata.get('original_size', [])),
                    'final_size': list(metadata.get('final_size', []))
                }
                # Convert preprocessed image to base64
                result['preprocessedImage'] = image_to_base64(preprocessed)
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
        if engine == 'surya':
            ocr_results = perform_ocr(image_for_ocr, use_cuda=True)
        elif engine == 'paddle':
            ocr_results = perform_paddle_ocr(image_for_ocr, use_cuda=True)
        else:  # hybrid
            ocr_results = perform_hybrid_ocr(image_for_ocr, use_cuda=True)

        if not ocr_results:
            result['error'] = 'OCR processing returned no results'
            return result

        # Extract text content
        text_content = extract_text_from_results(ocr_results)
        result['textContent'] = text_content

        # Store OCR results (convert numpy arrays to lists for JSON serialization)
        result['results'] = clean_results_for_json(ocr_results)
        result['success'] = True

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
