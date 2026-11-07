"use client";

import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";

const KEY = "theme";

/** Dark page background (matches --background in globals.css) and the brand colour the light theme has always used for the top bar */
const BAR = { dark: "#020817", light: "#4f46e5" } as const;

function apply(theme: "light" | "dark") {
  document.documentElement.classList.toggle("dark", theme === "dark");
  let m = document.querySelector('meta[name="theme-color"]');
  if (!m) {
    m = document.createElement("meta");
    m.setAttribute("name", "theme-color");
    document.head.appendChild(m);
  }
  m.setAttribute("content", BAR[theme]);
}

export function ThemeToggle({ className }: { className?: string }) {
  const [theme, setTheme] = useState<"light" | "dark">("light");

  useEffect(() => {
    const saved = localStorage.getItem(KEY);
    const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    const next = saved === "dark" || saved === "light" ? saved : prefersDark ? "dark" : "light";
    setTheme(next);
    apply(next);
  }, []);

  const toggle = () => {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
    localStorage.setItem(KEY, next);
    apply(next);
  };

  return (
    <Button
      type="button"
      variant="ghost"
      className={className}
      onClick={toggle}
      aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
    >
      {theme === "dark" ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
      <span>{theme === "dark" ? "Light mode" : "Dark mode"}</span>
    </Button>
  );
}
