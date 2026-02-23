# backend/preprocess.py
import os
from PIL import Image
from torchvision import transforms

DEFAULT_IMAGE_SIZE = int(os.getenv("IMAGE_SIZE", "224"))

# Inference MUST match training eval normalization (ImageNet)
MEAN = [float(x) for x in os.getenv("NORM_MEAN", "0.485,0.456,0.406").split(",")]
STD  = [float(x) for x in os.getenv("NORM_STD",  "0.229,0.224,0.225").split(",")]

def get_inference_transform(img_size: int = DEFAULT_IMAGE_SIZE) -> transforms.Compose:
    # Deterministic: no aug at inference
    return transforms.Compose([
        transforms.Resize((img_size, img_size)),
        transforms.ToTensor(),
        transforms.Normalize(mean=MEAN, std=STD),
    ])

def pil_to_tensor(pil_img: Image.Image, img_size: int = DEFAULT_IMAGE_SIZE):
    if pil_img.mode != "RGB":
        pil_img = pil_img.convert("RGB")
    tfm = get_inference_transform(img_size)
    x = tfm(pil_img).unsqueeze(0)  # [1,3,H,W]
    return x