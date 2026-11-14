import { useEffect, useState } from "react";
import { Monitor, Moon, Sun } from "lucide-react";

type Theme = "light" | "dark" | "system";

const options = [
  { id: "light" as const, label: "浅色", icon: Sun },
  { id: "dark" as const, label: "深色", icon: Moon },
  { id: "system" as const, label: "跟随系统", icon: Monitor },
];

export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>(() => {
    const saved = localStorage.getItem("photomate-theme");
    return saved === "light" || saved === "dark" || saved === "system" ? saved : "system";
  });

  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const apply = () => {
      document.documentElement.classList.toggle("light", theme === "light");
      document.documentElement.classList.toggle("dark", theme === "dark" || (theme === "system" && media.matches));
      localStorage.setItem("photomate-theme", theme);
    };
    apply();
    media.addEventListener("change", apply);
    return () => media.removeEventListener("change", apply);
  }, [theme]);

  return (
    <div className="flex items-center rounded-full border border-border/80 bg-card/70 p-1 shadow-sm backdrop-blur" aria-label="外观模式">
      {options.map(({ id, label, icon: Icon }) => (
        <button
          key={id}
          type="button"
          title={label}
          aria-label={label}
          aria-pressed={theme === id}
          onClick={() => setTheme(id)}
          className={`grid size-11 place-items-center rounded-full transition-colors ${theme === id ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
        >
          <Icon className="size-4" />
        </button>
      ))}
    </div>
  );
}
