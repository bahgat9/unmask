# main.py
# =========================
# KILLER FIX PACK (v2.7) — MONGODB REPORTS + INSIGHTFACE ALIGNED CROP
# ✅ Adds InsightFace aligned crop (FF++ / DFDC / Celeb-DF style)
# ✅ Keeps SAME eval resize as datasets.py (Resize(224,224) -> ToTensor -> Normalize)
# ✅ FACE_CROP modes: none | center | haar | insight | auto (insight->haar->center)
# ✅ CUDA if available (CPU safe)
# ✅ Top-K video aggregation (select by prob_fake, aggregate logits)
# ✅ MongoDB Atlas reports:
#    - Auto-save after /predict/image and /predict/video
#    - GET /reports, GET /reports/{id}
#    - Stores ONLY Top-K frames (committee-friendly, small docs)
# =========================

import os
import io
import math
import tempfile
from typing import List, Dict, Any, Optional, Tuple

import numpy as np
import cv2
from PIL import Image

import torch
import torch.nn as nn
import torch.nn.functional as F
import torchvision.models as tvm
from torchvision import transforms

from fastapi import FastAPI, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv

# Mongo
from motor.motor_asyncio import AsyncIOMotorClient
from datetime import datetime
import uuid

load_dotenv()

# -------------------------
# OPTIONAL InsightFace
# -------------------------
_INSIGHTFACE_OK = False
try:
    # pip install insightface onnxruntime
    from insightface.app import FaceAnalysis
    from insightface.utils.face_align import norm_crop
    _INSIGHTFACE_OK = True
except Exception:
    _INSIGHTFACE_OK = False


# =========================
# Config
# =========================
BASE_DIR = os.path.dirname(os.path.abspath(__file__))

# IMPORTANT: set this to YOUR best checkpoint
CKPT_PATH = os.path.join(BASE_DIR, "models", "moe_all_best.pth")
TEMP_PATH = os.path.join(BASE_DIR, "models", "temperature.txt")

IDX_TO_LABEL = {0: "real", 1: "fake"}

DEVICE = torch.device("cuda" if torch.cuda.is_available() else "cpu")
torch.set_num_threads(max(1, min(8, os.cpu_count() or 1)))  # don't oversubscribe CPU

IMAGE_SIZE = 224  # MUST match datasets.py get_transforms(img_size)

TOPK_RATIO = float(os.getenv("TOPK_RATIO", "0.4"))
UNCERTAIN_LOW = float(os.getenv("UNCERTAIN_LOW", "0.45"))
UNCERTAIN_HIGH = float(os.getenv("UNCERTAIN_HIGH", "0.55"))

# ✅ runtime knobs
# FACE_CROP: auto | none | center | haar | insight
FACE_CROP_MODE = os.getenv("FACE_CROP", "auto").strip().lower()
TTA_FLIP = os.getenv("TTA_FLIP", "0").strip().lower() in ["1", "true", "yes"]

# InsightFace knobs
INSIGHT_MODEL_NAME = os.getenv("INSIGHTFACE_MODEL", "buffalo_l").strip()
INSIGHT_DET_SIZE = int(os.getenv("INSIGHTFACE_DET_SIZE", "640"))  # detection input size
INSIGHT_MIN_FACE = int(os.getenv("INSIGHTFACE_MIN_FACE", "40"))   # ignore tiny faces
INSIGHT_USE_GPU = os.getenv("INSIGHTFACE_GPU", "auto").strip().lower()  # auto|1|0

# Haar face detector (fallback)
_FACE_CASCADE_PATH = os.path.join(cv2.data.haarcascades, "haarcascade_frontalface_default.xml")
_FACE_CASCADE = cv2.CascadeClassifier(_FACE_CASCADE_PATH)

# MongoDB (reports)
MONGODB_URI = os.getenv("MONGODB_URI", "").strip()
MONGODB_DB = os.getenv("MONGODB_DB", "unmask").strip()
MONGODB_COLLECTION = os.getenv("MONGODB_COLLECTION", "reports").strip()

mongo_client: Optional[AsyncIOMotorClient] = None
reports_col = None


# =========================
# Calibration: Temperature Scaling
# =========================
def _read_temperature_file(path: str) -> Optional[float]:
    try:
        if not os.path.exists(path):
            return None
        with open(path, "r", encoding="utf-8") as f:
            s = f.read().strip()
        if not s:
            return None
        t = float(s)
        return t
    except Exception:
        return None


def load_temperature() -> Tuple[float, str]:
    """
    Priority:
      1) ENV TEMPERATURE
      2) ./models/temperature.txt
      3) default 1.0
    Returns: (T, source)
    """
    env_t = os.getenv("TEMPERATURE", "").strip()
    if env_t:
        try:
            t = float(env_t)
            if t > 0:
                return t, "env"
        except Exception:
            pass

    file_t = _read_temperature_file(TEMP_PATH)
    if file_t is not None and file_t > 0:
        return float(file_t), "file"

    return 1.0, "default"


TEMPERATURE: float = 1.0
TEMP_SOURCE: str = "default"


def calibrated_softmax(logits: torch.Tensor) -> torch.Tensor:
    t = float(TEMPERATURE) if float(TEMPERATURE) > 0 else 1.0
    return torch.softmax(logits / t, dim=1)


