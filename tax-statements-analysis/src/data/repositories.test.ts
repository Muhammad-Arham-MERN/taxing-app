// بِسْمِ اللّٰهِ الرَّحْمٰنِ الرَّحِيمِ
import { beforeEach, describe, expect, it } from "vitest";
import {
  DEFAULT_BUSINESS_PROFILE,
  InMemoryBillRepository,
  InMemoryBusinessProfileRepository,
  InMemoryCustomerRepository,
  InMemoryStatementRepository,
} from "@/data/in-memory";
import {
  DuplicateSubmissionError,
  InvalidRangeError,
  UnknownBillError,
  ValidationError,
} from "@/data/repositories";
import type { NewBill, NewStatement } from "@/domain/types";

const baseInput: NewStatement = {
  date: "2026-09-14",
  type: "inflow",
  nature: "Audit Fee",
  amount: 1500,
  remarks: null,
  fileName: null,
  fileRef: null,
};

const baseBill: NewBill = {
  date: "2026-09-18",
  customer: {
    name: "Acme Traders",
    address: null,
    contactPerson: null,
    contactNumber: null,
    email: null,
    ntn: null,
    password: null,
  },
  jazzcashNumbers: [],
  easypaisaNumbers: [],
  accountHolder: "Mumtaz Qureshi",
  items: [{ details: "Audit Fee", amount: 1500 }],
};

describe("InMemoryStatementRepository contract", () => {
  let repository: InMemoryStatementRepository;

  beforeEach(() => {
    repository = new InMemoryStatementRepository();
  });

  it("C-01 create returns a statement with an id and createdAt", async () => {
    const created = await repository.create(baseInput);
    expect(created.id).toBeTruthy();
    expect(created.createdAt).toBeTruthy();
    expect(created.amount).toBe(1500);
  });

  it("C-02 a created statement is visible to findByDateRange", async () => {
    await repository.create(baseInput);
    const rows = await repository.findByDateRange({ from: "2026-09-01", to: "2026-09-30" });
    expect(rows).toHaveLength(1);
  });

  it("C-03 range bounds are inclusive", async () => {
    await repository.create({ ...baseInput, date: "2026-09-14" });
    const rows = await repository.findByDateRange({ from: "2026-09-14", to: "2026-09-14" });
    expect(rows).toHaveLength(1);
  });

  it("C-04 rejects a reversed range with InvalidRangeError", async () => {
    await expect(
      repository.findByDateRange({ from: "2026-09-30", to: "2026-09-01" }),
    ).rejects.toBeInstanceOf(InvalidRangeError);
  });

  it("C-05 resolves to an empty array when nothing matches", async () => {
    await repository.create(baseInput);
    await expect(
      repository.findByDateRange({ from: "2025-01-01", to: "2025-12-31" }),
    ).resolves.toEqual([]);
  });

  it("C-06 stores omitted remarks and fileName as null", async () => {
    const created = await repository.create({ ...baseInput, remarks: null, fileName: null });
    expect(created.remarks).toBeNull();
    expect(created.fileName).toBeNull();
  });

  it("C-09 rejects a concurrent identical submission", async () => {
    const results = await Promise.allSettled([
      repository.create(baseInput),
      repository.create(baseInput),
    ]);
    const rejected = results.filter((result) => result.status === "rejected");
    expect(rejected).toHaveLength(1);
    expect((rejected[0] as PromiseRejectedResult).reason).toBeInstanceOf(
      DuplicateSubmissionError,
    );
    expect(await repository.listAll()).toHaveLength(1);
  });

  it("raises ValidationError for invalid input", async () => {
    await expect(repository.create({ ...baseInput, amount: -1 })).rejects.toBeInstanceOf(
      ValidationError,
    );
  });

  it("orders results newest date first", async () => {
    await repository.create({ ...baseInput, date: "2026-09-10" });
    await repository.create({ ...baseInput, date: "2026-09-20" });
    const rows = await repository.findByDateRange({ from: "2026-09-01", to: "2026-09-30" });
    expect(rows.map((row) => row.date)).toEqual(["2026-09-20", "2026-09-10"]);
  });
});

