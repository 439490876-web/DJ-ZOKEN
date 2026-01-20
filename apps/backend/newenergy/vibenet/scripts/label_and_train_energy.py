#!/usr/bin/env python3
import argparse
import csv
import os
import random
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Dict, Iterable, List, Optional, Tuple

import numpy as np

from vibenet.core import extract_mel, load_audio


ENERGY_HEADER = ["path", "energy", "predicted_energy"]


@dataclass
class LabelEntry:
    path: str
    energy: float
    predicted_energy: float


def _read_analysis_csv(path: Path) -> List[Tuple[str, float]]:
    with path.open("r", encoding="utf-8", newline="") as handle:
        reader = csv.DictReader(handle)
        if "path" not in reader.fieldnames or "energy" not in reader.fieldnames:
            raise ValueError("analysis csv must include 'path' and 'energy' columns")
        rows = []
        for row in reader:
            track_path = row["path"].strip()
            if not track_path:
                continue
            try:
                energy = float(row["energy"])
            except (TypeError, ValueError) as exc:
                raise ValueError(f"invalid energy value for {track_path}") from exc
            rows.append((track_path, energy))
        return rows


def _load_labels(path: Path) -> Dict[str, LabelEntry]:
    if not path.exists():
        return {}
    with path.open("r", encoding="utf-8", newline="") as handle:
        reader = csv.DictReader(handle)
        if not reader.fieldnames:
            return {}
        labels: Dict[str, LabelEntry] = {}
        for row in reader:
            track_path = row.get("path", "").strip()
            if not track_path:
                continue
            try:
                energy = float(row.get("energy", ""))
            except (TypeError, ValueError):
                continue
            predicted = row.get("predicted_energy", "")
            try:
                predicted_energy = float(predicted) if predicted else energy
            except (TypeError, ValueError):
                predicted_energy = energy
            if energy > 1.0:
                energy /= 100.0
            if predicted_energy > 1.0:
                predicted_energy /= 100.0
            labels[track_path] = LabelEntry(
                path=track_path,
                energy=float(np.clip(energy, 0.0, 1.0)),
                predicted_energy=float(np.clip(predicted_energy, 0.0, 1.0)),
            )
        return labels


def _append_label(path: Path, entry: LabelEntry) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    write_header = not path.exists() or path.stat().st_size == 0
    with path.open("a", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=ENERGY_HEADER)
        if write_header:
            writer.writeheader()
        writer.writerow(
            {
                "path": entry.path,
                "energy": f"{entry.energy:.6f}",
                "predicted_energy": f"{entry.predicted_energy:.6f}",
            }
        )


def _prompt_energy(track_name: str, predicted: float) -> Optional[float]:
    display_pred = predicted * 100.0
    while True:
        print(f"\nTrack: {track_name}")
        print(f"Predicted energy: {display_pred:.1f} (0-100)")
        resp = input(
            "Enter correct energy (0-100, blank=use predicted, s=skip, q=quit): "
        ).strip()
        if resp == "":
            return predicted
        if resp.lower() in {"p", "pred", "predicted"}:
            return predicted
        if resp.lower() in {"s", "skip"}:
            return None
        if resp.lower() in {"q", "quit"}:
            raise KeyboardInterrupt
        try:
            value = float(resp)
        except ValueError:
            print("Invalid input. Enter a number between 0-100.")
            continue
        if value < 0 or value > 100:
            print("Energy must be between 0 and 100.")
            continue
        return value / 100.0


def label_tracks(analysis_csv: Path, labels_out: Path) -> Path:
    rows = _read_analysis_csv(analysis_csv)
    existing = _load_labels(labels_out)
    total = len(rows)

    for idx, (track_path, predicted) in enumerate(rows, start=1):
        if track_path in existing:
            continue
        track_name = Path(track_path).name
        print(f"\n[{idx}/{total}]")
        try:
            value = _prompt_energy(track_name, float(np.clip(predicted, 0.0, 1.0)))
        except KeyboardInterrupt:
            print("\nLabeling stopped by user.")
            break
        if value is None:
            continue
        entry = LabelEntry(
            path=track_path,
            energy=float(np.clip(value, 0.0, 1.0)),
            predicted_energy=float(np.clip(predicted, 0.0, 1.0)),
        )
        _append_label(labels_out, entry)
        existing[track_path] = entry

    return labels_out