# =========================
# Frontend-safe response builders
# =========================
def stable_base(kind: str, filename: str) -> Dict[str, Any]:
    return {
        "ok": True,
        "type": kind,
        "filename": filename,
        "error": "",

        "prediction": "fake",
        "confidence": 0.0,
        "prob_real": 0.0,
        "prob_fake": 0.0,

        "overall": {
            "prediction": "fake",
            "confidence": 0.0,
            "prob_real": 0.0,
            "prob_fake": 0.0,
            "final_prob_real": 0.0,
            "final_prob_fake": 0.0,
            "decision_rule": "calibrated softmax + argmax",
            "temperature": float(TEMPERATURE),
            "uncertain_band": [float(UNCERTAIN_LOW), float(UNCERTAIN_HIGH)],
            "topk_mean_prob_fake": 0.0,
            "topk_k_ratio": float(TOPK_RATIO),
            "mean_prob_fake": 0.0,
            "mean_prob_real": 0.0,
            "uncertain": False,
            "tta_flip": bool(TTA_FLIP),
            "face_crop_mode": str(FACE_CROP_MODE),
        },

        "total_frames": 0,
        "fps": 0.0,
        "frames_used": 0,
        "per_frame": [],

        "debug": {
            "device": str(DEVICE),
            "torch_cuda": bool(torch.cuda.is_available()),
            "haar_ready": bool(_FACE_CASCADE is not None and not _FACE_CASCADE.empty()),
            "haar_path": _FACE_CASCADE_PATH,
            "temperature_source": str(TEMP_SOURCE),
            "insightface_available": bool(_INSIGHTFACE_OK),
            "insightface_enabled": False,
            "insightface_model": INSIGHT_MODEL_NAME,
            "insightface_det_size": INSIGHT_DET_SIZE,
        },
    }


def stable_fail(kind: str, filename: str, message: str) -> Dict[str, Any]:
    out = stable_base(kind, filename)
    out["ok"] = False
    out["error"] = str(message)
    out["overall"]["uncertain"] = True
    out["debug"]["fail_reason"] = str(message)
    return out


# =========================
# Reports (MongoDB)
# =========================
def build_report_doc(out: Dict[str, Any], kind: str) -> Dict[str, Any]:
    """
    Store only what you need (committee-friendly).
    For video, store ONLY top-k evidence frames (in_topk==True).
    """
    doc = {
        "_id": str(uuid.uuid4()),
        "created_at": datetime.utcnow(),
        "type": kind,
        "filename": out.get("filename", ""),
        "prediction": out.get("prediction", ""),
        "confidence": float(out.get("confidence", 0.0)),
        "prob_real": float(out.get("prob_real", 0.0)),
        "prob_fake": float(out.get("prob_fake", 0.0)),
        "overall": out.get("overall", {}),
        "debug": {
            "face_crop_mode": out.get("overall", {}).get("face_crop_mode"),
            "tta_flip": out.get("overall", {}).get("tta_flip"),
            "temperature": out.get("overall", {}).get("temperature"),
            "temperature_source": out.get("debug", {}).get("temperature_source"),
            "aggregation": out.get("debug", {}).get("aggregation", ""),
            "device": out.get("debug", {}).get("device"),
        },
    }

    if kind == "video":
        doc["total_frames"] = int(out.get("total_frames", 0))
        doc["fps"] = float(out.get("fps", 0.0))
        doc["frames_used"] = int(out.get("frames_used", 0))

        per_frame = out.get("per_frame", []) or []
        topk_only = [x for x in per_frame if x.get("in_topk") is True]
        doc["per_frame"] = topk_only[:200]  # hard safety cap

    return doc


def _iso_z(dt) -> str:
    try:
        return dt.isoformat() + "Z"
    except Exception:
        return ""


# =========================
# Helpers
# =========================
def bn_to_gn(module: nn.Module, gn_groups: int = 32) -> None:
    for name, child in module.named_children():
        if isinstance(child, nn.BatchNorm2d):
            num_channels = child.num_features
            groups = min(gn_groups, num_channels)
            while num_channels % groups != 0 and groups > 1:
                groups -= 1
            setattr(module, name, nn.GroupNorm(groups, num_channels))
        else:
            bn_to_gn(child, gn_groups=gn_groups)


