import type { ToolDefinition } from "@/lib/voice/events";

// Client-side function tools (brief §10.1). Descriptions are the model's main
// signal for WHEN to call; `examples` sharpen arguments and turn detection
// (tools overview docs). The server doesn't validate these schemas, so
// tests/tools.test.ts compiles every one with ajv.

// Free-text string arguments seem to be checked against the user's words on
// the voice path: a value the user didn't say (e.g. quantity "concentration",
// unit "ng/uL") makes the server silently drop the call and the reply (NOTES
// C13). So: enums for categories, units in the user's own words.
export const MEASUREMENT_QUANTITIES = [
  "concentration",
  "260 over 280",
  "260 over 230",
  "od600",
  "volume",
  "mass",
  "temperature",
  "ph",
  "time",
  "speed",
  "other",
] as const;

const base = { type: "function", execution_mode: "interactive", timeout_seconds: 30 } as const;

export const TOOL_NAMES = [
  "navigate_protocol",
  "record_measurement",
  "log_deviation",
  "log_observation",
  "void_last_entry",
  "start_timer",
  "list_timers",
  "cancel_timer",
  "set_volume",
  "finish_session",
] as const;

export type ToolName = (typeof TOOL_NAMES)[number];

const stepNumberForLog = {
  type: "integer",
  minimum: 1,
  description: "Only if the user names a step. Defaults to the current step.",
} as const;

export const TOOLS: ToolDefinition[] = [
  {
    ...base,
    name: "navigate_protocol",
    description:
      "Move through the loaded protocol and get the exact step text to read aloud. Call this whenever the user says start, next, done, repeat, go back, go to a step, or asks where they are. Always read the returned step text verbatim. Never read steps from memory.",
    parameters: {
      type: "object",
      properties: {
        action: {
          type: "string",
          enum: ["next", "previous", "repeat", "goto", "current"],
          description:
            "next = mark the current step done and move forward (also used to start). previous = go back one. repeat = re-read current step. goto = jump to step_number. current = report position.",
        },
        step_number: {
          type: "integer",
          minimum: 1,
          description: "Only for action 'goto'. 1-based step number, e.g. 9.",
          examples: [9, 3],
        },
      },
      required: ["action"],
    },
  },
  {
    ...base,
    name: "record_measurement",
    description:
      "Save ONE numeric reading the user reports: a concentration, absorbance ratio, volume, mass, temperature, pH, OD600, or time. Call as soon as the user states a value. If they state several values in one sentence, call this once per value.",
    parameters: {
      type: "object",
      properties: {
        sample_id: {
          type: "string",
          description:
            "Sample or tube label as spoken, with number words turned into digits. e.g. 'tube four' -> '4', 'sample two' -> '2', 'the control' -> 'control'. Omit if not tied to a sample.",
          examples: ["2", "control"],
        },
        quantity: {
          type: "string",
          enum: [...MEASUREMENT_QUANTITIES],
          description:
            "What was measured. Pick the closest match (a reading in nanograms per microliter → 'concentration'; '260 over 280' → '260 over 280'); 'other' if nothing fits.",
        },
        value: {
          type: "number",
          description: "The number exactly as stated. e.g. 245 or 1.86.",
          examples: [245, 1.86],
        },
        unit: {
          type: "string",
          description:
            "The unit exactly as the user said it, in plain words with no symbols or slashes, e.g. 'nanograms per microliter', 'microliters', 'degrees celsius', 'times g'. Omit for unitless ratios.",
          examples: ["nanograms per microliter"],
        },
        step_number: { ...stepNumberForLog, description: "Only if the user says which step this belongs to. Defaults to the current step." },
      },
      required: ["quantity", "value"],
    },
  },
  {
    ...base,
    name: "log_deviation",
    description:
      "Record any departure from the written protocol: a different time, volume, speed, temperature, reagent, order, or a skipped or repeated step. Call whenever the user says they did something differently from the protocol.",
    parameters: {
      type: "object",
      properties: {
        description: {
          type: "string",
          description: "One plain sentence in the user's own words. e.g. 'Spun for 3 minutes instead of 1.'",
        },
        planned: { type: "string", description: "What the protocol said, only in words the user used. e.g. '1 minute'. Omit if they didn't say." },
        actual: { type: "string", description: "What was actually done, in the user's words. e.g. '3 minutes'. Omit if they didn't say." },
        step_number: stepNumberForLog,
      },
      required: ["description"],
    },
  },
  {
    ...base,
    name: "log_observation",
    description:
      "Record something the user notices that isn't a number or a deviation: color, cloudiness, pellet size or absence, bubbles, a spill, an equipment problem.",
    parameters: {
      type: "object",
      properties: {
        text: { type: "string", description: "The observation in the user's own words. e.g. 'Tube 4 looks cloudy.'" },
        sample_id: { type: "string", description: "Sample label if mentioned, number words as digits. e.g. '4'.", examples: ["4", "control"] },
        step_number: stepNumberForLog,
      },
      required: ["text"],
    },
  },
  {
    ...base,
    name: "void_last_entry",
    description:
      "Void the most recent logged entry (measurement, deviation, or observation) when the user says scratch that, delete that, undo, or that's wrong. Voided entries are kept for the audit trail but excluded from results.",
    parameters: { type: "object", properties: {} },
  },
  {
    ...base,
    name: "start_timer",
    description:
      "Start a countdown timer. The app announces it when it ends. Convert spoken durations to seconds: 'ten minutes' -> 600, 'ninety seconds' -> 90, 'an hour and a half' -> 5400.",
    parameters: {
      type: "object",
      properties: {
        duration_seconds: { type: "integer", minimum: 1, maximum: 86400, description: "Duration in seconds. e.g. 600.", examples: [600, 60] },
        label: { type: "string", description: "Short name, only if the user gives one, in their words. e.g. 'incubation'. Omit otherwise; the app labels it after the current step." },
      },
      required: ["duration_seconds"],
    },
  },
  {
    ...base,
    name: "list_timers",
    description: "Report running timers and time remaining. Call when the user asks how long is left or what timers are running.",
    parameters: { type: "object", properties: {} },
  },
  {
    ...base,
    name: "cancel_timer",
    description: "Cancel a running timer. If only one timer is running, no label is needed.",
    parameters: {
      type: "object",
      properties: {
        label: { type: "string", description: "Label of the timer to cancel, e.g. 'incubation'." },
      },
    },
  },
  {
    ...base,
    name: "set_volume",
    description: "Change how loud BenchMate speaks. Call when the user says louder, quieter, volume up or down, or names a level.",
    parameters: {
      type: "object",
      properties: {
        change: { type: "string", enum: ["up", "down", "set"], description: "up/down move by 20 percentage points; set uses level." },
        level: { type: "integer", minimum: 0, maximum: 150, description: "Only for 'set'. Percent, e.g. 120.", examples: [120] },
      },
      required: ["change"],
    },
  },
  {
    ...base,
    name: "finish_session",
    description: "End the bench session and generate the notebook entry. Only call after the user has confirmed they want to finish.",
    parameters: { type: "object", properties: {} },
  },
];
