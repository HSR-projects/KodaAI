/**
 * Heuristic capability detection for Ollama Cloud models, keyed off the model
 * id. Used to decide whether an attachment (image / audio) can actually be fed
 * to the selected model, and to bias "Auto" selection toward a capable model.
 *
 * Patterns are matched against the lowercased model id and kept deliberately
 * broad so new model drops light up without code changes.
 */

const VISION_PATTERNS: RegExp[] = [
  /vision/,
  /\bvl\b/,
  /-vl[-:]/,
  /llava/,
  /bakllava/,
  /moondream/,
  /minicpm-?v/,
  /pixtral/,
  /\bllama-?4\b/,
  /gemma-?3/,
  /qwen2\.?5-?vl/,
  /qwen2-?vl/,
  /granite.*vision/,
  /mistral-small-?3\.[12]/,
  /\bomni\b/,
];

const AUDIO_PATTERNS: RegExp[] = [/\bomni\b/, /audio/, /whisper/, /-asr\b/];

/** Can this model accept image input? */
export function supportsVision(model: string): boolean {
  const m = model.toLowerCase();
  return VISION_PATTERNS.some((p) => p.test(m));
}

/** Can this model accept audio input? */
export function supportsAudio(model: string): boolean {
  const m = model.toLowerCase();
  return AUDIO_PATTERNS.some((p) => p.test(m));
}