def smart_load_state_dict(model: nn.Module, state: dict, verbose: bool = True):
    """
    Same logic as train.py:
    - skips missing keys
    - skips shape mismatches
    - special cases:
        * freq.backbone.conv1.weight 1ch<->2ch
        * gate.0.weight padding 1280->1284
    """
    model_sd = model.state_dict()
    new_sd = {}
    loaded = []
    skipped = []

    for k, v in state.items():
        if k not in model_sd:
            skipped.append((k, "missing_in_model"))
            continue

        tgt = model_sd[k]
        if hasattr(v, "shape") and hasattr(tgt, "shape") and v.shape == tgt.shape:
            new_sd[k] = v
            loaded.append(k)
            continue

        if k.endswith("freq.backbone.conv1.weight") and v.ndim == 4 and tgt.ndim == 4:
            if v.shape[0] == tgt.shape[0] and v.shape[2:] == tgt.shape[2:]:
                if v.shape[1] == 1 and tgt.shape[1] == 2:
                    new_sd[k] = v.repeat(1, 2, 1, 1)
                    loaded.append(k + " (expanded 1->2)")
                    continue
                if v.shape[1] == 2 and tgt.shape[1] == 1:
                    new_sd[k] = v.mean(dim=1, keepdim=True)
                    loaded.append(k + " (reduced 2->1)")
                    continue

        if k.endswith("gate.0.weight") and v.ndim == 2 and tgt.ndim == 2:
            if v.shape[0] == tgt.shape[0] and v.shape[1] < tgt.shape[1]:
                pad = tgt.new_zeros((tgt.shape[0], tgt.shape[1] - v.shape[1]))
                new_sd[k] = torch.cat([v, pad], dim=1)
                loaded.append(k + f" (padded {v.shape[1]}->{tgt.shape[1]})")
                continue

        skipped.append((k, f"shape_mismatch model={tuple(tgt.shape)} ckpt={tuple(v.shape)}"))

    missing, unexpected = model.load_state_dict(new_sd, strict=False)

    if verbose:
        print(
            f"[SMART-LOAD] loaded={len(loaded)} | skipped={len(skipped)} | "
            f"missing_after={len(missing)} | unexpected_after={len(unexpected)}"
        )
        for kk, why in skipped[:10]:
            print(f"  - skipped: {kk} | {why}")

    return loaded, skipped


def _clip(v: int, lo: int, hi: int) -> int:
    return max(lo, min(hi, v))


def topk_indices(arr: List[float], k_ratio: float) -> List[int]:
    if not arr:
        return []
    k = max(1, int(math.ceil(len(arr) * float(k_ratio))))
    idx = np.argsort(np.array(arr))[::-1][:k]
    return [int(i) for i in idx.tolist()]


def decide_label(pr: float, pf: float) -> Tuple[str, float, bool]:
    pr = float(np.clip(pr, 0.0, 1.0))
    pf = float(np.clip(pf, 0.0, 1.0))
    pred_idx = 1 if pf >= pr else 0
    label = IDX_TO_LABEL[pred_idx]
    conf = float(max(pr, pf))
    uncertain = bool(UNCERTAIN_LOW <= pf <= UNCERTAIN_HIGH)
    return label, conf, uncertain


# =========================
# Face crop: InsightFace / Haar / center
# =========================
def cascade_ready() -> bool:
    try:
        return _FACE_CASCADE is not None and not _FACE_CASCADE.empty()
    except Exception:
        return False


def center_square_crop(img: Image.Image) -> Image.Image:
    rgb = np.array(img.convert("RGB"))
    H, W = rgb.shape[:2]
    side = min(H, W)
    x1 = (W - side) // 2
    y1 = (H - side) // 2
    return Image.fromarray(rgb[y1:y1 + side, x1:x1 + side])


def crop_face_haar(
    img: Image.Image,
    margin: float = 0.35,
    min_face: int = 60
) -> Tuple[Optional[Image.Image], Dict[str, Any]]:
    dbg = {"crop_method": "haar", "used": False}
    if not cascade_ready():
        dbg["reason"] = "haar_not_ready"
        return None, dbg

    rgb = np.array(img.convert("RGB"))
    gray = cv2.cvtColor(rgb, cv2.COLOR_RGB2GRAY)

    faces = _FACE_CASCADE.detectMultiScale(
        gray, scaleFactor=1.1, minNeighbors=5,
        flags=cv2.CASCADE_SCALE_IMAGE, minSize=(min_face, min_face)
    )
    H, W = gray.shape[:2]
    if len(faces) == 0:
        dbg["reason"] = "no_face"
        return None, dbg

    x, y, w, h = max(faces, key=lambda b: b[2] * b[3])
    cx, cy = x + w / 2.0, y + h / 2.0
    side = max(w, h) * (1.0 + margin)

    x1 = _clip(int(cx - side / 2.0), 0, W - 1)
    y1 = _clip(int(cy - side / 2.0), 0, H - 1)
    x2 = _clip(int(cx + side / 2.0), 0, W)
    y2 = _clip(int(cy + side / 2.0), 0, H)

    if x2 > x1 and y2 > y1:
        dbg.update({
            "used": True,
            "bbox_xyxy": [int(x1), int(y1), int(x2), int(y2)],
            "face_wh": [int(w), int(h)],
        })
        return Image.fromarray(rgb[y1:y2, x1:x2]), dbg

    dbg["reason"] = "bad_crop"
    return None, dbg


# Global InsightFace app
IFACE: Optional["FaceAnalysis"] = None


def insightface_enabled() -> bool:
    return _INSIGHTFACE_OK and IFACE is not None


