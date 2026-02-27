#!/usr/bin/env python3
"""
Moonshine-tiny-ja を ExecuTorch (.pte) 形式にエクスポートするスクリプト

react-native-executorch の useSpeechToText と互換性のある
encoder/decoder 分離フォーマットで出力する

Usage:
    pip install executorch transformers torch
    python scripts/export_moonshine_ja.py --output ./pte_output

出力:
    ./pte_output/moonshine_tiny_ja_xnnpack_encoder.pte
    ./pte_output/moonshine_tiny_ja_xnnpack_decoder.pte
    ./pte_output/moonshine_tiny_ja_tokenizer.json
"""

import argparse
import json
import shutil
from pathlib import Path

import torch
from transformers import AutoTokenizer, AutoProcessor, MoonshineForConditionalGeneration


MODEL_ID = "UsefulSensors/moonshine-tiny-ja"


# ---- Encoder ラッパー ----

class MoonshineEncoder(torch.nn.Module):
    """
    Audio waveform → encoder hidden states

    Input:  waveform  [1, seq_len]  (16kHz Float32)
    Output: encoder_hidden_states  [1, T, hidden_size]
    """

    def __init__(self, model: MoonshineForConditionalGeneration):
        super().__init__()
        self.model = model

    def forward(self, waveform: torch.Tensor) -> torch.Tensor:
        # MoonshineForConditionalGeneration.model = MoonshineModel
        encoder_outputs = self.model.model.encoder(
            waveform,
            attention_mask=None,
            return_dict=False,
        )
        return encoder_outputs[0]  # last_hidden_state


# ---- Decoder ラッパー ----

class MoonshineDecoder(torch.nn.Module):
    """
    Autoregressive decoder (KV-cache なし、1ステップ)

    Inputs:
        input_ids          [1, seq_len]          token ids
        encoder_hidden     [1, T, hidden_size]   encoder output
    Output:
        logits             [1, seq_len, vocab_size]
    """

    def __init__(self, model: MoonshineForConditionalGeneration):
        super().__init__()
        self.model = model

    def forward(
        self,
        input_ids: torch.Tensor,
        encoder_hidden_states: torch.Tensor,
    ) -> torch.Tensor:
        outputs = self.model.model.decoder(
            input_ids=input_ids,
            encoder_hidden_states=encoder_hidden_states,
            return_dict=False,
        )
        hidden = outputs[0]
        logits = self.model.lm_head(hidden)
        return logits


def export_to_pte(module: torch.nn.Module, example_inputs: tuple, output_path: Path) -> None:
    """torch.export + XNNPACK lowering → .pte ファイル出力"""
    try:
        from executorch.backends.xnnpack.partition.xnnpack_partitioner import XnnpackPartitioner
        from executorch.exir import to_edge_transform_and_lower, EdgeCompileConfig
    except ImportError:
        raise ImportError(
            "executorch が見つかりません。\n"
            "pip install executorch でインストールしてください。"
        )

    print(f"  torch.export: {output_path.name} ...")
    exported = torch.export.export(module, example_inputs)

    print(f"  XNNPACK lowering ...")
    edge = to_edge_transform_and_lower(
        exported,
        partitioner=[XnnpackPartitioner()],
        compile_config=EdgeCompileConfig(_check_ir_validity=False),
    )

    exec_prog = edge.to_executorch()
    output_path.parent.mkdir(parents=True, exist_ok=True)
    with open(output_path, "wb") as f:
        exec_prog.write_to_file(f)
    print(f"  保存完了: {output_path} ({output_path.stat().st_size // 1024 // 1024} MB)")


def export_tokenizer(output_dir: Path) -> None:
    """tokenizer.json を出力ディレクトリにコピー"""
    from huggingface_hub import hf_hub_download
    src = hf_hub_download(repo_id=MODEL_ID, filename="tokenizer.json")
    dst = output_dir / "moonshine_tiny_ja_tokenizer.json"
    shutil.copy(src, dst)
    print(f"  tokenizer 保存完了: {dst}")


def main():
    parser = argparse.ArgumentParser(description="Moonshine-tiny-ja → .pte export")
    parser.add_argument("--output", default="./pte_output", help="出力ディレクトリ")
    parser.add_argument("--fp16", action="store_true", help="FP16 で export (experimental)")
    args = parser.parse_args()

    output_dir = Path(args.output)
    output_dir.mkdir(parents=True, exist_ok=True)

    print(f"モデルをダウンロード中: {MODEL_ID}")
    model = MoonshineForConditionalGeneration.from_pretrained(
        MODEL_ID, torch_dtype=torch.float16 if args.fp16 else torch.float32
    )
    model.eval()

    # ---- Encoder export ----
    print("\n[1/3] Encoder をエクスポート中...")
    encoder_module = MoonshineEncoder(model)

    # 16kHz, 5秒のダミー入力 (seq_len は可変だが export には固定長が必要)
    dummy_waveform = torch.randn(1, 16000 * 5, dtype=torch.float32)
    export_to_pte(
        encoder_module,
        (dummy_waveform,),
        output_dir / "moonshine_tiny_ja_xnnpack_encoder.pte",
    )

    # ---- Decoder export ----
    print("\n[2/3] Decoder をエクスポート中...")
    decoder_module = MoonshineDecoder(model)

    hidden_size = model.config.hidden_size  # 288
    dummy_input_ids = torch.ones(1, 1, dtype=torch.long)
    dummy_encoder_hidden = torch.randn(1, 100, hidden_size, dtype=torch.float32)

    export_to_pte(
        decoder_module,
        (dummy_input_ids, dummy_encoder_hidden),
        output_dir / "moonshine_tiny_ja_xnnpack_decoder.pte",
    )

    # ---- Tokenizer ----
    print("\n[3/3] Tokenizer をエクスポート中...")
    export_tokenizer(output_dir)

    # ---- 使い方を出力 ----
    print("\n✅ 完了!")
    print(f"\n出力ファイル:")
    for f in sorted(output_dir.glob("moonshine_tiny_ja_*")):
        size_mb = f.stat().st_size / 1024 / 1024
        print(f"  {f.name}  ({size_mb:.1f} MB)")

    encoder_url = "https://huggingface.co/YOUR_ORG/moonshine-tiny-ja-pte/resolve/main/moonshine_tiny_ja_xnnpack_encoder.pte"
    decoder_url = "https://huggingface.co/YOUR_ORG/moonshine-tiny-ja-pte/resolve/main/moonshine_tiny_ja_xnnpack_decoder.pte"
    tokenizer_url = "https://huggingface.co/YOUR_ORG/moonshine-tiny-ja-pte/resolve/main/moonshine_tiny_ja_tokenizer.json"

    print(f"""
次のステップ:
  1. HuggingFace に YOUR_ORG/moonshine-tiny-ja-pte リポジトリを作成
  2. pte_output/ の 3 ファイルをアップロード
  3. use-moonshine-model.native.ts の MOONSHINE_JA_MODEL を以下に更新:

     const MOONSHINE_JA_MODEL = {{
       isMultilingual: false,
       encoderSource: "{encoder_url}",
       decoderSource: "{decoder_url}",
       tokenizerSource: "{tokenizer_url}",
     }};
""")


if __name__ == "__main__":
    main()