def _select_device(device_arg: str) -> str:
    if device_arg != "auto":
        return device_arg
    try:
        import torch
    except ImportError:
        return "cpu"
    if torch.cuda.is_available():
        return "cuda"
    if getattr(torch.backends, "mps", None) and torch.backends.mps.is_available():
        return "mps"
    return "cpu"


def _segment_waveforms(
    waveform: np.ndarray,
    target_len: int,
    segments: int,
    random_crop: bool,
    rng: np.random.Generator,
) -> List[np.ndarray]:
    if waveform.shape[0] < target_len:
        pad = target_len - waveform.shape[0]
        waveform = np.pad(waveform, (0, pad))
        return [waveform]

    max_start = waveform.shape[0] - target_len
    if segments <= 1:
        if random_crop:
            start = int(rng.integers(0, max_start + 1))
        else:
            start = 0
        return [waveform[start : start + target_len]]

    if random_crop:
        starts = rng.integers(0, max_start + 1, size=segments)
    else:
        if max_start == 0:
            starts = np.zeros(segments, dtype=int)
        else:
            starts = np.linspace(0, max_start, num=segments, dtype=int)

    return [waveform[int(s) : int(s) + target_len] for s in starts]


class EnergyDataset:
    def __init__(
        self,
        items: List[Tuple[str, float]],
        target_seconds: float,
        random_crop: bool,
        seed: int,
    ) -> None:
        self.items = items
        self.target_seconds = target_seconds
        self.random_crop = random_crop
        self.rng = np.random.default_rng(seed)

    def __len__(self) -> int:
        return len(self.items)

    def __getitem__(self, idx: int):
        path, energy = self.items[idx]
        waveform = load_audio(path, target_sr=16000)
        target_len = int(16000 * self.target_seconds)
        segment = _segment_waveforms(
            waveform, target_len, segments=1, random_crop=self.random_crop, rng=self.rng
        )[0]
        mel = extract_mel(segment, 16000)

        import torch

        return torch.from_numpy(mel), torch.tensor(energy, dtype=torch.float32)


def _load_label_items(labels_path: Path) -> List[Tuple[str, float]]:
    labels = _load_labels(labels_path)
    items = []
    for entry in labels.values():
        if os.path.isfile(entry.path):
            items.append((entry.path, entry.energy))
    return items