def crop_face_insight(img: Image.Image) -> Tuple[Optional[Image.Image], Dict[str, Any]]:
    """
    Returns aligned face crop using InsightFace 5-point alignment (norm_crop).
    """
    dbg = {"crop_method": "insight", "used": False}

    if not insightface_enabled():
        dbg["reason"] = "insightface_not_ready"
        return None, dbg

    rgb = np.array(img.convert("RGB"))
    bgr = cv2.cvtColor(rgb, cv2.COLOR_RGB2BGR)

    try:
        faces = IFACE.get(bgr)
    except Exception as e:
        dbg["reason"] = f"insightface_get_failed: {e}"
        return None, dbg

    if not faces:
        dbg["reason"] = "no_face"
        return None, dbg

    def area(f):
        bb = getattr(f, "bbox", None)
        if bb is None:
            return 0.0
        x1, y1, x2, y2 = bb
        return float(max(0.0, (x2 - x1)) * max(0.0, (y2 - y1)))

    face = max(faces, key=area)
    bb = face.bbox.astype(float)
    x1, y1, x2, y2 = bb.tolist()
    w = max(0.0, x2 - x1)
    h = max(0.0, y2 - y1)

    det_score = float(getattr(face, "det_score", 0.0))
    dbg.update({
        "det_score": det_score,
        "bbox_xyxy": [float(x1), float(y1), float(x2), float(y2)],
        "face_wh": [float(w), float(h)],
    })

    if w < INSIGHT_MIN_FACE or h < INSIGHT_MIN_FACE:
        dbg["reason"] = "face_too_small"
        return None, dbg

    kps = getattr(face, "kps", None)
    if kps is None:
        dbg["reason"] = "no_kps"
        return None, dbg

    try:
        aligned_bgr = norm_crop(bgr, kps, image_size=IMAGE_SIZE)
        aligned_rgb = cv2.cvtColor(aligned_bgr, cv2.COLOR_BGR2RGB)
        dbg["used"] = True
        return Image.fromarray(aligned_rgb), dbg
    except Exception as e:
        dbg["reason"] = f"norm_crop_failed: {e}"
        return None, dbg


def prepare_image_for_model(img: Image.Image) -> Tuple[Image.Image, Dict[str, Any]]:
    """
    FACE_CROP modes:
      - none
      - center
      - haar
      - insight
      - auto: insight -> haar -> center
    """
    dbg: Dict[str, Any] = {
        "face_crop_mode": FACE_CROP_MODE,
        "used_face_crop": False,
        "crop_method": "none",
    }

    mode = FACE_CROP_MODE

    if mode == "none":
        return img, dbg

    if mode == "center":
        dbg["crop_method"] = "center"
        return center_square_crop(img), dbg

    if mode == "haar":
        face, d = crop_face_haar(img, margin=0.35, min_face=60)
        dbg.update(d)
        if face is not None:
            dbg["used_face_crop"] = True
            return face, dbg
        dbg["crop_method"] = "center_fallback"
        return center_square_crop(img), dbg

    if mode in ["insight", "insightface"]:
        face, d = crop_face_insight(img)
        dbg.update(d)
        if face is not None:
            dbg["used_face_crop"] = True
            return face, dbg
        dbg["crop_method"] = "center_fallback"
        return center_square_crop(img), dbg

    # auto
    face, d = crop_face_insight(img)
    if face is not None:
        dbg.update(d)
        dbg["used_face_crop"] = True
        return face, dbg

    face2, d2 = crop_face_haar(img, margin=0.35, min_face=60)
    if face2 is not None:
        dbg.update(d2)
        dbg["used_face_crop"] = True
        return face2, dbg

    dbg["crop_method"] = "center_fallback"
    return center_square_crop(img), dbg


# =========================
# Model definitions (MATCH system/models_custom.py)
# =========================
class SpatialConvNeXtTiny(nn.Module):
    def __init__(self, num_classes: int = 2, embed_dim: int = 768):
        super().__init__()
        try:
            self.backbone = tvm.convnext_tiny(weights=tvm.ConvNeXt_Tiny_Weights.DEFAULT)
        except Exception:
            self.backbone = tvm.convnext_tiny(pretrained=True)

        in_features = self.backbone.classifier[-1].in_features
        self.backbone.classifier = nn.Identity()

        self.embed = nn.Sequential(
            nn.LayerNorm(in_features),
            nn.Linear(in_features, embed_dim),
            nn.GELU(),
            nn.Dropout(0.3),
        )
        self.head = nn.Linear(embed_dim, num_classes)

    def forward(self, x):
        feat = self.backbone(x)
        if feat.dim() == 4:
            feat = torch.flatten(feat, 1)
        emb = self.embed(feat)
        logits = self.head(emb)
        return emb, logits


