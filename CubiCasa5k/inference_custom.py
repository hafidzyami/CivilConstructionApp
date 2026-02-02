import sys
import os
import cv2
import numpy as np
import matplotlib.pyplot as plt
import torch
import torch.nn.functional as F
from floortrans.models import get_model
from floortrans.loaders import RotateNTurns
from floortrans.post_prosessing import split_prediction, get_polygons
from floortrans.plotting import polygons_to_image, discrete_cmap

# Register custom colormaps
discrete_cmap()

def contrast_enhance(img):
    # Optional: Simple contrast enhancement if the input is too faint
    if img.max() > 1.0:
        img = img / 255.0
    return img

def main(image_path):
    # 1. Setup Model
    model = get_model('hg_furukawa_original', 51)
    n_classes = 44
    split = [21, 12, 11]
    
    # Patch model layers for legacy checkpoint compatibility
    model.conv4_ = torch.nn.Conv2d(256, n_classes, bias=True, kernel_size=1)
    model.upsample = torch.nn.ConvTranspose2d(n_classes, n_classes, kernel_size=4, stride=4)
    
    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    print(f"Loading model on {device}...")
    
    checkpoint = torch.load('model_best_val_loss_var.pkl', map_location=device)
    model.load_state_dict(checkpoint['model_state'])
    model.eval()
    model.to(device)

    # 2. Load and Preprocess Image
    print(f"Processing image: {image_path}")
    if not os.path.exists(image_path):
        print(f"Error: File not found {image_path}")
        return

    # Load image
    bgr_img = cv2.imread(image_path)
    if bgr_img is None:
        print("Error: Failed to load image. Check format.")
        return
        
    rgb_img = cv2.cvtColor(bgr_img, cv2.COLOR_BGR2RGB)
    
    # Normalize to [-1, 1] as expected by the model
    # Note: Training data logic: 2 * (img / 255.0) - 1
    norm_img = 2 * (rgb_img.astype(np.float32) / 255.0) - 1
    
    # Create tensor [1, C, H, W]
    # Model expects channel first: [Batch, Channel, Height, Width]
    tensor_img = np.moveaxis(norm_img, -1, 0) # [C, H, W]
    tensor_img = torch.from_numpy(tensor_img).float().unsqueeze(0) # [1, C, H, W]
    tensor_img = tensor_img.to(device)

    # 3. Inference
    rot = RotateNTurns()
    with torch.no_grad():
        height, width = tensor_img.shape[2], tensor_img.shape[3]
        
        # Test-Time Augmentation (4 rotations)
        rotations = [(0, 0), (1, -1), (2, 2), (-1, 1)]
        pred_count = len(rotations)
        prediction = torch.zeros([pred_count, n_classes, height, width])
        
        for i, r in enumerate(rotations):
            forward, back = r
            rot_image = rot(tensor_img, 'tensor', forward)
            pred = model(rot_image)
            pred = rot(pred, 'tensor', back)
            pred = rot(pred, 'points', back) # Rotates heatmap channels specifically
            pred = F.interpolate(pred, size=(height, width), mode='bilinear', align_corners=True)
            prediction[i] = pred[0]

        # Average the predictions
        prediction = torch.mean(prediction, 0, True)

    # 4. Post-processing
    print("Post-processing...")
    img_size = (height, width)
    heatmaps, rooms, icons = split_prediction(prediction, img_size, split)
    
    # get_polygons uses the PREDICTED heatmaps to find junctions.
    # It doesn't need ground truth junctions.
    polygons, types, room_polygons, room_types = get_polygons((heatmaps, rooms, icons), 0.2, [1, 2])

    # 5. Visualization A: Raw Segmentation
    rooms_pred = F.softmax(prediction[0, 21:21+12], 0).cpu().data.numpy()
    rooms_pred = np.argmax(rooms_pred, axis=0)
    
    icons_pred = F.softmax(prediction[0, 21+12:], 0).cpu().data.numpy()
    icons_pred = np.argmax(icons_pred, axis=0)

    # 6. Visualization B: Polygons
    pol_room_seg, pol_icon_seg = polygons_to_image(polygons, types, room_polygons, room_types, height, width)

    # Plot results
    room_classes = ["Background", "Outdoor", "Wall", "Kitchen", "Living Room" ,"Bed Room", "Bath", "Entry", "Railing", "Storage", "Garage", "Undefined"]
    icon_classes = ["No Icon", "Window", "Door", "Closet", "Electrical Applience" ,"Toilet", "Sink", "Sauna Bench", "Fire Place", "Bathtub", "Chimney"]
    n_rooms = len(room_classes)
    n_icons = len(icon_classes)

    plt.figure(figsize=(18, 12))
    
    # Original
    ax = plt.subplot(2, 3, 1)
    ax.set_title("Input Image")
    ax.imshow(rgb_img)
    ax.axis('off')

    # Raw Rooms
    ax = plt.subplot(2, 3, 2)
    ax.set_title("Raw Room Seg")
    rseg = ax.imshow(rooms_pred, cmap='rooms', vmin=0, vmax=n_rooms-0.1)
    ax.axis('off')
    cbar = plt.colorbar(rseg, ticks=np.arange(n_rooms) + 0.5, fraction=0.046, pad=0.01)
    cbar.ax.set_yticklabels(room_classes, fontsize=8)

    # Raw Icons
    ax = plt.subplot(2, 3, 3)
    ax.set_title("Raw Icon Seg")
    iseg = ax.imshow(icons_pred, cmap='icons', vmin=0, vmax=n_icons-0.1)
    ax.axis('off')
    cbar = plt.colorbar(iseg, ticks=np.arange(n_icons) + 0.5, fraction=0.046, pad=0.01)
    cbar.ax.set_yticklabels(icon_classes, fontsize=8)

    # Polygon Rooms
    ax = plt.subplot(2, 3, 5)
    ax.set_title("Vectorized Rooms")
    rseg = ax.imshow(pol_room_seg, cmap='rooms', vmin=0, vmax=n_rooms-0.1)
    ax.axis('off')
    cbar = plt.colorbar(rseg, ticks=np.arange(n_rooms) + 0.5, fraction=0.046, pad=0.01)
    cbar.ax.set_yticklabels(room_classes, fontsize=8)

    # Polygon Icons
    ax = plt.subplot(2, 3, 6)
    ax.set_title("Vectorized Icons")
    iseg = ax.imshow(pol_icon_seg, cmap='icons', vmin=0, vmax=n_icons-0.1)
    ax.axis('off')
    cbar = plt.colorbar(iseg, ticks=np.arange(n_icons) + 0.5, fraction=0.046, pad=0.01)
    cbar.ax.set_yticklabels(icon_classes, fontsize=8)
    
    plt.tight_layout()
    print("Displaying results...")
    plt.show()

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python inference_custom.py <path_to_image>")
        # Default fallback for testing
        image_path = "data/random/image.png"
        print(f"No argument provided. Defaults to {image_path}")
        main(image_path)
    else:
        main(sys.argv[1])
