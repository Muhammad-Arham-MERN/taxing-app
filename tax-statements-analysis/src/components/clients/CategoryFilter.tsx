// بِسْمِ اللّٰهِ الرَّحْمٰنِ الرَّحِيمِ
import { useState } from "react";
import { BadgeCheck, Pencil, Plus, Tags, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import type { Category, CategoryInput } from "@/domain/types";
import {
  CATEGORY_PALETTE,
  DEFAULT_CATEGORY_COLOR,
  resolveCategoryColor,
} from "@/lib/categoryColors";
import { cn } from "@/lib/utils";

interface CategoryEditorProps {
  name: string;
  color: string;
  onName: (value: string) => void;
  onColor: (value: string) => void;
  onSave: () => void;
  onCancel: () => void;
  saveLabel: string;
  busy: boolean;
}

/** The inline name + palette form used to create or rename a category. */
function CategoryEditor({
  name,
  color,
  onName,
  onColor,
  onSave,
  onCancel,
  saveLabel,
  busy,
}: CategoryEditorProps) {
  return (
    <div className="flex flex-col gap-2 rounded-lg border border-border bg-surface/60 p-2">
      <Input
        value={name}
        placeholder="Category name"
        autoFocus
        disabled={busy}
        className="h-9 text-base md:text-base"
        onChange={(event) => onName(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            onSave();
          }
        }}
      />
      <div className="flex flex-wrap gap-1.5">
        {CATEGORY_PALETTE.map((swatch) => (
          <button
            key={swatch.value}
            type="button"
            aria-label={swatch.name}
            title={swatch.name}
            disabled={busy}
            onClick={() => onColor(swatch.value)}
            className={cn(
              "size-5 rounded-full ring-offset-1 ring-offset-background transition-transform hover:scale-110",
              color === swatch.value && "ring-2 ring-brand",
            )}
            style={{ background: swatch.value }}
          />
        ))}
      </div>
      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" size="sm" disabled={busy} onClick={onCancel}>
          Cancel
        </Button>
        <Button
          type="button"
          size="sm"
          disabled={busy || name.trim() === ""}
          onClick={onSave}
        >
          {saveLabel}
        </Button>
      </div>
    </div>
  );
}

export interface CategoryFilterProps {
  categories: Category[];
  /** The ids currently used to filter. Empty means "any". */
  selected: string[];
  onToggle: (id: string) => void;
  onCreate: (input: CategoryInput) => void;
  onUpdate: (id: string, input: CategoryInput) => void;
  /** Asked to remove a category; the caller confirms and calls the repository. */
  onDelete: (category: Category) => void;
  busy?: boolean;
}

/**
 * The dropbox beside the client search (client request): it filters the client
 * grid by category, and it is where categories are **created, renamed,
 * recoloured and deleted**. Deleting only clears the tag; it is confirmed by the
 * caller.
 */
export function CategoryFilter({
  categories,
  selected,
  onToggle,
  onCreate,
  onUpdate,
  onDelete,
  busy = false,
}: CategoryFilterProps) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"idle" | "create">("idle");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [color, setColor] = useState(DEFAULT_CATEGORY_COLOR);

  function startCreate() {
    setEditingId(null);
    setMode("create");
    setName("");
    setColor(DEFAULT_CATEGORY_COLOR);
  }

  function startEdit(category: Category) {
    setMode("idle");
    setEditingId(category.id);
    setName(category.name);
    setColor(resolveCategoryColor(category.color));
  }

  function reset() {
    setMode("idle");
    setEditingId(null);
    setName("");
  }

  function save() {
    if (name.trim() === "") {
      return;
    }
    if (editingId) {
      onUpdate(editingId, { name, color });
    } else {
      onCreate({ name, color });
    }
    reset();
  }

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) {
          reset();
        }
      }}
    >
      <PopoverTrigger asChild>
        <Button type="button" variant="outline" className="h-11 shrink-0 px-4 text-base">
          <Tags aria-hidden="true" className="opacity-60" />
          Categories
          {selected.length > 0 ? (
            <span className="ml-1 rounded-full bg-brand px-1.5 text-xs text-brand-foreground">
              {selected.length}
            </span>
          ) : null}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80">
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <span className="font-medium">Categories</span>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={busy}
              onClick={startCreate}
            >
              <Plus aria-hidden="true" />
              New
            </Button>
          </div>

          {categories.length === 0 && mode === "idle" ? (
            <p className="text-sm text-muted-foreground">
              No categories yet. Create one to file your clients under.
            </p>
          ) : null}

          <ul className="flex max-h-56 flex-col gap-1 overflow-y-auto">
            {categories.map((category) =>
              editingId === category.id ? (
                <li key={category.id}>
                  <CategoryEditor
                    name={name}
                    color={color}
                    onName={setName}
                    onColor={setColor}
                    onSave={save}
                    onCancel={reset}
                    saveLabel="Save"
                    busy={busy}
                  />
                </li>
              ) : (
                <li
                  key={category.id}
                  className="flex items-center gap-1 rounded-md px-1 py-0.5 hover:bg-muted/50"
                >
                  <button
                    type="button"
                    aria-pressed={selected.includes(category.id)}
                    disabled={busy}
                    onClick={() => onToggle(category.id)}
                    className="flex flex-1 items-center gap-2 py-1 text-left"
                  >
                    <span
                      aria-hidden="true"
                      className="size-3 shrink-0 rounded-full"
                      style={{ background: resolveCategoryColor(category.color) }}
                    />
                    <span className="flex-1 truncate">{category.name}</span>
                    {selected.includes(category.id) ? (
                      <BadgeCheck aria-hidden="true" className="size-4 text-brand" />
                    ) : null}
                  </button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    aria-label={`Edit ${category.name}`}
                    disabled={busy}
                    onClick={() => startEdit(category)}
                  >
                    <Pencil aria-hidden="true" className="size-3.5" />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    aria-label={`Delete ${category.name}`}
                    disabled={busy}
                    onClick={() => onDelete(category)}
                  >
                    <Trash2 aria-hidden="true" className="size-3.5 text-destructive" />
                  </Button>
                </li>
              ),
            )}
          </ul>

          {mode === "create" ? (
            <CategoryEditor
              name={name}
              color={color}
              onName={setName}
              onColor={setColor}
              onSave={save}
              onCancel={reset}
              saveLabel="Add"
              busy={busy}
            />
          ) : null}
        </div>
      </PopoverContent>
    </Popover>
  );
}

// وَإِنَّ اللَّهَ لَهُوَ خَيْرُ الرَّازِقِينَ
