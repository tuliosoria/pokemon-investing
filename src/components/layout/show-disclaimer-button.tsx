"use client";

const STORAGE_KEY = "pokealpha:disclaimer-acknowledged:v2";

export function ShowDisclaimerButton() {
  const handleClick = () => {
    try {
      window.localStorage.removeItem(STORAGE_KEY);
    } catch {
      // Storage blocked — reload still re-shows the modal in that case
      // because the component falls back to "show on every load".
    }
    window.location.reload();
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      className="text-left text-xs text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--poke-red))] transition-colors"
    >
      Show risk disclaimer
    </button>
  );
}
