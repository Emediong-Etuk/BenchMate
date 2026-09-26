import { z } from "zod";

// Shape the LLM must return (brief §11.2), plus the JSON Schema sent to the
// gateway. Limits keep a runaway response from producing a 500-step protocol.

export const MAX_INPUT_CHARS = 20_000;
export const MAX_STEPS = 200;
export const MAX_KEYTERMS = 60;

export const LlmProtocolSchema = z.object({
  title: z.string().trim().max(200).catch(""),
  steps: z
    .array(
      z.object({
        text: z.string().trim().min(1).max(2000),
        duration_seconds: z
          .number()
          .int()
          .positive()
          .max(7 * 24 * 3600)
          .nullable()
          .catch(null),
        reagents: z.array(z.string().trim().min(1).max(120)).max(30).catch([]),
      }),
    )
    .min(1)
    .max(MAX_STEPS),
  keyterms: z.array(z.string().trim().min(1).max(60)).catch([]),
});

export type LlmProtocol = z.infer<typeof LlmProtocolSchema>;

export const LLM_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["title", "steps", "keyterms"],
  properties: {
    title: { type: "string" },
    steps: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["text", "duration_seconds", "reagents"],
        properties: {
          text: { type: "string" },
          duration_seconds: { type: ["integer", "null"] },
          reagents: { type: "array", items: { type: "string" } },
        },
      },
    },
    keyterms: { type: "array", items: { type: "string" } },
  },
} as const;

export const ParseRequestSchema = z.object({
  text: z.string().min(1, "Paste some protocol text first.").max(MAX_INPUT_CHARS, `Protocol text is limited to ${MAX_INPUT_CHARS.toLocaleString("en-US")} characters.`),
  title: z.string().max(200).optional(),
  source: z.enum(["pasted", "uploaded"]).optional(),
});
