import { useState } from "react";
import { Trash2, Check, X } from "lucide-react";

export default function DeleteButton({ onConfirm, title = "Hapus", compact = false }) {
  const [confirming, setConfirming] = useState(false);

  if (confirming) {
    return (
      <div className="inline-flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
        <button
          onClick={async () => {
            await onConfirm();
            setConfirming(false);
          }}
          className="btn btn-danger !py-1 !px-2 text-xs"
          title="Konfirmasi hapus"
        >
          <Check className="h-3.5 w-3.5" /> Ya
        </button>
        <button onClick={() => setConfirming(false)} className="btn btn-ghost !py-1 !px-2 text-xs" title="Batal">
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    );
  }

  return (
    <button
      onClick={(e) => {
        e.stopPropagation();
        setConfirming(true);
      }}
      className={compact ? "btn btn-ghost !p-1.5 text-slate-500 hover:text-rose-300" : "btn btn-ghost !py-1 !px-2 text-slate-500 hover:text-rose-300"}
      title={title}
    >
      <Trash2 className="h-3.5 w-3.5" />
    </button>
  );
}
