"use client";

import { Select } from "@base-ui/react/select";

type Option = {
  value: string;
  label: string;
};

function CaretIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
      <path d="M4 6.2 8 10l4-3.8H4z" />
    </svg>
  );
}

export function SelectField({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: Option[];
}) {
  return (
    <Select.Root
      items={options}
      value={value}
      onValueChange={(next) => {
        if (typeof next === "string") onChange(next);
      }}
    >
      <Select.Label className="sr-only">{label}</Select.Label>
      <Select.Trigger
        aria-label={label}
        className="flex h-10 max-w-full items-center justify-between gap-3 rounded-full border border-line bg-card px-3 text-left text-sm text-ink"
      >
        <Select.Value className="truncate" />
        <Select.Icon className="shrink-0 text-muted">
          <CaretIcon />
        </Select.Icon>
      </Select.Trigger>
      <Select.Portal>
        <Select.Positioner className="z-50 outline-none" sideOffset={6} align="start">
          <Select.Popup className="max-h-72 min-w-[var(--anchor-width)] overflow-y-auto rounded-2xl border border-line bg-card py-1 text-ink shadow-[0_16px_40px_rgba(28,25,21,0.12)] outline-none">
            <Select.List>
              {options.map((option) => (
                <Select.Item
                  key={option.value}
                  value={option.value}
                  className="cursor-default px-3 py-2 text-sm outline-none data-highlighted:bg-teal data-highlighted:text-white"
                >
                  <Select.ItemText>{option.label}</Select.ItemText>
                </Select.Item>
              ))}
            </Select.List>
          </Select.Popup>
        </Select.Positioner>
      </Select.Portal>
    </Select.Root>
  );
}
