# Third-party components

Bundled into the site:

| Component | Version | Licence |
|---|---|---|
| [Transformers.js](https://github.com/huggingface/transformers.js) (`@huggingface/transformers`) | 3.8.1 | Apache-2.0 |
| [ONNX Runtime Web](https://github.com/microsoft/onnxruntime) (bundled by Transformers.js) | 1.22.0-dev | MIT |
| [kokoro-js](https://github.com/hexgrad/kokoro) | 1.2.1 | Apache-2.0 |
| [phonemizer](https://www.npmjs.com/package/phonemizer) (espeak-ng compiled to WebAssembly, used by kokoro-js) | 1.2.1 | Published as Apache-2.0; it is built from [espeak-ng](https://github.com/espeak-ng/espeak-ng), which is GPL-3.0. Review before any commercial or closed-source distribution. |
| React, React DOM | 19 | MIT |

Fetched by the visitor's browser on first use (not redistributed by this repo):

| Model | Licence |
|---|---|
| `onnx-community/whisper-base_timestamped` (OpenAI Whisper base) | MIT |
| `onnx-community/Kokoro-82M-v1.0-ONNX` (hexgrad/Kokoro-82M) and its voice files | Apache-2.0 |

Fonts: TeX Gyre Heros / Heros Condensed subsets (GUST Font License). Photos: Unsplash licence, credited in the site footer.

This is a summary, not legal advice.
