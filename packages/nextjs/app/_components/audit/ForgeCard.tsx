"use client";

type ForgeCardProps = {
  disabled: boolean;
  forging: boolean;
  forgeResult: string | null;
  onForge: () => void;
};

export const ForgeCard = ({ disabled, forging, forgeResult, onForge }: ForgeCardProps) => {
  return (
    <div className="bg-base-100 rounded-2xl shadow-md p-6 border border-base-300">
      <h3 className="font-bold text-lg mb-2">Try to break it</h3>
      <p className="text-sm text-base-content/70 mb-3">
        An account with no publishing rights tries to submit an entry directly to the topic.
      </p>
      <button
        id="forge-entry"
        className="btn btn-sm btn-error btn-outline"
        disabled={disabled || forging}
        onClick={onForge}
      >
        {forging ? "Attempting…" : "Try to forge an entry"}
      </button>
      {forgeResult && (
        <p id="forge-result" className="text-sm mt-3">
          {forgeResult}
        </p>
      )}
    </div>
  );
};
