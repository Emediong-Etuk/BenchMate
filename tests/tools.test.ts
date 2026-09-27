import Ajv from "ajv";
import { describe, expect, it } from "vitest";
import { TOOLS, TOOL_NAMES } from "@/lib/agent/tools";

// The Voice Agent API accepts malformed schemas silently (tools docs), so we
// compile every tool's parameters here (brief §10.4).

type Schema = { type?: string; properties?: Record<string, Schema>; required?: string[]; items?: Schema; description?: string };

function walkProperties(schema: Schema, path: string, visit: (path: string, prop: Schema) => void) {
  for (const [name, prop] of Object.entries(schema.properties ?? {})) {
    visit(`${path}.${name}`, prop);
    walkProperties(prop, `${path}.${name}`, visit);
    if (prop.items) walkProperties(prop.items, `${path}.${name}[]`, visit);
  }
}

describe("tool schemas", () => {
  const ajv = new Ajv({ strict: true, strictTypes: true, allErrors: true });

  it("keeps free-text categories as enums (the voice path drops unspoken free text, NOTES C13)", () => {
    const rec = TOOLS.find((t) => t.name === "record_measurement")!.parameters as { properties: Record<string, { enum?: string[] }> };
    expect(rec.properties.quantity!.enum).toContain("concentration");
    expect(JSON.stringify(TOOLS)).not.toMatch(/'[a-zµ]+\/[a-zµ]+'/i); // no slashy unit examples like 'ng/µL'
  });

  it("lists exactly the expected tools, ≤10 per the docs' guidance", () => {
    expect(TOOLS.map((t) => t.name)).toEqual([...TOOL_NAMES]);
    expect(TOOLS.length).toBeLessThanOrEqual(10);
  });

  it.each(TOOLS.map((t) => [t.name, t] as const))("%s compiles with ajv", (_name, tool) => {
    expect(() => ajv.compile(tool.parameters)).not.toThrow();
  });

  it.each(TOOLS.map((t) => [t.name, t] as const))("%s follows the lint rules", (name, tool) => {
    expect(name).toMatch(/^[a-z]+(_[a-z]+)+$/);
    expect(tool.type).toBe("function");
    expect(tool.execution_mode).toBe("interactive");
    expect(tool.timeout_seconds).toBe(30);
    expect(tool.description.length).toBeGreaterThan(30);
    const params = tool.parameters as Schema;
    expect(params.type).toBe("object");
    walkProperties(params, name, (path, prop) => {
      expect(prop.description, `${path} needs a description`).toBeTruthy();
    });
    const check = (s: Schema, path: string) => {
      for (const r of s.required ?? []) expect(Object.keys(s.properties ?? {}), `${path} requires missing '${r}'`).toContain(r);
      for (const [k, p] of Object.entries(s.properties ?? {})) {
        check(p, `${path}.${k}`);
        if (p.items) check(p.items, `${path}.${k}[]`);
      }
    };
    check(params, name);
  });

  it("validates realistic arguments and rejects bad ones", () => {
    const rec = ajv.compile(TOOLS.find((t) => t.name === "record_measurement")!.parameters);
    expect(rec({ sample_id: "2", quantity: "concentration", value: 245, unit: "nanograms per microliter" })).toBe(true);
    expect(rec({ sample_id: "2", quantity: "260 over 280", value: 1.86 })).toBe(true);
    expect(rec({ quantity: "concentration", value: "245" })).toBe(false);
    expect(rec({ quantity: "vibes", value: 3 })).toBe(false);
    const nav = ajv.compile(TOOLS.find((t) => t.name === "navigate_protocol")!.parameters);
    expect(nav({ action: "goto", step_number: 9 })).toBe(true);
    expect(nav({ action: "skip" })).toBe(false);
  });
});
