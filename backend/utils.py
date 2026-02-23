import os
import tempfile
import subprocess
from typing import Dict, Any, List

import torch
import torch.nn.functional as F
import numpy as np
from PIL import Image

from system.models_custom import get_moe_image_model
from preprocess import pil_to_tensor  # ✅ single source of preprocessing

CLASS_NAMES = ["REAL", "FAKE"]

# Match your training defaults (and allow env overrides)
DEFAULT_IMAGE_SIZE = int(os.getenv("IMAGE_SIZE", "224"))

# "Professional" decision thresholds (env overridable)
CONF_THRESH = float(os.getenv("CONF_THRESH", "0.65"))     # accept label if confidence >= 0.65
MARGIN_THRESH = float(os.getenv("MARGIN_THRESH", "0.10")) # accept if prob gap >= 0.10

# ffmpeg tuning
DEFAULT_VIDEO_FPS = float(os.getenv("VIDEO_FPS", "1.0"))
DEFAULT_MAX_FRAMES = int(os.getenv("MAX_FRAMES", "32"))


def get_device() -> torch.device:
    # Your current backend uses CPU torch (2.10.0+cpu) — this will still work.
    return torch.device("cuda" if torch.cuda.is_available() else "cpu")


def load_model(model_path: str) -> torch.nn.Module:
    """
    Loads MoE model and weights from .pth.
    """
    device = get_device()
    model = get_moe_image_model().to(device)
    model.eval()

    if not os.path.exists(model_path):
        raise FileNotFoundError(f"Checkpoint not found: {model_path}")

    state = torch.load(model_path, map_location=device)

    # Some checkpoints saved as {"state_dict": ...}
    if isinstance(state, dict) and "state_dict" in state:
        state = state["state_dict"]

    # Try strict first then fallback to non-strict
    try:
        model.load_state_dict(state, strict=True)
    except Exception:
        model.load_state_dict(state, strict=False)

    return model


def _decision_from_probs(probs: np.ndarray) -> Dict[str, Any]:
    """
    probs: shape (2,) for [prob_real, prob_fake]
    Returns professional decision dict.
    """
    probs = np.asarray(probs, dtype=np.float32)
    p_real = float(probs[0])
    p_fake = float(probs[1])

    pred_idx = int(np.argmax(probs))
    conf = float(probs[pred_idx])
    gap = float(abs(p_real - p_fake))

    if conf < CONF_THRESH or gap < MARGIN_THRESH:
        label = "uncertain"
        decision = "review"
    else:
        label = "real" if pred_idx == 0 else "fake"
        decision = "accept"

    return {
        "prediction": label,
        "decision": decision,
        "confidence": conf,
        "prob_real": p_real,
        "prob_fake": p_fake,
        "gap": gap,
        "threshold_conf": CONF_THRESH,
        "threshold_gap": MARGIN_THRESH,
    }


@torch.no_grad()
def predict_image(model: torch.nn.Module, pil_img: Image.Image) -> Dict[str, Any]:
    """
    Runs inference on one image.
    """
    device = next(model.parameters()).device

    x = pil_to_tensor(pil_img, img_size=DEFAULT_IMAGE_SIZE).to(device)
    logits = model(x)
    probs = F.softmax(logits, dim=1).detach().cpu().numpy()[0]  # (2,)

    out = _decision_from_probs(probs)
    out["type"] = "image"
    out["filename"] = getattr(pil_img, "filename", None) or "uploaded_image"
    return out


def _aggregate_frame_probs(frame_probs: List[np.ndarray]) -> Dict[str, Any]:
    """
    Aggregates per-frame probs using mean probability (stable & paper-friendly).
    Returns REAL/FAKE (not uncertain) + confidence.
    """
    if not frame_probs:
        return {
            "prediction": "UNKNOWN",
            "prob_real": 0.0,
            "prob_fake": 0.0,
            "confidence": 0.0,
            "frames_used": 0,
        }

    mat = np.stack(frame_probs, axis=0)  # [T,2]
    mean_probs = mat.mean(axis=0)        # [2]
    pred_idx = int(np.argmax(mean_probs))

    return {
        "prediction": CLASS_NAMES[pred_idx],
        "pred_idx": pred_idx,
        "prob_real": float(mean_probs[0]),
        "prob_fake": float(mean_probs[1]),
        "confidence": float(mean_probs[pred_idx]),
        "frames_used": int(mat.shape[0]),
    }


def extract_frames_ffmpeg(
    video_path: str,
    out_dir: str,
    fps: float = DEFAULT_VIDEO_FPS,
    max_frames: int = DEFAULT_MAX_FRAMES,
) -> List[str]:
    """
    Extract frames using ffmpeg at given fps into out_dir.
    Requires ffmpeg installed & in PATH.
    """
    os.makedirs(out_dir, exist_ok=True)
    pattern = os.path.join(out_dir, "frame_%04d.jpg")

    cmd = [
        "ffmpeg",
        "-y",
        "-i", video_path,
        "-vf", f"fps={fps}",
        "-frames:v", str(max_frames),
        pattern
    ]

    proc = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
    if proc.returncode != 0:
        raise RuntimeError(f"ffmpeg failed: {proc.stderr[-1200:]}")

    frames = sorted(
        os.path.join(out_dir, f)
        for f in os.listdir(out_dir)
        if f.lower().endswith((".jpg", ".jpeg", ".png", ".webp", ".bmp"))
    )
    return frames


@torch.no_grad()
def predict_video(
    model: torch.nn.Module,
    video_path: str,
    fps: float = DEFAULT_VIDEO_FPS,
    max_frames: int = DEFAULT_MAX_FRAMES,
) -> Dict[str, Any]:
    """
    Extract frames -> predict each -> aggregate + also provide per-frame list.
    """
    device = next(model.parameters()).device

    with tempfile.TemporaryDirectory() as tmpdir:
        frames = extract_frames_ffmpeg(video_path, tmpdir, fps=fps, max_frames=max_frames)

        frame_probs: List[np.ndarray] = []
        per_frame: List[Dict[str, Any]] = []

        for i, fp in enumerate(frames):
            try:
                img = Image.open(fp).convert("RGB")
            except Exception:
                continue

            x = pil_to_tensor(img, img_size=DEFAULT_IMAGE_SIZE).to(device)
            logits = model(x)
            probs = F.softmax(logits, dim=1).detach().cpu().numpy()[0]  # (2,)

            frame_probs.append(probs)
            per_frame.append({
                "frame_index": i,
                "prob_real": float(probs[0]),
                "prob_fake": float(probs[1]),
                "prediction": CLASS_NAMES[int(np.argmax(probs))],
                "path": os.path.basename(fp),
            })

        agg = _aggregate_frame_probs(frame_probs)

        # For videos, we can also provide a "decision" layer similar to image (optional)
        decision = _decision_from_probs(np.array([agg["prob_real"], agg["prob_fake"]], dtype=np.float32))

        return {
            "type": "video",
            "filename": os.path.basename(video_path),
            "fps": float(fps),
            "max_frames": int(max_frames),
            "frames_extracted": int(len(frames)),
            "frames_used": int(agg.get("frames_used", 0)),
            "aggregate": agg,          # REAL/FAKE + mean probs
            "decision": decision,      # accept/review/uncertain logic
            "per_frame": per_frame,    # detailed frame outputs
        }