def train_energy(
    labels_path: Path,
    model_out: Path,
    epochs: int,
    batch_size: int,
    lr: float,
    val_ratio: float,
    seed: int,
    target_seconds: float,
    random_crop: bool,
    segments_per_track: int,
    device_arg: str,
    num_workers: int,
) -> None:
    try:
        import torch
        from torch import nn
        from torch.utils.data import DataLoader
        from torchvision.models import efficientnet_b0
    except ImportError as exc:
        raise RuntimeError(
            "Training requires torch and torchvision. Install them first."
        ) from exc

    class EnergyNet(nn.Module):
        def __init__(self) -> None:
            super().__init__()
            self.backbone = efficientnet_b0(weights=None)
            self.backbone.classifier = nn.Identity()
            self.trunk = nn.Sequential(
                nn.LayerNorm(1280),
                nn.Linear(1280, 256),
                nn.GELU(),
                nn.Dropout(0.2),
            )
            self.head = nn.Linear(256, 1)

        def forward(self, x: torch.Tensor) -> torch.Tensor:
            x = x.unsqueeze(1)
            x = x.repeat(1, 3, 1, 1)
            x = self.backbone(x)
            x = self.trunk(x)
            x = self.head(x).squeeze(-1)
            return torch.sigmoid(x)

    items = _load_label_items(labels_path)
    if len(items) < 2:
        raise RuntimeError("Need at least 2 labeled tracks to train.")

    rng = random.Random(seed)
    rng.shuffle(items)
    split = int(len(items) * (1.0 - val_ratio))
    split = max(1, min(split, len(items) - 1))

    train_items = items[:split]
    val_items = items[split:]
    if segments_per_track > 1:
        train_items = train_items * segments_per_track

    train_ds = EnergyDataset(train_items, target_seconds, random_crop, seed)
    val_ds = EnergyDataset(val_items, target_seconds, False, seed)

    train_dl = DataLoader(train_ds, batch_size=batch_size, shuffle=True, num_workers=num_workers)
    val_dl = DataLoader(val_ds, batch_size=batch_size, shuffle=False, num_workers=num_workers)

    device = _select_device(device_arg)
    model = EnergyNet().to(device)
    optimizer = torch.optim.AdamW(model.parameters(), lr=lr)
    criterion = nn.MSELoss()

    best_val = float("inf")

    for epoch in range(1, epochs + 1):
        model.train()
        train_losses = []
        for batch_x, batch_y in train_dl:
            batch_x = batch_x.to(device)
            batch_y = batch_y.to(device)
            optimizer.zero_grad()
            pred = model(batch_x)
            loss = criterion(pred, batch_y)
            loss.backward()
            optimizer.step()
            train_losses.append(loss.item())

        model.eval()
        val_losses = []
        with torch.no_grad():
            for batch_x, batch_y in val_dl:
                batch_x = batch_x.to(device)
                batch_y = batch_y.to(device)
                pred = model(batch_x)
                val_loss = criterion(pred, batch_y)
                val_losses.append(val_loss.item())

        train_mean = float(np.mean(train_losses)) if train_losses else 0.0
        val_mean = float(np.mean(val_losses)) if val_losses else 0.0
        print(f"Epoch {epoch}/{epochs} - train_loss={train_mean:.6f} val_loss={val_mean:.6f}")

        if val_mean < best_val:
            best_val = val_mean
            model_out.parent.mkdir(parents=True, exist_ok=True)
            torch.save({"model_state": model.state_dict()}, model_out)

    print(f"Best val loss: {best_val:.6f}")
    print(f"Model saved to: {model_out}")


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Label tracks with custom energy values and train an energy-only model."
    )
    parser.add_argument("--analysis-csv", type=Path, required=True, help="CSV from vibenet results.")
    parser.add_argument(
        "--labels-out",
        type=Path,
        default=None,
        help="Output CSV for human energy labels.",
    )
    parser.add_argument(
        "--model-out",
        type=Path,
        default=Path("checkpoints/energy_model.pt"),
        help="Path to save the trained model.",
    )
    parser.add_argument("--skip-labeling", action="store_true", help="Skip interactive labeling.")
    parser.add_argument("--label-only", action="store_true", help="Only collect labels.")
    parser.add_argument("--epochs", type=int, default=5)
    parser.add_argument("--batch-size", type=int, default=8)
    parser.add_argument("--lr", type=float, default=1e-4)
    parser.add_argument("--val-ratio", type=float, default=0.15)
    parser.add_argument("--seed", type=int, default=42)
    parser.add_argument("--target-seconds", type=float, default=31.0)
    parser.add_argument("--random-crop", action="store_true")
    parser.add_argument(
        "--segments-per-track",
        type=int,
        default=1,
        help="Number of random segments per track (training only).",
    )
    parser.add_argument("--device", type=str, default="auto", choices=["auto", "cpu", "cuda", "mps"])
    parser.add_argument("--num-workers", type=int, default=0)
    parser.add_argument(
        "--menu",
        action=argparse.BooleanOptionalAction,
        default=True,
        help="Show an interactive menu to label/train repeatedly.",
    )
    return parser