class FrequencyResNet18(nn.Module):
    def __init__(self, num_classes=2, embed_dim=512, use_imagenet_weights=False, gn_groups=32):
        super().__init__()

        if use_imagenet_weights:
            try:
                resnet = tvm.resnet18(weights=tvm.ResNet18_Weights.DEFAULT)
            except Exception:
                resnet = tvm.resnet18(pretrained=True)
        else:
            resnet = tvm.resnet18(weights=None)

        old_conv = resnet.conv1
        resnet.conv1 = nn.Conv2d(
            2,
            old_conv.out_channels,
            kernel_size=old_conv.kernel_size,
            stride=old_conv.stride,
            padding=old_conv.padding,
            bias=False
        )

        if use_imagenet_weights:
            with torch.no_grad():
                if old_conv.weight.shape[1] == 3:
                    w = old_conv.weight.mean(dim=1, keepdim=True)
                    resnet.conv1.weight[:, 0:1] = w
                    resnet.conv1.weight[:, 1:2] = w
        else:
            nn.init.kaiming_normal_(resnet.conv1.weight, mode="fan_out", nonlinearity="relu")

        bn_to_gn(resnet, gn_groups=gn_groups)

        in_features = resnet.fc.in_features
        resnet.fc = nn.Identity()
        self.backbone = resnet

        self.embed = nn.Sequential(
            nn.Linear(in_features, embed_dim),
            nn.ReLU(),
            nn.Dropout(0.3),
        )
        self.head = nn.Linear(embed_dim, num_classes)

        self.register_buffer("_mean", torch.tensor([0.485, 0.456, 0.406]).view(1, 3, 1, 1))
        self.register_buffer("_std",  torch.tensor([0.229, 0.224, 0.225]).view(1, 3, 1, 1))

    def fft_map(self, x):
        gray = (0.2989 * x[:, 0:1] + 0.5870 * x[:, 1:2] + 0.1140 * x[:, 2:3])
        fft = torch.fft.fft2(gray, norm="ortho")
        fft = torch.fft.fftshift(fft, dim=(-2, -1))
        mag = torch.log1p(torch.abs(fft))

        B, _, H, W = mag.shape
        yy = torch.linspace(-1, 1, H, device=mag.device).view(1, 1, H, 1)
        xx = torch.linspace(-1, 1, W, device=mag.device).view(1, 1, 1, W)
        r = torch.sqrt(xx * xx + yy * yy).clamp(0, 1)
        hf = mag * r

        freq = torch.cat([mag, hf], dim=1)

        freq_flat = freq.view(B, 2, -1)
        mean = freq_flat.mean(dim=2).view(B, 2, 1, 1)
        std = freq_flat.std(dim=2).view(B, 2, 1, 1).clamp(min=1e-6)
        freq = (freq - mean) / std

        freq = F.interpolate(freq, size=(224, 224), mode="bilinear", align_corners=False)
        return freq

    def forward(self, x_rgb):
        x_freq = self.fft_map(x_rgb)
        feat = self.backbone(x_freq)
        emb = self.embed(feat)
        logits = self.head(emb)
        return emb, logits


class GatedMoEImage(nn.Module):
    def __init__(self, num_classes=2, gate_hidden=256, alpha=1.0, freq_use_imagenet_weights=False):
        super().__init__()
        self.spatial = SpatialConvNeXtTiny(num_classes=num_classes, embed_dim=768)
        self.freq = FrequencyResNet18(
            num_classes=num_classes,
            embed_dim=512,
            use_imagenet_weights=freq_use_imagenet_weights
        )

        self.alpha = float(alpha)
        gate_in = 768 + 512 + 4

        self.gate = nn.Sequential(
            nn.Linear(gate_in, gate_hidden),
            nn.ReLU(),
            nn.Dropout(0.2),
            nn.Linear(gate_hidden, 2)
        )
        with torch.no_grad():
            self.gate[-1].bias.copy_(torch.tensor([2.0, 0.0]))

    @staticmethod
    def _conf_entropy(logits: torch.Tensor):
        p = torch.softmax(logits.detach(), dim=1)
        conf = p.max(dim=1, keepdim=True).values
        ent = -(p * (p + 1e-8).log()).sum(dim=1, keepdim=True)
        return conf, ent

    def forward(self, x, return_w: bool = False):
        emb_s, logits_s = self.spatial(x)
        emb_f, logits_f = self.freq(x)

        conf_s, ent_s = self._conf_entropy(logits_s)
        conf_f, ent_f = self._conf_entropy(logits_f)

        gate_inp = torch.cat([emb_s.detach(), emb_f.detach(), conf_s, conf_f, ent_s, ent_f], dim=1)
        gate_logits = self.gate(gate_inp)
        w = torch.softmax(gate_logits, dim=1)
        w_f = w[:, 1:2]

        logits = logits_s + self.alpha * w_f * (logits_f - logits_s)
        if return_w:
            return logits, w_f
        return logits


# =========================
# Preprocessing (MATCH datasets.py eval transforms)
# =========================
transform_rgb = transforms.Compose([
    transforms.Resize((IMAGE_SIZE, IMAGE_SIZE)),
    transforms.ToTensor(),
    transforms.Normalize(mean=[0.485, 0.456, 0.406], std=[0.229, 0.224, 0.225]),
])


def pil_from_upload(upload: UploadFile) -> Image.Image:
    data = upload.file.read()
    return Image.open(io.BytesIO(data)).convert("RGB")


def tensor_from_pil(img: Image.Image) -> torch.Tensor:
    return transform_rgb(img)


@torch.no_grad()
def forward_logits_with_tta(model: nn.Module, x: torch.Tensor) -> torch.Tensor:
    logits = model(x)
    if TTA_FLIP:
        x_flip = torch.flip(x, dims=[3])
        logits_flip = model(x_flip)
        logits = 0.5 * (logits + logits_flip)
    return logits


@torch.no_grad()
def predict_probs_calibrated_from_logits(logits: torch.Tensor) -> Tuple[float, float]:
    probs = calibrated_softmax(logits)[0]
    return float(probs[0].item()), float(probs[1].item())


