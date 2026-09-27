import { describe, expect, it } from "vitest";
import { integerToWords, toSpeakable } from "@/lib/agent/speakable";

describe("integerToWords", () => {
  it.each([
    [0, "zero"],
    [15, "fifteen"],
    [42, "forty-two"],
    [100, "one hundred"],
    [250, "two hundred fifty"],
    [8000, "eight thousand"],
    [13000, "thirteen thousand"],
    [12500, "twelve thousand five hundred"],
    [1_000_000, "one million"],
  ])("%i → %s", (n, w) => expect(integerToWords(n)).toBe(w));
});

describe("toSpeakable", () => {
  it.each([
    ["Centrifuge at 13,000 x g for 1 min.", "Centrifuge at thirteen thousand times g for 1 minute."],
    ["Pellet at 8,000 x g for 2 minutes.", "Pellet at eight thousand times g for 2 minutes."],
    ["Add 250 µL of buffer.", "Add two hundred fifty microliters of buffer."],
    ["Add 1.5 mL of culture.", "Add 1.5 milliliters of culture."],
    ["Keep at -20 °C.", "Keep at minus 20 degrees Celsius."],
    ["Heat to 95 °C for 30 s.", "Heat to 95 degrees Celsius for 30 seconds."],
    ["Read 260/230 and 205/300.", "Read two sixty over two thirty and two oh five over three hundred."],
    ["sample 2: 245 ng/µL; 260/280 1.86", "sample 2: two hundred forty-five nanograms per microliter; two sixty over two eighty 1.86"],
    ["Spin at 4000 rpm.", "Spin at four thousand R P M."],
  ])("%s", (input, out) => expect(toSpeakable(input)).toBe(out));

  it("leaves decimals and plain text alone", () => {
    expect(toSpeakable("Ratio 1.86, tube 4 looks cloudy.")).toBe("Ratio 1.86, tube 4 looks cloudy.");
  });
});
