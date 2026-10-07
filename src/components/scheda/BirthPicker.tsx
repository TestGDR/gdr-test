"use client";

import { MOONS, MOON_DAYS } from "@/lib/game-date";

// Giorno e luna di nascita
export default function BirthPicker({
  value,
  onChange,
}: {
  value: { day?: number; month?: number };
  onChange: (v: { day?: number; month?: number }) => void;
}) {
  return (
    <div className="flex gap-2">
      <select
        value={value.day ?? ""}
        onChange={(e) =>
          onChange({
            ...value,
            day: e.target.value ? Number(e.target.value) : undefined,
          })
        }
        className="input w-24! py-1.5"
        aria-label="Giorno di nascita"
      >
        <option value="">Giorno</option>
        {Array.from(
          { length: value.month ? MOON_DAYS[value.month - 1] : 31 },
          (_, i) => (
            <option key={i + 1} value={i + 1}>
              {i + 1}
            </option>
          ),
        )}
      </select>
      <select
        value={value.month ?? ""}
        onChange={(e) =>
          onChange({
            ...value,
            month: e.target.value ? Number(e.target.value) : undefined,
          })
        }
        className="input w-52! py-1.5"
        aria-label="Luna di nascita"
      >
        <option value="">Luna</option>
        {MOONS.map((m, i) => (
          <option key={m} value={i + 1}>
            {m}
          </option>
        ))}
      </select>
    </div>
  );
}
