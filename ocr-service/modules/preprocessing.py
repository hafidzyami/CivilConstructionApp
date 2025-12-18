"""Image preprocessing pipeline for OCR optimization"""

import cv2
import numpy as np
from .device_utils import check_paddle_gpu_available, get_device


def resize_if_needed(image, max_dimension=2000):
    """Resize image if dimensions exceed maximum"""
    height, width = image.shape[:2]

    if max(height, width) <= max_dimension:
        return image, 1.0

    if height > width:
        scale = max_dimension / height
        new_height = max_dimension
        new_width = int(width * scale)
    else:
        scale = max_dimension / width
        new_width = max_dimension
        new_height = int(height * scale)

    resized = cv2.resize(image, (new_width, new_height), interpolation=cv2.INTER_AREA)
    print(f"  > Resized from {width}x{height} to {new_width}x{new_height}")

    return resized, scale


def convert_to_grayscale(image):
    """Convert BGR image to grayscale"""
    if len(image.shape) == 3:
        return cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
    return image


def reduce_noise(image, method='light'):
    """Remove noise while preserving edges"""
    if method == 'light':
        return cv2.bilateralFilter(image, d=5, sigmaColor=30, sigmaSpace=30)
    elif method == 'bilateral':
        return cv2.bilateralFilter(image, d=9, sigmaColor=75, sigmaSpace=75)
    elif method == 'none':
        return image
    else:
        return cv2.GaussianBlur(image, (3, 3), 0)


def detect_orientation(image):
    """
    Detect document orientation using PaddleOCR DocImgOrientationClassification

    Args:
        image: Input image (BGR or grayscale numpy array)

    Returns:
        tuple: (correction_angle, confidence)
            - correction_angle: Angle to rotate for correction (0, 90, 180, 270)
            - confidence: Detection confidence (0.0 to 1.0)
    """
    try:
        from paddleocr import DocImgOrientationClassification
        import tempfile
        import os

        device = get_device()

        # Save image temporarily (DocImgOrientationClassification requires file path)
        with tempfile.NamedTemporaryFile(suffix='.png', delete=False) as tmp_file:
            temp_path = tmp_file.name
            cv2.imwrite(temp_path, image)

        try:
            # Initialize orientation classifier
            model = DocImgOrientationClassification(
                model_name="PP-LCNet_x1_0_doc_ori",
                device=device
            )

            # Predict orientation
            output = model.predict(temp_path, batch_size=1)

            # Parse result - PaddleOCR 3.0.3 returns TopkResult objects (dict-like)
            for res in output:
                # Debug: Print the full result structure
                print(f"  > Debug: Full result = {res}")
                print(f"  > Debug: Type = {type(res)}")
                print(f"  > Debug: Has 'res' key = {('res' in res) if hasattr(res, '__contains__') else 'N/A'}")

                # Extract results from TopkResult dictionary
                # TopkResult can be accessed via .get() method
                res_data = res.get('res', res)
                class_id = int(res_data.get('class_ids', [0])[0])
                confidence = float(res_data.get('scores', [0.0])[0])
                label_name = res_data.get('label_names', ['0'])[0]

                # Map class_id to detected angle (0, 1, 2, 3 → 0°, 90°, 180°, 270°)
                angle_map = {0: 0, 1: 90, 2: 180, 3: 270}
                detected_angle = angle_map.get(class_id, 0)

                # Calculate correction angle (rotate in opposite direction)
                correction_angle = -detected_angle if detected_angle != 0 else 0

                print(f"  > Detected orientation: {detected_angle}° (label: '{label_name}', confidence: {confidence:.2%})")
                if correction_angle != 0:
                    print(f"  > Applying correction: {correction_angle}°")

                return correction_angle, confidence

        finally:
            # Clean up temp file
            if os.path.exists(temp_path):
                os.unlink(temp_path)

        return 0, 0.0

    except Exception as e:
        print(f"  > Orientation detection failed: {e}")
        print(f"  > Skipping orientation correction")
        return 0, 0.0


def calculate_text_orientation_score(image):
    """Calculate score for text orientation based on horizontal text lines"""
    if len(image.shape) == 3:
        gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
    else:
        gray = image

    _, binary = cv2.threshold(gray, 0, 255, cv2.THRESH_BINARY_INV + cv2.THRESH_OTSU)

    horizontal_projection = np.sum(binary, axis=1)
    vertical_projection = np.sum(binary, axis=0)

    h_variance = np.var(horizontal_projection)
    v_variance = np.var(vertical_projection)

    return h_variance