# =========================
# Video reader
# =========================
def read_video_frames_with_indices(path: str, max_frames: int = 16, decode_max_side: int = 640):
    cap = cv2.VideoCapture(path)
    if not cap.isOpened():
        raise RuntimeError("Cannot open video file.")

    total = int(cap.get(cv2.CAP_PROP_FRAME_COUNT)) or 0
    fps = float(cap.get(cv2.CAP_PROP_FPS) or 0.0)

    if total > 0:
        idx = np.linspace(0, total - 1, num=min(max_frames, total), dtype=int).tolist()
        pick = sorted(list(dict.fromkeys(idx)))
        pick_set = set(pick)
    else:
        pick_set = set(range(max_frames))

    frames, picked_indices = [], []
    cur = 0
    while True:
        ok, frame = cap.read()
        if not ok:
            break

        if cur in pick_set:
            h, w = frame.shape[:2]
            if decode_max_side and max(h, w) > decode_max_side:
                scale = decode_max_side / float(max(h, w))
                frame = cv2.resize(frame, (int(w * scale), int(h * scale)), interpolation=cv2.INTER_AREA)

            rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
            frames.append(Image.fromarray(rgb))
            picked_indices.append(cur)

            if total <= 0 and len(frames) >= max_frames:
                break

        cur += 1

    cap.release()
    if len(frames) == 0:
        raise RuntimeError("No frames extracted from video.")
    return frames, picked_indices, total, fps


# =========================
# FastAPI app
# =========================
app = FastAPI(title="UNMASK Deepfake Detector API", version="2.7")

ALLOWED_ORIGINS = os.getenv("ALLOWED_ORIGINS", "").strip()
origins = ["*"] if not ALLOWED_ORIGINS else [o.strip() for o in ALLOWED_ORIGINS.split(",")]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

MODEL: Optional[nn.Module] = None


@app.on_event("startup")
async def load_model_on_startup():
    global MODEL, TEMPERATURE, TEMP_SOURCE, IFACE, mongo_client, reports_col

    if not os.path.exists(CKPT_PATH):
        raise RuntimeError(f"Checkpoint not found: {CKPT_PATH}")

    TEMPERATURE, TEMP_SOURCE = load_temperature()

    # --- Init InsightFace (only if needed) ---
    IFACE = None
    want_insight = FACE_CROP_MODE in ["auto", "insight", "insightface"]
    if want_insight and _INSIGHTFACE_OK:
        if INSIGHT_USE_GPU in ["1", "true", "yes"]:
            ctx_id = 0
        elif INSIGHT_USE_GPU in ["0", "false", "no"]:
            ctx_id = -1
        else:
            ctx_id = 0 if torch.cuda.is_available() else -1

        try:
            providers = os.getenv("INSIGHTFACE_PROVIDERS", "").strip()
            if providers:
                prov_list = [p.strip() for p in providers.split(",") if p.strip()]
                IFACE = FaceAnalysis(name=INSIGHT_MODEL_NAME, providers=prov_list)
            else:
                IFACE = FaceAnalysis(name=INSIGHT_MODEL_NAME)

            IFACE.prepare(ctx_id=ctx_id, det_size=(INSIGHT_DET_SIZE, INSIGHT_DET_SIZE))
            print(f"[OK] InsightFace ready | model={INSIGHT_MODEL_NAME} | ctx_id={ctx_id} | det_size={INSIGHT_DET_SIZE}")
        except Exception as e:
            IFACE = None
            print(f"[WARN] InsightFace init failed -> will fallback to Haar/Center. Reason: {e}")

    # --- Model ---
    model = GatedMoEImage(
        num_classes=2,
        alpha=1.0,
        freq_use_imagenet_weights=False,
    ).to(DEVICE)

    ckpt = torch.load(CKPT_PATH, map_location=DEVICE)
    if isinstance(ckpt, dict) and "state_dict" in ckpt:
        ckpt = ckpt["state_dict"]

    smart_load_state_dict(model, ckpt, verbose=True)

    model.eval()
    MODEL = model

    print(f"[OK] Loaded checkpoint: {CKPT_PATH}")
    print("[OK] Haar cascade ready:", cascade_ready(), "| path:", _FACE_CASCADE_PATH)
    print("[OK] Temperature scaling T =", TEMPERATURE, "| source:", TEMP_SOURCE)
    print("[OK] FACE_CROP =", FACE_CROP_MODE, "| TTA_FLIP =", TTA_FLIP)
    print("[OK] Running on:", DEVICE)

    # ---- MongoDB connect ----
        # ---- MongoDB connect (SAFE) ----
    if MONGODB_URI:
        try:
            mongo_client = AsyncIOMotorClient(
                MONGODB_URI,
                serverSelectionTimeoutMS=8000,
                connectTimeoutMS=8000,
                socketTimeoutMS=8000,
            )
            db = mongo_client[MONGODB_DB]
            reports_col = db[MONGODB_COLLECTION]

            # Force a connection check (important)
            await mongo_client.admin.command("ping")

            # Indexes (safe)
            await reports_col.create_index("created_at")
            await reports_col.create_index([("type", 1), ("created_at", -1)])
            await reports_col.create_index([("prediction", 1), ("created_at", -1)])

            print("[OK] MongoDB connected:", MONGODB_DB, "/", MONGODB_COLLECTION)

        except Exception as e:
            print(f"[WARN] MongoDB connect/index failed -> reports disabled. Reason: {e}")
            reports_col = None
    else:
        print("[WARN] MONGODB_URI is empty -> reports will NOT be stored")


