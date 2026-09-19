// بِسْمِ اللّٰهِ الرَّحْمٰنِ الرَّحِيمِ
import { describe, expect, it } from "vitest";
import { amountInWordsPkr, rupeesToMinor } from "@/lib/amountInWords";

describe("amountInWordsPkr", () => {
  it("spells a whole rupee amount", () => {
    expect(amountInWordsPkr(rupeesToMinor(1500))).toBe(
      "Rupees one thousand five hundred Only",
    );
  });

  it("spells an amount with paisa", () => {
    expect(amountInWordsPkr(rupeesToMinor(1500.5))).toBe(
      "Rupees one thousand five hundred and fifty paisa Only",
    );
  });

  it("spells zero as zero rupees", () => {
    expect(amountInWordsPkr(0)).toBe("Rupees zero Only");
  });

  it("spells an exact hundred", () => {
    expect(amountInWordsPkr(rupeesToMinor(100))).toBe("Rupees one hundred Only");
  });

  it("spells a hundred thousand in English numbering", () => {
    expect(amountInWordsPkr(rupeesToMinor(125000))).toBe(
      "Rupees one hundred twenty-five thousand Only",
    );
  });

  it("spells millions, thousands and the remainder", () => {
    expect(amountInWordsPkr(rupeesToMinor(23456789.12))).toBe(
      "Rupees twenty-three million four hundred fifty-six thousand seven hundred eighty-nine and twelve paisa Only",
    );
  });

  it("spells a multiple of a million", () => {
    expect(amountInWordsPkr(rupeesToMinor(100000000))).toBe(
      "Rupees one hundred million Only",
    );
  });

  it("spells a billion", () => {
    expect(amountInWordsPkr(rupeesToMinor(2_500_000_000))).toBe(
      "Rupees two billion five hundred million Only",
    );
  });

  it("spells a large single-digit amount with units", () => {
    expect(amountInWordsPkr(rupeesToMinor(7))).toBe("Rupees seven Only");
  });

  it("rounds sub-paisa input rather than truncating it", () => {
    expect(amountInWordsPkr(rupeesToMinor(10.005))).toBe("Rupees ten and one paisa Only");
  });
});

// وَإِنَّ اللَّهَ لَهُوَ خَيْرُ الرَّازِقِينَ
