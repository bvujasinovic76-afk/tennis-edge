"use client";

import { useState, type ReactNode } from "react";

export type TabDef = { id: string; label: string; content: ReactNode };

/** Alati u tabovima — umesto beskonačnog skrola jedno ispod drugog. */
export default function Tabs({ tabs, initial }: { tabs: TabDef[]; initial?: string }) {
  const [active, setActive] = useState(initial ?? tabs[0]?.id);
  const current = tabs.find((t) => t.id === active) ?? tabs[0];

  return (
    <div>
      <div className="flex gap-1 overflow-x-auto border-b border-line -mx-1 px-1 pb-px">
        {tabs.map((t) => {
          const on = t.id === active;
          return (
            <button
              key={t.id}
              onClick={() => setActive(t.id)}
              className={`shrink-0 px-3.5 py-2 text-sm font-medium rounded-t-md border-b-2 transition-colors ${
                on ? "border-accent text-accent bg-surface" : "border-transparent text-muted hover:text-ink-soft"
              }`}
            >
              {t.label}
            </button>
          );
        })}
      </div>
      <div className="pt-6">{current?.content}</div>
    </div>
  );
}