@app.on_event("shutdown")
async def shutdown():
    global mongo_client
    if mongo_client is not None:
        mongo_client.close()
        mongo_client = None


@app.get("/health")
def health():
    return {
        "status": "ok",
        "device": str(DEVICE),
        "model_loaded": MODEL is not None,
        "haar_ready": cascade_ready(),
        "insightface": {
            "available": bool(_INSIGHTFACE_OK),
            "enabled": bool(insightface_enabled()),
            "model": INSIGHT_MODEL_NAME,
            "det_size": INSIGHT_DET_SIZE,
            "min_face": INSIGHT_MIN_FACE,
        },
        "calibration": {
            "temperature": float(TEMPERATURE),
            "temperature_source": str(TEMP_SOURCE),
            "temperature_file": TEMP_PATH,
            "env_key": "TEMPERATURE",
        },
        "inference": {
            "face_crop_mode": str(FACE_CROP_MODE),
            "tta_flip": bool(TTA_FLIP),
            "topk_ratio": float(TOPK_RATIO),
            "image_size": int(IMAGE_SIZE),
        },
        "mongodb": {
            "enabled": bool(reports_col is not None),
            "db": MONGODB_DB,
            "collection": MONGODB_COLLECTION,
        }
    }


@app.post("/predict/image")
async def predict_image(file: UploadFile = File(...)):
    filename = file.filename or "image"
    out = stable_base("image", filename)

    if MODEL is None:
        return stable_fail("image", filename, "Model not loaded")

    try:
        img = pil_from_upload(file)
    except Exception as e:
        return stable_fail("image", filename, f"Invalid image: {e}")

    try:
        img2, dbg = prepare_image_for_model(img)
        x = tensor_from_pil(img2).unsqueeze(0).to(DEVICE)

        logits = forward_logits_with_tta(MODEL, x)
        pr, pf = predict_probs_calibrated_from_logits(logits)

        label, conf, uncertain = decide_label(pr, pf)

        out["prediction"] = label
        out["confidence"] = float(conf)
        out["prob_real"] = float(pr)
        out["prob_fake"] = float(pf)

        out["overall"]["prediction"] = label
        out["overall"]["confidence"] = float(conf)
        out["overall"]["prob_real"] = float(pr)
        out["overall"]["prob_fake"] = float(pf)
        out["overall"]["final_prob_real"] = float(pr)
        out["overall"]["final_prob_fake"] = float(pf)
        out["overall"]["temperature"] = float(TEMPERATURE)
        out["overall"]["uncertain"] = bool(uncertain)

        out["debug"].update({
            **dbg,
            "calibrated": True,
            "insightface_enabled": bool(insightface_enabled()),
        })

        # ---- save report (mongo) ----
        if reports_col is not None and out.get("ok") is True:
            doc = build_report_doc(out, kind="image")
            await reports_col.insert_one(doc)
            out["report_id"] = doc["_id"]

        return out

    except Exception as e:
        return stable_fail("image", filename, f"Inference failed: {e}")


