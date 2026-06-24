import { typeMeta, cn } from "../lib.jsx";

export default function TypeBadge({ type, size = "sm" }) {
  const meta = typeMeta(type);
  const Icon = meta.icon;
  const pad = size === "xs" ? "px-1.5 py-0.5 text-[10px]" : "px-2 py-0.5 text-xs";
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-md font-medium ring-1 ring-inset", meta.bg, meta.color, meta.ring, pad)}>
      <Icon className="h-3 w-3" />
      {meta.label}
    </span>
  );
}