def rotate_image(image, angle):
    """Rotate image by specified angle"""
    if angle == 0:
        return image

    height, width = image.shape[:2]
    center = (width // 2, height // 2)

    matrix = cv2.getRotationMatrix2D(center, angle, 1.0)

    abs_cos = abs(matrix[0, 0])
    abs_sin = abs(matrix[0, 1])
    new_width = int(height * abs_sin + width * abs_cos)
    new_height = int(height * abs_cos + width * abs_sin)

    matrix[0, 2] += new_width / 2 - center[0]
    matrix[1, 2] += new_height / 2 - center[1]

    rotated = cv2.warpAffine(
        image, matrix, (new_width, new_height),
        flags=cv2.INTER_LINEAR,
        borderMode=cv2.BORDER_CONSTANT,
        borderValue=(255, 255, 255)
    )

    return rotated


def detect_skew(image):
    """Detect fine skew angle using Hough Transform"""
    edges = cv2.Canny(image, 50, 150, apertureSize=3)

    lines = cv2.HoughLinesP(
        edges, 1, np.pi / 180,
        threshold=100,
        minLineLength=100,
        maxLineGap=10
    )

    if lines is None or len(lines) == 0:
        return 0.0

    angles = []
    for line in lines:
        x1, y1, x2, y2 = line[0]
        angle = np.degrees(np.arctan2(y2 - y1, x2 - x1))

        if angle < -45:
            angle += 90
        elif angle > 45:
            angle -= 90

        if abs(angle) < 45:
            angles.append(angle)

    if not angles:
        return 0.0

    return float(np.median(angles))


def remove_shadows(image):
    """Remove shadows and normalize illumination"""
    dilated = cv2.dilate(image, np.ones((7, 7), np.uint8))
    bg = cv2.medianBlur(dilated, 21)
    diff = 255 - cv2.absdiff(image, bg)
    normalized = cv2.normalize(diff, None, alpha=0, beta=255, norm_type=cv2.NORM_MINMAX)

    return normalized


def enhance_contrast(image, clip_limit=3.0, tile_size=8):
    """Apply CLAHE for adaptive contrast enhancement"""
    clahe = cv2.createCLAHE(
        clipLimit=clip_limit,
        tileGridSize=(tile_size, tile_size)
    )
    return clahe.apply(image)


def remove_borders(image, margin=10):
    """Remove borders around document content"""
    _, binary = cv2.threshold(image, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
    binary = cv2.bitwise_not(binary)

    kernel = np.ones((15, 15), np.uint8)
    dilated = cv2.dilate(binary, kernel, iterations=2)

    contours, _ = cv2.findContours(dilated, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)

    if not contours:
        return image

    largest = max(contours, key=cv2.contourArea)
    x, y, w, h = cv2.boundingRect(largest)

    min_area = image.shape[0] * image.shape[1] * 0.3
    if w * h < min_area:
        return image

    x = max(0, x - margin)
    y = max(0, y - margin)
    w = min(image.shape[1] - x, w + 2 * margin)
    h = min(image.shape[0] - y, h + 2 * margin)

    return image[y:y+h, x:x+w]


def resize_to_dpi(image, target_dpi=300, current_dpi=72):
    """Resize image to optimal DPI for OCR"""
    scale = target_dpi / current_dpi

    if abs(scale - 1.0) < 0.1:
        return image

    height, width = image.shape[:2]
    new_width = int(width * scale)
    new_height = int(height * scale)

    return cv2.resize(image, (new_width, new_height), interpolation=cv2.INTER_CUBIC)


def image_to_base64(image):
    """Convert image to base64 string"""
    import base64
    _, buffer = cv2.imencode('.png', image)
    img_base64 = base64.b64encode(buffer).decode('utf-8')
    return f"data:image/png;base64,{img_base64}"


def preprocess_image(image, save_steps_dir=None):
    """
    Complete preprocessing pipeline

    Args:
        image: Input image (BGR or grayscale)
        save_steps_dir: Optional directory to save intermediate steps

    Returns:
        processed_image: Preprocessed image
        metadata: Processing information dictionary
    """
    metadata = {
        'steps_completed': [],
        'rotation_applied': 0.0,
        'original_size': image.shape,
        'final_size': None
    }

    current = image.copy()

    def save_step(img, step_name):
        if save_steps_dir:
            import os
            filepath = os.path.join(save_steps_dir, f"{step_name}.png")
            cv2.imwrite(filepath, img)

    print("\n[PREPROCESSING PIPELINE]")

    print("[1/5] Resizing...")
    current, scale = resize_if_needed(current, 2000)
    if scale < 1.0:
        metadata['steps_completed'].append('resize')
    save_step(current, '1_resize')

    print("[2/5] Converting to grayscale...")
    current = convert_to_grayscale(current)
    metadata['steps_completed'].append('grayscale')
    save_step(current, '2_grayscale')

    print("[3/5] Detecting orientation...")
    angle, confidence = detect_orientation(current)
    if angle != 0:
        correction_angle = -angle
        print(f"  > Detected {angle}° rotation, correcting by {correction_angle}°")
        current = rotate_image(current, correction_angle)
        metadata['rotation_applied'] += correction_angle
        metadata['steps_completed'].append('rotation')
    save_step(current, '3_rotation')

    print("[4/5] Detecting skew...")
    skew_angle = detect_skew(current)
    if abs(skew_angle) > 0.5:
        print(f"  > Correcting skew: {skew_angle:.2f}°")
        current = rotate_image(current, -skew_angle)
        metadata['rotation_applied'] += skew_angle
        metadata['steps_completed'].append('deskew')
    save_step(current, '4_deskew')

    print("[5/5] Removing borders...")
    current = remove_borders(current)
    metadata['steps_completed'].append('border_removal')
    save_step(current, '5_border_removal')

    metadata['final_size'] = current.shape

    return current, metadata
