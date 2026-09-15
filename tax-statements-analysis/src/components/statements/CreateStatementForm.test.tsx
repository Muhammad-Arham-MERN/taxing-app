// بِسْمِ اللّٰهِ الرَّحْمٰنِ الرَّحِيمِ
import { describe, expect, it } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { UserEvent } from "@testing-library/user-event";
import { DataProvider } from "@/components/providers/DataProvider";
import { CreateStatementForm } from "@/components/statements/CreateStatementForm";
import { createInMemoryRepositories } from "@/data/in-memory";

function renderForm() {
  const repositories = createInMemoryRepositories();
  render(
    <DataProvider repositories={repositories}>
      <CreateStatementForm />
    </DataProvider>,
  );
  return repositories;
}

async function chooseTypeAndNature(user: UserEvent, type: string, nature: string) {
  await user.click(screen.getByRole("button", { name: "Type" }));
  await user.click(await screen.findByRole("option", { name: type }));
  await user.click(screen.getByRole("button", { name: "Nature" }));
  await user.click(await screen.findByRole("option", { name: nature }));
}

describe("CreateStatementForm", () => {
  it("keeps Create disabled until the required fields are valid", async () => {
    const user = userEvent.setup();
    renderForm();

    const createButton = screen.getByRole("button", { name: "Create" });
    expect(createButton).toBeDisabled();

    await chooseTypeAndNature(user, "In-Flow", "Audit Fee");
    expect(createButton).toBeDisabled();

    await user.type(screen.getByLabelText("Amount"), "abc");
    expect(createButton).toBeDisabled();

    await user.clear(screen.getByLabelText("Amount"));
    await user.type(screen.getByLabelText("Amount"), "1500");
    await waitFor(() => expect(createButton).toBeEnabled());
  });

  it("records the statement and resets the form on success", async () => {
    const user = userEvent.setup();
    const repositories = renderForm();

    await chooseTypeAndNature(user, "In-Flow", "Audit Fee");
    await user.type(screen.getByLabelText("Amount"), "1500");

    const createButton = screen.getByRole("button", { name: "Create" });
    await waitFor(() => expect(createButton).toBeEnabled());
    await user.click(createButton);

    await waitFor(() => expect(screen.getByLabelText("Amount")).toHaveValue(""));

    const stored = await repositories.statements.listAll();
    expect(stored).toHaveLength(1);
    expect(stored[0].nature).toBe("Audit Fee");
    expect(stored[0].amount).toBe(1500);
  });

  it("clears the chosen nature when the type changes", async () => {
    const user = userEvent.setup();
    renderForm();

    await chooseTypeAndNature(user, "In-Flow", "Audit Fee");
    expect(screen.getByRole("button", { name: "Nature" })).toHaveTextContent("Audit Fee");

    await user.click(screen.getByRole("button", { name: "Type" }));
    await user.click(await screen.findByRole("option", { name: "Out-Flow" }));

    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Nature" })).toHaveTextContent("Select nature"),
    );
  });

  it("leaves the Nature control disabled until a type is chosen", async () => {
    renderForm();
    expect(screen.getByRole("button", { name: "Nature" })).toBeDisabled();
  });

  it("records only one statement on a rapid double submission", async () => {
    const user = userEvent.setup();
    const repositories = renderForm();

    await chooseTypeAndNature(user, "In-Flow", "Audit Fee");
    await user.type(screen.getByLabelText("Amount"), "1500");

    const createButton = screen.getByRole("button", { name: "Create" });
    await waitFor(() => expect(createButton).toBeEnabled());
    await user.dblClick(createButton);

    await waitFor(() => expect(screen.getByLabelText("Amount")).toHaveValue(""));
    expect(await repositories.statements.listAll()).toHaveLength(1);
  });
});

// وَإِنَّ اللَّهَ لَهُوَ خَيْرُ الرَّازِقِينَ
