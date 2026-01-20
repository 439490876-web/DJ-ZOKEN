#!/usr/bin/env python3
from __future__ import annotations

import threading
from dataclasses import asdict
from pathlib import Path
from typing import Dict, List, Optional, Tuple

import tkinter as tk
from tkinter import messagebox, ttk

try:
    from label_and_train_energy import (
        LabelEntry,
        _load_labels,
        _read_analysis_csv,
        predict_energy,
        train_energy,
    )
except ImportError as exc:  # pragma: no cover - runtime import guard
    raise SystemExit(
        "Run this script from the repo root: python scripts/label_and_train_energy_gui.py"
    ) from exc


class EnergyLabelerGUI(tk.Tk):
    def __init__(self, analysis_csv: Path, labels_out: Path, model_out: Path) -> None:
        super().__init__()
        self.title("VibeNet 能量标注器")
        self.geometry("920x640")
        self.minsize(840, 600)

        self.analysis_csv = analysis_csv
        self.labels_out = labels_out
        self.model_out = model_out

        self.rows: List[Tuple[str, float]] = []
        self.labels: Dict[str, LabelEntry] = {}
        self.predicted: Dict[str, float] = {}
        self.training = False

        self._build_ui()
        self._load_analysis()

    def _build_ui(self) -> None:
        instructions = (
            "使用步骤：\n"
            "1）确认分析结果 CSV 路径（vibenet_results*.csv）。\n"
            "2）在左侧列表选择歌曲。\n"
            "3）输入你心目中的能量值（0-100），点击“保存”或“保存并下一个”。\n"
            "4）随时点击“训练”使用当前标签训练模型。\n"
            "5）点击“重新分析”用训练后的模型重算能量值。\n"
            "提示：能量值留空表示使用预测值。建议开启“随机截取”以覆盖不同段落。"
        )
        instr_label = tk.Label(self, text=instructions, justify="left", anchor="w")
        instr_label.pack(fill="x", padx=12, pady=(10, 6))

        path_frame = tk.Frame(self)
        path_frame.pack(fill="x", padx=12)

        tk.Label(path_frame, text="分析 CSV：").grid(row=0, column=0, sticky="w")
        self.analysis_var = tk.StringVar(value=str(self.analysis_csv))
        tk.Entry(path_frame, textvariable=self.analysis_var, width=80).grid(
            row=0, column=1, sticky="we", padx=6
        )
        tk.Button(path_frame, text="重新加载", command=self._load_analysis).grid(
            row=0, column=2, padx=(6, 0)
        )

        tk.Label(path_frame, text="标签 CSV：").grid(row=1, column=0, sticky="w")
        self.labels_var = tk.StringVar(value=str(self.labels_out))
        tk.Entry(path_frame, textvariable=self.labels_var, width=80).grid(
            row=1, column=1, sticky="we", padx=6
        )

        tk.Label(path_frame, text="模型输出：").grid(row=2, column=0, sticky="w")
        self.model_var = tk.StringVar(value=str(self.model_out))
        tk.Entry(path_frame, textvariable=self.model_var, width=80).grid(
            row=2, column=1, sticky="we", padx=6
        )

        tk.Label(path_frame, text="重新分析输出：").grid(row=3, column=0, sticky="w")
        self.reanalysis_var = tk.StringVar()
        tk.Entry(path_frame, textvariable=self.reanalysis_var, width=80).grid(
            row=3, column=1, sticky="we", padx=6
        )

        path_frame.columnconfigure(1, weight=1)

        main_frame = tk.Frame(self)
        main_frame.pack(fill="both", expand=True, padx=12, pady=6)

        list_frame = tk.Frame(main_frame)
        list_frame.pack(side="left", fill="both", expand=True)

        self.listbox = tk.Listbox(list_frame)
        self.listbox.pack(side="left", fill="both", expand=True)
        self.listbox.bind("<<ListboxSelect>>", self._on_select)

        scrollbar = tk.Scrollbar(list_frame, orient="vertical", command=self.listbox.yview)
        scrollbar.pack(side="right", fill="y")
        self.listbox.config(yscrollcommand=scrollbar.set)

        detail_frame = tk.Frame(main_frame, padx=10)
        detail_frame.pack(side="right", fill="both", expand=True)

        tk.Label(detail_frame, text="歌曲：").grid(row=0, column=0, sticky="w")
        self.track_var = tk.StringVar()
        tk.Label(detail_frame, textvariable=self.track_var, wraplength=320, justify="left").grid(
            row=0, column=1, sticky="w"
        )

        tk.Label(detail_frame, text="预测能量：").grid(row=1, column=0, sticky="w")
        self.pred_var = tk.StringVar()
        tk.Label(detail_frame, textvariable=self.pred_var).grid(row=1, column=1, sticky="w")

        tk.Label(detail_frame, text="你的能量值（0-100）：").grid(row=2, column=0, sticky="w")
        self.energy_var = tk.StringVar()
        tk.Entry(detail_frame, textvariable=self.energy_var, width=12).grid(
            row=2, column=1, sticky="w"
        )

        button_frame = tk.Frame(detail_frame, pady=6)
        button_frame.grid(row=3, column=0, columnspan=2, sticky="w")
        tk.Button(button_frame, text="保存", command=self._save_label).pack(side="left")
        tk.Button(button_frame, text="保存并下一个", command=self._save_next).pack(
            side="left", padx=6
        )
        tk.Button(button_frame, text="清空", command=self._clear_entry).pack(side="left")

        train_frame = tk.LabelFrame(detail_frame, text="训练", padx=8, pady=6)
        train_frame.grid(row=4, column=0, columnspan=2, sticky="we", pady=(10, 0))

        self.epochs_var = tk.StringVar(value="5")
        self.batch_var = tk.StringVar(value="8")
        self.lr_var = tk.StringVar(value="0.0001")
        self.val_var = tk.StringVar(value="0.15")
        self.seconds_var = tk.StringVar(value="31.0")
        self.segments_var = tk.StringVar(value="1")
        self.random_crop_var = tk.BooleanVar(value=True)
        self.device_var = tk.StringVar(value="auto")

        tk.Label(train_frame, text="轮数").grid(row=0, column=0, sticky="w")
        tk.Entry(train_frame, textvariable=self.epochs_var, width=8).grid(
            row=0, column=1, sticky="w"
        )
        tk.Label(train_frame, text="批大小").grid(row=0, column=2, sticky="w", padx=(8, 0))
        tk.Entry(train_frame, textvariable=self.batch_var, width=8).grid(
            row=0, column=3, sticky="w"
        )
        tk.Label(train_frame, text="学习率").grid(row=1, column=0, sticky="w")
        tk.Entry(train_frame, textvariable=self.lr_var, width=8).grid(
            row=1, column=1, sticky="w"
        )
        tk.Label(train_frame, text="验证比例").grid(row=1, column=2, sticky="w", padx=(8, 0))
        tk.Entry(train_frame, textvariable=self.val_var, width=8).grid(
            row=1, column=3, sticky="w"
        )
        tk.Label(train_frame, text="设备").grid(row=2, column=0, sticky="w")
        ttk.OptionMenu(train_frame, self.device_var, "auto", "auto", "cpu", "cuda", "mps").grid(
            row=2, column=1, sticky="w"
        )

        tk.Label(train_frame, text="截取秒数").grid(row=2, column=2, sticky="w", padx=(8, 0))
        tk.Entry(train_frame, textvariable=self.seconds_var, width=8).grid(
            row=2, column=3, sticky="w"
        )

        tk.Label(train_frame, text="每首样本数").grid(row=3, column=0, sticky="w")
        tk.Entry(train_frame, textvariable=self.segments_var, width=8).grid(
            row=3, column=1, sticky="w"
        )
        tk.Checkbutton(train_frame, text="随机截取", variable=self.random_crop_var).grid(
            row=3, column=2, sticky="w", padx=(8, 0)
        )

        tk.Button(train_frame, text="训练", command=self._train).grid(
            row=4, column=0, columnspan=4, sticky="we", pady=(6, 0)
        )
        tk.Button(train_frame, text="重新分析", command=self._reanalysis).grid(
            row=5, column=0, columnspan=4, sticky="we", pady=(6, 0)
        )

        self.status_var = tk.StringVar(value="就绪。")
        tk.Label(detail_frame, textvariable=self.status_var, fg="blue").grid(
            row=5, column=0, columnspan=2, sticky="w", pady=(10, 0)
        )

        detail_frame.columnconfigure(1, weight=1)

    def _load_analysis(self) -> None:
        try:
            analysis_path = Path(self.analysis_var.get()).expanduser()
            self.rows = _read_analysis_csv(analysis_path)
        except Exception as exc:
            messagebox.showerror("错误", f"加载分析 CSV 失败：{exc}")
            return

        self.labels_out = Path(self.labels_var.get()).expanduser()
        self.labels = _load_labels(self.labels_out)
        self.predicted = {path: energy for path, energy in self.rows}

        if not self.reanalysis_var.get().strip():
            reanalysis_path = analysis_path.with_name(f"{analysis_path.stem}_reanalysis.csv")
            self.reanalysis_var.set(str(reanalysis_path))

        self.listbox.delete(0, tk.END)
        for idx, (path, _) in enumerate(self.rows):
            name = Path(path).name
            label_flag = "*" if path in self.labels else " "
            self.listbox.insert(tk.END, f"{label_flag} {idx + 1:04d} {name}")

        self.status_var.set(f"已加载 {len(self.rows)} 首歌曲。")

    def _selected_index(self) -> Optional[int]:
        selection = self.listbox.curselection()
        if not selection:
            return None
        return int(selection[0])

    def _on_select(self, _event=None) -> None:
        idx = self._selected_index()
        if idx is None:
            return
        path, predicted = self.rows[idx]
        entry = self.labels.get(path)
        self.track_var.set(Path(path).name)
        self.pred_var.set(f"{predicted * 100.0:.1f}")
        if entry:
            self.energy_var.set(f"{entry.energy * 100.0:.1f}")
        else:
            self.energy_var.set("")

    def _clear_entry(self) -> None:
        self.energy_var.set("")

    def _parse_energy(self, value: str, predicted: float) -> float:
        if value.strip() == "":
            return predicted
        try:
            energy = float(value)
        except ValueError as exc:
            raise ValueError("Energy must be a number.") from exc
        if energy < 0 or energy > 100:
            raise ValueError("Energy must be between 0 and 100.")
        return energy / 100.0

    def _save_label(self) -> None:
        idx = self._selected_index()
        if idx is None:
            messagebox.showinfo("选择歌曲", "请先选择一首歌曲。")
            return
        path, predicted = self.rows[idx]
        try:
            energy = self._parse_energy(self.energy_var.get(), predicted)
        except ValueError as exc:
            messagebox.showerror("能量值无效", str(exc))
            return
        entry = LabelEntry(path=path, energy=energy, predicted_energy=predicted)
        self.labels[path] = entry
        self._write_labels()
        self._mark_labelled(idx)
        self.status_var.set(f"已保存：{Path(path).name}")

    def _save_next(self) -> None:
        self._save_label()
        idx = self._selected_index()
        if idx is None:
            return
        if idx + 1 < len(self.rows):
            self.listbox.selection_clear(0, tk.END)
            self.listbox.selection_set(idx + 1)
            self.listbox.see(idx + 1)
            self._on_select()

    def _mark_labelled(self, idx: int) -> None:
        path, _ = self.rows[idx]
        name = Path(path).name
        self.listbox.delete(idx)
        self.listbox.insert(idx, f"* {idx + 1:04d} {name}")

    def _write_labels(self) -> None:
        self.labels_out = Path(self.labels_var.get()).expanduser()
        self.labels_out.parent.mkdir(parents=True, exist_ok=True)
        with self.labels_out.open("w", encoding="utf-8", newline="") as handle:
            handle.write("path,energy,predicted_energy\n")
            for entry in self.labels.values():
                handle.write(
                    f"{entry.path},{entry.energy:.6f},{entry.predicted_energy:.6f}\n"
                )

    def _train(self) -> None:
        if self.training:
            messagebox.showinfo("训练中", "训练正在进行中。")
            return
        self._write_labels()
        try:
            epochs = int(self.epochs_var.get())
            batch = int(self.batch_var.get())
            lr = float(self.lr_var.get())
            val_ratio = float(self.val_var.get())
            target_seconds = float(self.seconds_var.get())
            segments_per_track = int(self.segments_var.get())
        except ValueError:
            messagebox.showerror("设置错误", "请检查训练参数。")
            return
        if not (0.0 < val_ratio < 1.0):
            messagebox.showerror("设置错误", "验证比例必须在 0 和 1 之间。")
            return
        if target_seconds <= 0:
            messagebox.showerror("设置错误", "截取秒数必须大于 0。")
            return
        if segments_per_track < 1:
            messagebox.showerror("设置错误", "每首样本数必须大于等于 1。")
            return

        self.training = True
        self.status_var.set("训练中…进度在终端输出。")

        def _worker() -> None:
            try:
                train_energy(
                    labels_path=self.labels_out,
                    model_out=Path(self.model_var.get()).expanduser(),
                    epochs=epochs,
                    batch_size=batch,
                    lr=lr,
                    val_ratio=val_ratio,
                    seed=42,
                    target_seconds=target_seconds,
                    random_crop=bool(self.random_crop_var.get()),
                    segments_per_track=segments_per_track,
                    device_arg=self.device_var.get(),
                    num_workers=0,
                )
                self._set_status("训练完成。")
            except Exception as exc:
                self._set_status(f"训练失败：{exc}")
            finally:
                self.training = False

        thread = threading.Thread(target=_worker, daemon=True)
        thread.start()

    def _reanalysis(self) -> None:
        if self.training:
            messagebox.showinfo("繁忙", "训练正在进行中，请稍后再试。")
            return
        model_path = Path(self.model_var.get()).expanduser()
        if not model_path.exists():
            messagebox.showerror("模型不存在", "请先训练模型或检查模型路径。")
            return
        try:
            target_seconds = float(self.seconds_var.get())
            segments_per_track = int(self.segments_var.get())
        except ValueError:
            messagebox.showerror("设置错误", "请检查训练参数。")
            return
        if target_seconds <= 0:
            messagebox.showerror("设置错误", "截取秒数必须大于 0。")
            return
        if segments_per_track < 1:
            messagebox.showerror("设置错误", "每首样本数必须大于等于 1。")
            return

        analysis_path = Path(self.analysis_var.get()).expanduser()
        output_csv = Path(self.reanalysis_var.get()).expanduser()
        self.status_var.set("重新分析中…进度在终端输出。")

        def _worker() -> None:
            try:
                predict_energy(
                    analysis_csv=analysis_path,
                    model_path=model_path,
                    output_csv=output_csv,
                    target_seconds=target_seconds,
                    segments_per_track=segments_per_track,
                    random_crop=bool(self.random_crop_var.get()),
                    device_arg=self.device_var.get(),
                    seed=42,
                )
                self._set_status(f"重新分析完成：{output_csv}")
            except Exception as exc:
                self._set_status(f"重新分析失败：{exc}")

        threading.Thread(target=_worker, daemon=True).start()

    def _set_status(self, message: str) -> None:
        self.after(0, lambda: self.status_var.set(message))


def main() -> int:
    import argparse

    parser = argparse.ArgumentParser(description="GUI labeler for energy values.")
    parser.add_argument("--analysis-csv", type=Path, required=True)
    parser.add_argument("--labels-out", type=Path, default=None)
    parser.add_argument("--model-out", type=Path, default=Path("checkpoints/energy_model.pt"))
    args = parser.parse_args()

    labels_out = args.labels_out
    if labels_out is None:
        labels_out = args.analysis_csv.with_name("energy_labels.csv")

    app = EnergyLabelerGUI(args.analysis_csv, labels_out, args.model_out)
    app.mainloop()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
