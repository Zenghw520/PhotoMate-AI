import { useEffect, useState } from "react";
import { Monitor, Moon, Sun } from "lucide-react";

type Theme = "light" | "dark" | "system";

const options = [
  { id: "light" as const, label: "印纸", hint: "Paper", icon: Sun },
  { id: "dark" as const, label: "暗场", hint: "Stage", icon: Moon },
  { id: "system" as const, label: "自动", hint: "Auto", icon: Monitor },
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
    <div
      className="pm-theme-toggle"
      role="group"
      aria-label="外观模式"
    >
      {options.map(({ id, label, hint, icon: Icon }) => (
        <button
          key={id}
          type="button"
          title={`${label} · ${hint}`}
          aria-label={`${label} ${hint}`}
          aria-pressed={theme === id}
          onClick={() => setTheme(id)}
          className="pm-theme-toggle__item"
        >
          <Icon className="size-3.5" />
          <span className="hidden sm:inline">{label}</span>
        </button>
      ))}
    </div>
  );
}