@app.post("/predict/video")
async def predict_video(file: UploadFile = File(...), max_frames: int = 16, batch_size: int = 4):
    filename = file.filename or "video"
    out = stable_base("video", filename)

    if MODEL is None:
        return stable_fail("video", filename, "Model not loaded")

    suffix = os.path.splitext(filename)[-1] or ".mp4"
    with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
        tmp_path = tmp.name
        tmp.write(file.file.read())

    try:
        frames, picked_indices, total_frames, fps = read_video_frames_with_indices(
            tmp_path, max_frames=max_frames, decode_max_side=640
        )

        out["total_frames"] = int(total_frames)
        out["fps"] = float(fps or 0.0)

        prep_frames: List[Image.Image] = []
        prep_indices: List[int] = []
        used_face = 0
        crop_methods = {"insight": 0, "haar": 0, "center_fallback": 0, "center": 0, "none": 0}

        for im, src_idx in zip(frames, picked_indices):
            im2, dbg = prepare_image_for_model(im)
            if dbg.get("used_face_crop"):
                used_face += 1
            crop_methods[str(dbg.get("crop_method", "none"))] = crop_methods.get(str(dbg.get("crop_method", "none")), 0) + 1

            prep_frames.append(im2)
            prep_indices.append(int(src_idx))

        if len(prep_frames) == 0:
            return stable_fail("video", filename, "No usable frames extracted from video")

        if len(prep_frames) > max_frames:
            prep_frames = prep_frames[:max_frames]
            prep_indices = prep_indices[:max_frames]

        out["frames_used"] = int(len(prep_frames))

        all_x = torch.stack([tensor_from_pil(im) for im in prep_frames], dim=0).to(DEVICE)

        frame_logits: List[torch.Tensor] = []
        frame_probs_fake: List[float] = []
        frame_probs_real: List[float] = []
        frame_pred: List[int] = []
        frame_conf: List[float] = []

        n = all_x.size(0)
        for i in range(0, n, batch_size):
            batch = all_x[i:i + batch_size]
            with torch.no_grad():
                logits_b = forward_logits_with_tta(MODEL, batch)   # [B,2]
                probs_b = calibrated_softmax(logits_b)             # [B,2]

            for j in range(logits_b.size(0)):
                frame_logits.append(logits_b[j].detach().cpu())

            probs_np = probs_b.detach().cpu().numpy()
            pred_np = np.argmax(probs_np, axis=1)
            conf_np = np.max(probs_np, axis=1)

            for j in range(probs_np.shape[0]):
                pr = float(probs_np[j, 0])
                pf = float(probs_np[j, 1])
                frame_probs_real.append(pr)
                frame_probs_fake.append(pf)
                frame_pred.append(int(pred_np[j]))
                frame_conf.append(float(conf_np[j]))

        topk_idx = topk_indices(frame_probs_fake, k_ratio=TOPK_RATIO)
        if not topk_idx:
            return stable_fail("video", filename, "Top-K selection failed")

        topk_logits = torch.stack([frame_logits[i] for i in topk_idx], dim=0)  # [K,2]
        agg_logits = topk_logits.mean(dim=0, keepdim=True)                     # [1,2]

        pr_v, pf_v = predict_probs_calibrated_from_logits(agg_logits)
        label, conf, uncertain = decide_label(pr_v, pf_v)

        per_frame = []
        topk_set = set(topk_idx)
        for k in range(len(frame_pred)):
            src = int(prep_indices[k]) if k < len(prep_indices) else int(k)
            sampled_at_sec = (src / fps) if fps and fps > 0 else None
            per_frame.append({
                "frame_index": int(k),
                "source_frame": int(src),
                "sampled_at_sec": float(sampled_at_sec) if sampled_at_sec is not None else None,
                "prediction": IDX_TO_LABEL[int(frame_pred[k])],
                "confidence": float(frame_conf[k]),
                "prob_real": float(frame_probs_real[k]),
                "prob_fake": float(frame_probs_fake[k]),
                "in_topk": bool(k in topk_set),
            })
        out["per_frame"] = per_frame

        out["prediction"] = label
        out["confidence"] = float(conf)
        out["prob_real"] = float(pr_v)
        out["prob_fake"] = float(pf_v)

        out["overall"]["prediction"] = label
        out["overall"]["confidence"] = float(conf)
        out["overall"]["prob_real"] = float(pr_v)
        out["overall"]["prob_fake"] = float(pf_v)
        out["overall"]["final_prob_real"] = float(pr_v)
        out["overall"]["final_prob_fake"] = float(pf_v)
        out["overall"]["temperature"] = float(TEMPERATURE)
        out["overall"]["uncertain"] = bool(uncertain)

        mean_fake_topk = float(np.mean([frame_probs_fake[i] for i in topk_idx]))
        out["overall"]["topk_mean_prob_fake"] = mean_fake_topk
        out["overall"]["mean_prob_fake"] = float(np.mean(frame_probs_fake)) if frame_probs_fake else 0.0
        out["overall"]["mean_prob_real"] = float(np.mean(frame_probs_real)) if frame_probs_real else 0.0

        out["debug"].update({
            "aggregation": "topk_select_by_fake_prob + mean_logits + calibrated_softmax",
            "k_ratio": float(TOPK_RATIO),
            "topk_indices": topk_idx[:50],
            "used_face_crop_frames": int(used_face),
            "crop_methods_count": crop_methods,
            "calibrated": True,
            "insightface_enabled": bool(insightface_enabled()),
        })

        # ---- save report (mongo) ----
        if reports_col is not None and out.get("ok") is True:
            doc = build_report_doc(out, kind="video")
            await reports_col.insert_one(doc)
            out["report_id"] = doc["_id"]

        return out

    except Exception as e:
        return stable_fail("video", filename, f"Video inference failed: {e}")

    finally:
        try:
            os.remove(tmp_path)
        except Exception:
            pass


# =========================
# Reports endpoints
# =========================
@app.get("/reports")
async def list_reports(limit: int = 50, kind: str = "", pred: str = ""):
    if reports_col is None:
        return {"ok": False, "error": "MongoDB not configured"}

    q: Dict[str, Any] = {}
    if kind in ["image", "video"]:
        q["type"] = kind
    if pred in ["real", "fake"]:
        q["prediction"] = pred

    lim = int(min(max(limit, 1), 200))
    cursor = reports_col.find(q).sort("created_at", -1).limit(lim)
    items = await cursor.to_list(length=lim)

    for it in items:
        if "created_at" in it:
            it["created_at"] = _iso_z(it["created_at"])

    return {"ok": True, "items": items}


@app.get("/reports/{report_id}")
async def get_report(report_id: str):
    if reports_col is None:
        return {"ok": False, "error": "MongoDB not configured"}

    doc = await reports_col.find_one({"_id": report_id})
    if not doc:
        return {"ok": False, "error": "Not found"}

    if "created_at" in doc:
        doc["created_at"] = _iso_z(doc["created_at"])

    return {"ok": True, "item": doc}