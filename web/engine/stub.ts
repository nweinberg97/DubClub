// Stand-in used only when the engine packages aren't installed (offline dev boxes).
// Real builds (CI, GitHub Pages) bundle @huggingface/transformers and kokoro-js instead.
const missing = () => {
  throw new Error('The dubbing engine isn’t included in this build. Run `npm install` and rebuild.');
};
export const env = { allowLocalModels: false, useBrowserCache: true, backends: { onnx: { wasm: {} as Record<string, unknown> } } };
export const pipeline = missing;
export class KokoroTTS {
  static from_pretrained = missing;
  generate = missing;
}
