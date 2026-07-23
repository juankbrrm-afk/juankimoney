import { createContext, useContext, useState, type ReactNode } from "react";

interface UIContextValue {
  menuOpen: boolean;
  searchOpen: boolean;
  setMenuOpen: (v: boolean) => void;
  setSearchOpen: (v: boolean) => void;
}

const UIContext = createContext<UIContextValue | null>(null);

export function UIProvider({ children }: { children: ReactNode }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);

  return (
    <UIContext.Provider
      value={{
        menuOpen,
        searchOpen,
        setMenuOpen: (v) => {
          setMenuOpen(v);
          if (v) setSearchOpen(false);
        },
        setSearchOpen: (v) => {
          setSearchOpen(v);
          if (v) setMenuOpen(false);
        },
      }}
    >
      {children}
    </UIContext.Provider>
  );
}

export function useUI() {
  const ctx = useContext(UIContext);
  if (!ctx) throw new Error("useUI must be used within UIProvider");
  return ctx;
}
