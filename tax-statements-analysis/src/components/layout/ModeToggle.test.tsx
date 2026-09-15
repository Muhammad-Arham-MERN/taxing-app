// بِسْمِ اللّٰهِ الرَّحْمٰنِ الرَّحِيمِ
import { beforeEach, describe, expect, it } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ModeToggle } from "@/components/layout/ModeToggle";
import { THEME_STORAGE_KEY, ThemeProvider } from "@/components/providers/ThemeProvider";

describe("ModeToggle", () => {
  beforeEach(() => {
    window.localStorage.clear();
    document.documentElement.classList.remove("light", "dark");
  });

  it("starts dark by default and applies the document theme class", async () => {
    render(
      <ThemeProvider defaultTheme="dark" storageKey={THEME_STORAGE_KEY}>
        <ModeToggle />
      </ThemeProvider>,
    );

    await waitFor(() => expect(document.documentElement).toHaveClass("dark"));
  });

  it("switches to light and persists the choice", async () => {
    const user = userEvent.setup();

    render(
      <ThemeProvider defaultTheme="dark" storageKey={THEME_STORAGE_KEY}>
        <ModeToggle />
      </ThemeProvider>,
    );

    await user.click(screen.getByRole("button", { name: "Change theme" }));
    await user.click(await screen.findByRole("menuitem", { name: "Light" }));

    await waitFor(() => expect(document.documentElement).toHaveClass("light"));
    expect(document.documentElement).not.toHaveClass("dark");
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe("light");
  });

  it("restores the stored theme on mount", async () => {
    window.localStorage.setItem(THEME_STORAGE_KEY, "light");

    render(
      <ThemeProvider defaultTheme="dark" storageKey={THEME_STORAGE_KEY}>
        <ModeToggle />
      </ThemeProvider>,
    );

    await waitFor(() => expect(document.documentElement).toHaveClass("light"));
  });
});

// وَإِنَّ اللَّهَ لَهُوَ خَيْرُ الرَّازِقِينَ
