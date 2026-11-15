import { describe, expect, it } from "vitest";
import { saleFeePercent, saleSplit } from "./sale-split";

describe("saleSplit", () => {
  it("takes only Advo's fee off the package price — never a gateway cut", () => {
    expect(saleSplit("1500", 500)).toMatchObject({ gross: 1500, fee: 75, net: 1425 });
  });

  it("hands the whole price to the Reseller when Advo charges no fee", () => {
    expect(saleSplit("1500", 0)).toMatchObject({ fee: 0, net: 1500 });
    expect(saleSplit("1500", undefined)).toMatchObject({ fee: 0, net: 1500 });
  });

  it("floors the fee exactly like the ledger posting", () => {
    // 1,000 × 5 % = 50; 1,013 × 2.5 % = 25.325 → 25
    expect(saleSplit("1000", 500).fee).toBe(50);
    expect(saleSplit("1013", 250).fee).toBe(25);
  });

  it("never lets a fee exceed the sale", () => {
    const split = saleSplit("100", 5000);
    expect(split.fee).toBe(50);
    expect(saleSplit("100", 40_000).fee).toBe(100);
    expect(saleSplit("100", 40_000).net).toBe(0);
  });
});

describe("saleFeePercent", () => {
  it("prints whole and fractional rates", () => {
    expect(saleFeePercent(500)).toBe("5%");
    expect(saleFeePercent(250)).toBe("2.5%");
    expect(saleFeePercent(0)).toBe("0%");
  });
});