def _load_energy_model(model_path: Path, device_arg: str):
    try:
        import torch
        from torch import nn
        from torchvision.models import efficientnet_b0
    except ImportError as exc:
        raise RuntimeError(
            "Prediction requires torch and torchvision. Install them first."
        ) from exc

    class EnergyNet(nn.Module):
        def __init__(self) -> None:
            super().__init__()
            self.backbone = efficientnet_b0(weights=None)
            self.backbone.classifier = nn.Identity()
            self.trunk = nn.Sequential(
                nn.LayerNorm(1280),
                nn.Linear(1280, 256),
                nn.GELU(),
                nn.Dropout(0.2),
            )
            self.head = nn.Linear(256, 1)

        def forward(self, x: torch.Tensor) -> torch.Tensor:
            x = x.unsqueeze(1)
            x = x.repeat(1, 3, 1, 1)
            x = self.backbone(x)
            x = self.trunk(x)
            x = self.head(x).squeeze(-1)
            return torch.sigmoid(x)

    device = _select_device(device_arg)
    model = EnergyNet().to(device)
    state = torch.load(model_path, map_location=device)
    if isinstance(state, dict) and "model_state" in state:
        model.load_state_dict(state["model_state"])
    else:
        model.load_state_dict(state)
    model.eval()
    return model, device


def predict_energy(
    analysis_csv: Path,
    model_path: Path,
    output_csv: Path,
    target_seconds: float,
    segments_per_track: int,
    random_crop: bool,
    device_arg: str,
    seed: int = 42,
) -> Path:
    import torch

    rows = _read_analysis_csv(analysis_csv)
    model, device = _load_energy_model(model_path, device_arg)
    rng = np.random.default_rng(seed)
    target_len = int(16000 * target_seconds)

    output_csv.parent.mkdir(parents=True, exist_ok=True)
    with output_csv.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.writer(handle)
        writer.writerow(["path", "energy", "energy_100"])
        for path, _ in rows:
            if not os.path.isfile(path):
                continue
            waveform = load_audio(path, target_sr=16000)
            segments = _segment_waveforms(
                waveform,
                target_len=target_len,
                segments=max(1, segments_per_track),
                random_crop=random_crop,
                rng=rng,
            )
            mels = [extract_mel(seg, 16000) for seg in segments]
            batch = torch.from_numpy(np.stack(mels)).to(device)
            with torch.no_grad():
                preds = model(batch).detach().cpu().numpy().astype(np.float64)
            energy = float(np.mean(preds))
            writer.writerow([path, f"{energy:.6f}", f"{energy * 100.0:.2f}"])

    return output_csv


def main() -> int:
    parser = build_parser()
    args = parser.parse_args()

    labels_out = args.labels_out
    if labels_out is None:
        labels_out = args.analysis_csv.with_name("energy_labels.csv")

    if not args.skip_labeling:
        label_tracks(args.analysis_csv, labels_out)

    if args.label_only:
        print(f"Labels saved to: {labels_out}")
        return 0
    if args.menu:
        while True:
            choice = input(
                "\nOptions: [t]rain, [l]abel more, [q]uit: "
            ).strip().lower()
            if choice in {"t", "train"}:
                train_energy(
                    labels_path=labels_out,
                    model_out=args.model_out,
                    epochs=args.epochs,
                    batch_size=args.batch_size,
                    lr=args.lr,
                    val_ratio=args.val_ratio,
                    seed=args.seed,
                    target_seconds=args.target_seconds,
                    random_crop=args.random_crop,
                    segments_per_track=args.segments_per_track,
                    device_arg=args.device,
                    num_workers=args.num_workers,
                )
            elif choice in {"l", "label"}:
                label_tracks(args.analysis_csv, labels_out)
            elif choice in {"q", "quit", "exit"}:
                break
            else:
                print("Unknown option. Choose t, l, or q.")
        return 0

    train_energy(
        labels_path=labels_out,
        model_out=args.model_out,
        epochs=args.epochs,
        batch_size=args.batch_size,
        lr=args.lr,
        val_ratio=args.val_ratio,
        seed=args.seed,
        target_seconds=args.target_seconds,
        random_crop=args.random_crop,
        segments_per_track=args.segments_per_track,
        device_arg=args.device,
        num_workers=args.num_workers,
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
