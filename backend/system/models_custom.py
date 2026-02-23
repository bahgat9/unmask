# backend/system/models_custom.py
# ✅ Updated to match your LATEST training/inference MoE used in main.py:
#   - FrequencyResNet18 uses 2-channel FFT maps (mag + mag*radial_mask)
#   - Full fft2 + fftshift + log magnitude
#   - Per-sample z-score normalization
#   - BN -> GN conversion for stability
#   - Gate uses embeddings + confidence + entropy (1284 input)
#   - Residual fusion with alpha
#
# IMPORTANT:
# - weights=None to avoid downloads on server
# - This file is now consistent with FastAPI main.py architecture

import torch
import torch.nn as nn
import torch.nn.functional as F
import torchvision.models as tvm

IMAGE_SIZE = 224


def bn_to_gn(module: nn.Module, gn_groups: int = 32) -> None:
    """
    Recursively replace BatchNorm2d with GroupNorm.
    Better for CPU + small batches.
    """
    for name, child in module.named_children():
        if isinstance(child, nn.BatchNorm2d):
            num_channels = child.num_features
            groups = min(gn_groups, num_channels)
            while groups > 1 and (num_channels % groups) != 0:
                groups -= 1
            setattr(module, name, nn.GroupNorm(groups, num_channels))
        else:
            bn_to_gn(child, gn_groups=gn_groups)


# -----------------------------
# Expert A: Spatial RGB (ConvNeXt-Tiny)
# -----------------------------
class SpatialConvNeXtTiny(nn.Module):
    def __init__(self, num_classes: int = 2, embed_dim: int = 768):
        super().__init__()
        self.backbone = tvm.convnext_tiny(weights=None)

        in_features = self.backbone.classifier[-1].in_features
        self.backbone.classifier = nn.Identity()

        self.embed = nn.Sequential(
            nn.LayerNorm(in_features),
            nn.Linear(in_features, embed_dim),
            nn.GELU(),
            nn.Dropout(0.3),
        )
        self.head = nn.Linear(embed_dim, num_classes)

    def forward(self, x: torch.Tensor):
        feat = self.backbone(x)
        if feat.dim() == 4:
            feat = torch.flatten(feat, 1)
        emb = self.embed(feat)
        logits = self.head(emb)
        return emb, logits


# -----------------------------
# Expert B: Frequency (ResNet18 on 2-ch FFT map)
# -----------------------------
class FrequencyResNet18(nn.Module):
    """
    Latest freq expert:
      - input: 2-channel FFT maps: [mag, mag * radial_mask]
      - full fft2 + fftshift
      - log magnitude
      - per-sample z-score normalization per channel
      - BN -> GN
    """
    def __init__(self, num_classes: int = 2, embed_dim: int = 512, gn_groups: int = 32):
        super().__init__()
        resnet = tvm.resnet18(weights=None)

        # conv1 -> 2 channels
        old_conv = resnet.conv1
        resnet.conv1 = nn.Conv2d(
            2,
            old_conv.out_channels,
            kernel_size=old_conv.kernel_size,
            stride=old_conv.stride,
            padding=old_conv.padding,
            bias=False,
        )
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

    def fft_map(self, x: torch.Tensor) -> torch.Tensor:
        """
        x: [B,3,H,W] normalized RGB
        returns: [B,2,224,224]
        """
        gray = (0.2989 * x[:, 0:1] + 0.5870 * x[:, 1:2] + 0.1140 * x[:, 2:3])

        fft = torch.fft.fft2(gray, norm="ortho")
        fft = torch.fft.fftshift(fft, dim=(-2, -1))

        mag = torch.log1p(torch.abs(fft))  # [B,1,H,W]

        B, _, H, W = mag.shape
        yy = torch.linspace(-1, 1, H, device=mag.device).view(1, 1, H, 1)
        xx = torch.linspace(-1, 1, W, device=mag.device).view(1, 1, 1, W)
        r = torch.sqrt(xx * xx + yy * yy).clamp(0, 1)

        hf = mag * r
        freq = torch.cat([mag, hf], dim=1)  # [B,2,H,W]

        flat = freq.view(B, 2, -1)
        mean = flat.mean(dim=2).view(B, 2, 1, 1)
        std = flat.std(dim=2).view(B, 2, 1, 1).clamp(min=1e-6)
        freq = (freq - mean) / std

        if (H, W) != (IMAGE_SIZE, IMAGE_SIZE):
            freq = F.interpolate(freq, size=(IMAGE_SIZE, IMAGE_SIZE), mode="bilinear", align_corners=False)

        return freq

    def forward(self, x_rgb: torch.Tensor):
        x_freq = self.fft_map(x_rgb)
        feat = self.backbone(x_freq)
        emb = self.embed(feat)
        logits = self.head(emb)
        return emb, logits


# -----------------------------
# Gate + MoE
# -----------------------------
class GatedMoEImage(nn.Module):
    """
    Latest gated MoE:
      - gate inputs: [emb_s, emb_f, conf_s, conf_f, ent_s, ent_f] => 768+512+4=1284
      - residual fusion with alpha
    """
    def __init__(self, num_classes: int = 2, gate_hidden: int = 256, alpha: float = 1.0):
        super().__init__()
        self.spatial = SpatialConvNeXtTiny(num_classes=num_classes, embed_dim=768)
        self.freq = FrequencyResNet18(num_classes=num_classes, embed_dim=512)
        self.alpha = float(alpha)

        gate_in = 768 + 512 + 4
        self.gate = nn.Sequential(
            nn.Linear(gate_in, gate_hidden),
            nn.ReLU(),
            nn.Dropout(0.2),
            nn.Linear(gate_hidden, 2),
        )

        # bias to favor spatial early (consistent with your main.py)
        with torch.no_grad():
            self.gate[-1].bias.copy_(torch.tensor([2.0, 0.0]))

    @staticmethod
    def _conf_entropy(logits: torch.Tensor):
        p = torch.softmax(logits.detach(), dim=1)
        conf = p.max(dim=1, keepdim=True).values
        ent = -(p * (p + 1e-8).log()).sum(dim=1, keepdim=True)
        return conf, ent

    def forward(self, x: torch.Tensor):
        emb_s, logits_s = self.spatial(x)
        emb_f, logits_f = self.freq(x)

        conf_s, ent_s = self._conf_entropy(logits_s)
        conf_f, ent_f = self._conf_entropy(logits_f)

        gate_inp = torch.cat([emb_s.detach(), emb_f.detach(), conf_s, conf_f, ent_s, ent_f], dim=1)
        gate_logits = self.gate(gate_inp)
        w = torch.softmax(gate_logits, dim=1)
        w_f = w[:, 1:2]

        logits = logits_s + self.alpha * w_f * (logits_f - logits_s)
        return logits

    def forward_expert(self, x: torch.Tensor, which: str = "spatial"):
        if which == "spatial":
            _, logits = self.spatial(x)
            return logits
        if which == "freq":
            _, logits = self.freq(x)
            return logits
        raise ValueError("which must be 'spatial' or 'freq'")


def get_moe_image_model(alpha: float = 1.0) -> GatedMoEImage:
    return GatedMoEImage(num_classes=2, alpha=alpha)