describe("InMemoryBillRepository contract", () => {
  let repository: InMemoryBillRepository;
  let customers: InMemoryCustomerRepository;

  beforeEach(() => {
    customers = new InMemoryCustomerRepository();
    repository = new InMemoryBillRepository(customers);
  });

  it("B-01 create returns a bill with an invoice number, positioned items and the derived total", async () => {
    const created = await repository.create({
      ...baseBill,
      items: [
        { details: "Audit Fee", amount: 1500 },
        { details: "Advisory", amount: 250.5 },
      ],
    });

    expect(created.invoiceNo).toBe("INV-0001");
    expect(created.items.map((item) => item.position)).toEqual([1, 2]);
    expect(created.total).toBeCloseTo(1750.5, 2);
  });

  it("B-02 sequential creates get distinct, increasing invoice numbers", async () => {
    const first = await repository.create(baseBill);
    const second = await repository.create(baseBill);

    expect(first.invoiceNo).toBe("INV-0001");
    expect(second.invoiceNo).toBe("INV-0002");
  });

  it("B-04 rejects an incomplete bill with ValidationError and stores nothing", async () => {
    await expect(
      repository.create({ ...baseBill, date: "nope" }),
    ).rejects.toBeInstanceOf(ValidationError);
    await expect(
      repository.create({ ...baseBill, items: [{ details: "", amount: 10 }] }),
    ).rejects.toBeInstanceOf(ValidationError);
    await expect(
      repository.create({ ...baseBill, items: [{ details: "Audit Fee", amount: 0 }] }),
    ).rejects.toBeInstanceOf(ValidationError);
    await expect(
      repository.create({ ...baseBill, customer: { ...baseBill.customer, name: "   " } }),
    ).rejects.toBeInstanceOf(ValidationError);
    await expect(repository.create({ ...baseBill, items: [] })).rejects.toBeInstanceOf(
      ValidationError,
    );

    const rows = await repository.list({ from: null, to: null, customer: null });
    expect(rows).toHaveLength(0);
  });

  it("B-03 a new bill never reuses a deleted bill's invoice number", async () => {
    const first = await repository.create(baseBill);
    await repository.remove(first.id);
    const second = await repository.create(baseBill);

    expect(second.invoiceNo).not.toBe(first.invoiceNo);
    expect(second.invoiceNo).toBe("INV-0002");
  });

  it("B-05 list with no filters returns every bill, newest first", async () => {
    await repository.create({ ...baseBill, date: "2026-09-01" });
    await repository.create({ ...baseBill, date: "2026-09-20" });

    const rows = await repository.list({ from: null, to: null, customer: null });
    expect(rows.map((row) => row.date)).toEqual(["2026-09-20", "2026-09-01"]);
  });

  it("B-06 list with a range keeps only bills inside it, inclusive", async () => {
    await repository.create({ ...baseBill, date: "2026-09-01" });
    await repository.create({ ...baseBill, date: "2026-09-15" });
    await repository.create({ ...baseBill, date: "2026-09-30" });

    const rows = await repository.list({ from: "2026-09-15", to: "2026-09-15", customer: null });
    expect(rows.map((row) => row.date)).toEqual(["2026-09-15"]);
  });

  it("B-07 list with a customer keeps only that customer's bills, all dates", async () => {
    await repository.create(baseBill);
    await repository.create({
      ...baseBill,
      date: "2026-09-19",
      customer: { ...baseBill.customer, name: "Other Client" },
    });

    const rows = await repository.list({ from: null, to: null, customer: "Acme Traders" });
    expect(rows).toHaveLength(1);
    expect(rows[0].customerName).toBe("Acme Traders");
  });

  it("B-08 a customer and a range combine", async () => {
    await repository.create({ ...baseBill, date: "2026-09-01" });
    await repository.create({ ...baseBill, date: "2026-09-20" });
    await repository.create({
      ...baseBill,
      date: "2026-09-20",
      customer: { ...baseBill.customer, name: "Other Client" },
    });

    const rows = await repository.list({
      from: "2026-09-19",
      to: "2026-09-30",
      customer: "Acme Traders",
    });
    expect(rows).toHaveLength(1);
    expect(rows[0].date).toBe("2026-09-20");
  });

  it("B-09 list rejects a reversed range", async () => {
    await expect(
      repository.list({ from: "2026-09-30", to: "2026-09-01", customer: null }),
    ).rejects.toBeInstanceOf(InvalidRangeError);
  });

  it("B-10 a list row carries customer, date, details and total", async () => {
    await repository.create({
      ...baseBill,
      items: [
        { details: "Audit Fee", amount: 1000 },
        { details: "Advisory", amount: 500 },
      ],
    });

    const rows = await repository.list({ from: null, to: null, customer: null });
    expect(rows[0].customerName).toBe("Acme Traders");
    expect(rows[0].date).toBe("2026-09-18");
    expect(rows[0].details).toBe("Audit Fee; Advisory");
    expect(rows[0].total).toBe(1500);
  });

  it("B-11 get returns the bill with its positioned items", async () => {
    const created = await repository.create({
      ...baseBill,
      items: [
        { details: "Audit Fee", amount: 1000 },
        { details: "Advisory", amount: 500 },
      ],
    });

    const fetched = await repository.get(created.id);
    expect(fetched.items.map((item) => item.position)).toEqual([1, 2]);
    expect(fetched.customer.name).toBe("Acme Traders");
  });

  it("B-12 update replaces the items, renumbers them and keeps the invoice number", async () => {
    const created = await repository.create({
      ...baseBill,
      items: [
        { details: "Audit Fee", amount: 1000 },
        { details: "Advisory", amount: 500 },
      ],
    });

    const updated = await repository.update({
      id: created.id,
      date: created.date,
      customer: created.customer,
      jazzcashNumbers: [],
      easypaisaNumbers: [],
      accountHolder: created.accountHolder,
      items: [{ details: "Audit Fee", amount: 2000 }],
    });

    expect(updated.invoiceNo).toBe(created.invoiceNo);
    expect(updated.items).toHaveLength(1);
    expect(updated.items[0].position).toBe(1);
    expect(updated.total).toBe(2000);
  });

  it("B-13 update changes values without creating another bill", async () => {
    const created = await repository.create(baseBill);
    await repository.update({
      id: created.id,
      date: "2026-09-25",
      customer: { ...created.customer, address: "New address" },
      jazzcashNumbers: ["+923001234567"],
      easypaisaNumbers: [],
      accountHolder: created.accountHolder,
      items: [{ details: "Audit Fee", amount: 1500 }],
    });

    const rows = await repository.list({ from: null, to: null, customer: null });
    expect(rows).toHaveLength(1);
    expect(rows[0].date).toBe("2026-09-25");
  });

  it("B-14 remove takes the bill out of every list", async () => {
    const created = await repository.create(baseBill);
    await repository.remove(created.id);

    await expect(repository.get(created.id)).rejects.toBeInstanceOf(UnknownBillError);
    await expect(
      repository.list({ from: null, to: null, customer: null }),
    ).resolves.toHaveLength(0);
  });

  it("B-16 a saved bill's customer is remembered", async () => {
    await repository.create(baseBill);
    const remembered = await customers.list();
    expect(remembered.map((customer) => customer.name)).toContain("Acme Traders");
  });

  it("B-17 an existing customer name is matched case-insensitively", async () => {
    await repository.create(baseBill);
    await repository.create({
      ...baseBill,
      date: "2026-09-19",
      customer: { ...baseBill.customer, name: "acme traders" },
    });

    const remembered = await customers.list();
    expect(remembered).toHaveLength(1);
  });

  it("B-19 a customer remains offered after all of their bills are deleted", async () => {
    const created = await repository.create(baseBill);
    await repository.remove(created.id);

    const remembered = await customers.list();
    expect(remembered.map((customer) => customer.name)).toContain("Acme Traders");
  });
});

describe("InMemoryBusinessProfileRepository contract", () => {
  it("C-07 get returns the default identity on a fresh store", async () => {
    const repository = new InMemoryBusinessProfileRepository();
    await expect(repository.get()).resolves.toEqual(DEFAULT_BUSINESS_PROFILE);
  });

  it("C-08 save then get returns the saved profile", async () => {
    const repository = new InMemoryBusinessProfileRepository();
    const saved = await repository.save({
      brandName: "M&M Tax Law Solutions",
      location: "Rawalpindi",
      contacts: ["051-5910021"],
    });
    await expect(repository.get()).resolves.toEqual(saved);
  });
});

// وَإِنَّ اللَّهَ لَهُوَ خَيْرُ الرَّازِقِينَ
