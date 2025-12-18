"""Input/Output utilities for file handling"""

import os
import sys
import cv2
from pathlib import Path
from datetime import datetime


def get_input_path():
    """
    Prompt user for input file path

    Returns:
        Path object of the input file
    """
    print("\n" + "=" * 60)
    print("OCR PIPELINE - Input Required")
    print("=" * 60)

    while True:
        print("\nEnter image file path:")
        print("  - Full path: D:\\Photos\\document.jpg")
        print("  - Relative path: document.jpg (relative to OCR folder)")
        print("  - Type 'exit' to quit")

        file_path = input("\nFile path: ").strip().strip('"').strip("'")

        if file_path.lower() == 'exit':
            print("Exiting...")
            sys.exit(0)

        if not os.path.isabs(file_path):
            ocr_folder = Path(__file__).parent.parent
            full_path = ocr_folder / file_path
        else:
            full_path = Path(file_path)

        valid_extensions = ['.jpg', '.jpeg', '.png', '.bmp', '.tiff', '.tif']
        if full_path.exists() and full_path.suffix.lower() in valid_extensions:
            print(f"[OK] Found: {full_path}")
            return full_path
        else:
            print(f"[ERROR] File not found or invalid format: {full_path}")
            print("Supported formats: JPG, PNG, BMP, TIFF")
            print("Please try again.\n")


def ask_preprocessing_option():
    """
    Ask user if they want to run preprocessing

    Returns:
        bool: True if user wants preprocessing, False otherwise
    """
    print("\n" + "=" * 60)
    print("PREPROCESSING OPTION")
    print("=" * 60)
    print("\nDo you want to run preprocessing on the image?")
    print("  - YES: Run 5-step preprocessing (rotation/skew correction)")
    print("  - NO:  Skip preprocessing and run OCR directly on original image")

    while True:
        choice = input("\nRun preprocessing? (y/n): ").strip().lower()

        if choice in ['y', 'yes']:
            print("[SELECTED] Running with preprocessing")
            return True
        elif choice in ['n', 'no']:
            print("[SELECTED] Skipping preprocessing")
            return False
        else:
            print("[ERROR] Please enter 'y' for yes or 'n' for no")


def ask_ocr_engine():
    """
    Ask user which OCR engine to use

    Returns:
        str: 'surya', 'paddle', or 'hybrid'
    """
    print("\n" + "=" * 60)
    print("OCR ENGINE SELECTION")
    print("=" * 60)
    print("\nChoose OCR engine:")
    print("  1. SURYA   - Surya OCR (layout + tables + text, all languages)")
    print("  2. PADDLE  - PaddleOCR text recognition (Korean + Latin only)")
    print("  3. HYBRID  - Surya layout/tables + PaddleOCR text (RECOMMENDED)")

    while True:
        choice = input("\nSelect OCR engine (1/2/3): ").strip()

        if choice == '1':
            print("[SELECTED] Surya OCR")
            return 'surya'
        elif choice == '2':
            print("[SELECTED] PaddleOCR")
            return 'paddle'
        elif choice == '3':
            print("[SELECTED] Hybrid (Surya + PaddleOCR)")
            return 'hybrid'
        else:
            print("[ERROR] Please enter 1, 2, or 3")


def create_output_directory(input_path):
    """
    Create output directory for results

    Args:
        input_path: Path to input file

    Returns:
        Path to output directory
    """
    ocr_folder = Path(__file__).parent.parent
    output_base = ocr_folder / "output"

    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    output_dir = output_base / f"{input_path.stem}_{timestamp}"

    output_dir.mkdir(parents=True, exist_ok=True)

    steps_dir = output_dir / "preprocessing_steps"
    steps_dir.mkdir(exist_ok=True)

    return output_dir, steps_dir


def load_image(image_path):
    """
    Load image from file

    Args:
        image_path: Path to image file

    Returns:
        Image as numpy array or None if failed
    """
    print(f"\n[LOADING] Reading image...")
    image = cv2.imread(str(image_path))

    if image is None:
        print(f"[ERROR] Failed to read image: {image_path}")
        return None

    print(f"  > Size: {image.shape[1]}x{image.shape[0]} pixels")
    return image


def save_preprocessed_image(image, output_dir, filename_base):
    """Save preprocessed image"""
    output_path = output_dir / f"{filename_base}_preprocessed.png"
    cv2.imwrite(str(output_path), image)
    print(f"[SAVED] Preprocessed image: {output_path}")
    return output_path


def save_summary(metadata, ocr_results, output_dir, input_path, ocr_engine='surya'):
    """Save processing summary"""
    import json

    num_text_lines = len(ocr_results.get('text_lines', [])) if ocr_results else 0
    num_regions = len(ocr_results.get('layout', {}).get('regions', [])) if ocr_results else 0
    num_tables = len(ocr_results.get('tables', [])) if ocr_results else 0

    text_lines = ocr_results.get('text_lines', []) if ocr_results else []
    avg_confidence = sum(line.get('confidence', 0) for line in text_lines) / len(text_lines) if text_lines else 0

    summary = {
        'input_image': str(input_path),
        'output_directory': str(output_dir),
        'preprocessing': {
            'steps_completed': metadata['steps_completed'],
            'rotation_applied': metadata['rotation_applied'],
            'original_size': list(metadata['original_size']),
            'final_size': list(metadata['final_size'])
        },
        'ocr': {
            'engine': ocr_engine,
            'layout_regions': num_regions,
            'tables_detected': num_tables,
            'text_lines': num_text_lines,
            'avg_confidence': avg_confidence
        }
    }

    summary_path = output_dir / "summary.json"
    with open(summary_path, 'w', encoding='utf-8') as f:
        json.dump(summary, f, ensure_ascii=False, indent=2)
    print(f"[SAVED] Summary: {summary_path}")

    return summary


def print_summary(metadata, ocr_results, input_path, ocr_engine='surya'):
    """Print processing summary to console"""
    print("\n" + "=" * 60)
    print("PROCESSING SUMMARY")
    print("=" * 60)
    print(f"Input: {input_path.name}")

    print(f"\nPreprocessing:")
    print(f"  Steps completed: {len(metadata['steps_completed'])}")
    print(f"  Steps: {', '.join(metadata['steps_completed']) if metadata['steps_completed'] else 'None'}")
    print(f"  Rotation applied: {metadata['rotation_applied']:.1f}°")
    print(f"  Size: {metadata['original_size'][:2]} -> {metadata['final_size'][:2]}")

    if ocr_results:
        num_text_lines = len(ocr_results.get('text_lines', []))
        num_regions = len(ocr_results.get('layout', {}).get('regions', []))
        num_tables = len(ocr_results.get('tables', []))

        text_lines = ocr_results.get('text_lines', [])
        avg_confidence = sum(line.get('confidence', 0) for line in text_lines) / len(text_lines) if text_lines else 0

        print(f"\nOCR Results:")
        print(f"  Engine: {ocr_engine.upper()}")
        print(f"  Layout regions: {num_regions}")
        print(f"  Tables detected: {num_tables}")
        print(f"  Text lines: {num_text_lines}")
        if text_lines:
            print(f"  Average confidence: {avg_confidence:.2%}")

    print("=" * 60)
