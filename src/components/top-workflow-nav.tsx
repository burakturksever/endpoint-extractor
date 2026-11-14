"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { WorkflowSelectionChip } from "@/components/workflow-selection-chip";

const items = [
  { href: "/targeting", label: "Targeting" },
  { href: "/target", label: "Target" },
  { href: "/endpoints", label: "Endpoints" },
  { href: "/graphql", label: "GraphQL" },
  { href: "/llm", label: "LLM" },
  { href: "/query", label: "Global Search" },
  { href: "/repeater", label: "Repeater" },
  { href: "/organizer", label: "Organizer" }
];

export function TopWorkflowNav(): React.ReactElement {
  const pathname = usePathname();
  return (
    <>
      <nav className="mb-2 flex flex-wrap gap-2">
        {items.map((item) => {
          const active = pathname === item.href || (item.href === "/targeting" && pathname === "/");
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`rounded-lg border px-3 py-1.5 text-sm ${
                active ? "border-indigo-500 bg-indigo-600/30 text-indigo-200" : "border-slate-700 text-slate-300 hover:bg-slate-900/60"
              }`}
            >
              {item.label}
            </Link>
          );
        })}
      </nav>
      <WorkflowSelectionChip />
    </>
  );
}
