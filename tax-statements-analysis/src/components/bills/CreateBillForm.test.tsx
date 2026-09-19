// بِسْمِ اللّٰهِ الرَّحْمٰنِ الرَّحِيمِ
import { describe, expect, it } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DataProvider } from "@/components/providers/DataProvider";
import { CreateBillForm } from "@/components/bills/CreateBillForm";
import { createInMemoryRepositories } from "@/data/in-memory";

function renderForm() {
  const repositories = createInMemoryRepositories();
  render(
    <DataProvider repositories={repositories}>
      <CreateBillForm />
    </DataProvider>,
  );
  return repositories;
}

describe("CreateBillForm", () => {
  it("keeps Create Bill disabled until the required entries are valid", async () => {
    const user = userEvent.setup();
    renderForm();

    const createButton = screen.getByRole("button", { name: "Create Bill" });
    expect(createButton).toBeDisabled();

    await user.type(screen.getByLabelText("Customer Name"), "Acme Traders");
    await user.type(screen.getByLabelText("Details for item 1"), "Audit Fee");
    expect(createButton).toBeDisabled();

    await user.type(screen.getByLabelText("Amount for item 1"), "1500");
    await waitFor(() => expect(createButton).toBeEnabled());
  });

  it("adds another item with the next item number", async () => {
    const user = userEvent.setup();
    renderForm();

    await user.click(screen.getByRole("button", { name: "Add item" }));
    expect(screen.getByLabelText("Details for item 2")).toBeInTheDocument();
    expect(screen.getByLabelText("Amount for item 2")).toBeInTheDocument();
  });

  it("cannot remove the last remaining item", () => {
    renderForm();
    expect(screen.getByRole("button", { name: "Remove item 1" })).toBeDisabled();
  });

  it("shows the total in PKR and the total in words", async () => {
    const user = userEvent.setup();
    renderForm();

    await user.type(screen.getByLabelText("Amount for item 1"), "1500");
    await user.click(screen.getByRole("button", { name: "Add item" }));
    await user.type(screen.getByLabelText("Amount for item 2"), "250.50");

    expect(screen.getByText("PKR 1,750.50")).toBeInTheDocument();
    expect(
      screen.getByText("Rupees one thousand seven hundred fifty and fifty paisa Only"),
    ).toBeInTheDocument();
  });

  it("records the bill, remembers the customer and resets the form", async () => {
    const user = userEvent.setup();
    const repositories = renderForm();

    await user.type(screen.getByLabelText("Customer Name"), "Acme Traders");
    await user.type(screen.getByLabelText("Details for item 1"), "Audit Fee");
    await user.type(screen.getByLabelText("Amount for item 1"), "1500");

    const createButton = screen.getByRole("button", { name: "Create Bill" });
    await waitFor(() => expect(createButton).toBeEnabled());
    await user.click(createButton);

    await waitFor(() => expect(screen.getByLabelText("Customer Name")).toHaveValue(""));

    const rows = await repositories.bills.list({ from: null, to: null, customer: null });
    expect(rows).toHaveLength(1);
    expect(rows[0].invoiceNo).toBe("INV-0001");
    expect(rows[0].customerName).toBe("Acme Traders");
    expect(rows[0].total).toBe(1500);

    const customers = await repositories.customers.list();
    expect(customers.map((customer) => customer.name)).toContain("Acme Traders");
  });

  it("fills a known customer's saved details when their name is chosen", async () => {
    const user = userEvent.setup();
    const repositories = createInMemoryRepositories();

    await repositories.bills.create({
      date: "2026-09-18",
      customer: {
        name: "Acme Traders",
        address: "1 Market Road",
        contactPerson: "Bilal",
        contactNumber: "0300-1234567",
        email: "acme@example.com",
        ntn: "1234567",
        password: "secret",
      },
      jazzcashNumbers: [],
      easypaisaNumbers: [],
      accountHolder: "Mumtaz Qureshi",
      items: [{ details: "Audit Fee", amount: 1000 }],
    });

    render(
      <DataProvider repositories={repositories}>
        <CreateBillForm />
      </DataProvider>,
    );

    await user.type(screen.getByLabelText("Customer Name"), "Acme Traders");

    await waitFor(() =>
      expect(screen.getByLabelText("Customer Address")).toHaveValue("1 Market Road"),
    );
    expect(screen.getByLabelText("Contact Person")).toHaveValue("Bilal");
    expect(screen.getByLabelText("Contact Number")).toHaveValue("0300-1234567");
    expect(screen.getByLabelText("Email")).toHaveValue("acme@example.com");
    expect(screen.getByLabelText("NTN Number")).toHaveValue("1234567");
    expect(screen.getByLabelText("Password")).toHaveValue("secret");
  });

  it("requires both wallet numbers to be in +92 format when they are given", async () => {
    const user = userEvent.setup();
    renderForm();

    await user.type(screen.getByLabelText("Customer Name"), "Acme Traders");
    await user.type(screen.getByLabelText("Details for item 1"), "Audit Fee");
    await user.type(screen.getByLabelText("Amount for item 1"), "1500");

    const createButton = screen.getByRole("button", { name: "Create Bill" });
    await waitFor(() => expect(createButton).toBeEnabled());

    await user.type(screen.getByLabelText("JazzCash Number 1"), "03001234567");
    await waitFor(() => expect(createButton).toBeDisabled());

    await user.clear(screen.getByLabelText("JazzCash Number 1"));
    await user.type(screen.getByLabelText("JazzCash Number 1"), "+923001234567");
    await waitFor(() => expect(createButton).toBeEnabled());

    await user.type(screen.getByLabelText("Easypaisa Number 1"), "03001234567");
    await waitFor(() => expect(createButton).toBeDisabled());

    await user.clear(screen.getByLabelText("Easypaisa Number 1"));
    await user.type(screen.getByLabelText("Easypaisa Number 1"), "+923001234567");
    await waitFor(() => expect(createButton).toBeEnabled());
  }, 30000);

  it("groups the wallet and account holder fields under Payment Details", () => {
    renderForm();

    expect(screen.getByText("Payment Details")).toBeInTheDocument();
    expect(screen.getByText("Customer Details")).toBeInTheDocument();
    expect(screen.getByLabelText("JazzCash Number 1")).toBeInTheDocument();
    expect(screen.getByLabelText("Easypaisa Number 1")).toBeInTheDocument();
    expect(screen.getByLabelText("Account Holder Name")).toBeInTheDocument();
  });

  it("starts with the practice's own wallet numbers filled in", () => {
    renderForm();

    expect(screen.getByLabelText("JazzCash Number 1")).toHaveValue("+923225739614");
    expect(screen.getByLabelText("Easypaisa Number 1")).toHaveValue("+923125739614");
  });

  it("explains a wallet number that is not in +92 format", async () => {
    const user = userEvent.setup();
    renderForm();

    await user.clear(screen.getByLabelText("JazzCash Number 1"));
    await user.type(screen.getByLabelText("JazzCash Number 1"), "03001234567");

    expect(
      await screen.findByText(/Enter the number in \+92 format/),
    ).toBeInTheDocument();
  }, 30000);

  it("adds another JazzCash number with the plus button", async () => {
    const user = userEvent.setup();
    renderForm();

    expect(screen.queryByLabelText("JazzCash Number 2")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Add JazzCash Number" }));
    expect(screen.getByLabelText("JazzCash Number 2")).toBeInTheDocument();
  });
});

// وَإِنَّ اللَّهَ لَهُوَ خَيْرُ الرَّازِقِينَ
