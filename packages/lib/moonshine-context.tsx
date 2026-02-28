import React, { createContext, useContext } from "react";
import { useMoonshineModel, type UseMoonshineModelReturn } from "@/packages/hooks/use-moonshine-model";

const MoonshineContext = createContext<UseMoonshineModelReturn | null>(null);

export function MoonshineProvider({ children }: { children: React.ReactNode }) {
  const value = useMoonshineModel();
  return (
    <MoonshineContext.Provider value={value}>
      {children}
    </MoonshineContext.Provider>
  );
}

export function useMoonshine(): UseMoonshineModelReturn {
  const ctx = useContext(MoonshineContext);
  if (!ctx) {
    throw new Error("useMoonshine must be used within MoonshineProvider");
  }
  return ctx;
}
