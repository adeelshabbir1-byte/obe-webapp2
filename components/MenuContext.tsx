"use client";

import { createContext, useContext } from "react";

// The signed-in person's full page list and statuses, shared from the menu to the hub pages of cards.
export type MenuValue = { links: { href: string; label: string }[]; linkStatus: Record<string, { status: "red" | "amber" | "blue" | "grey" | "green"; count: number; reasons: string[] }>; lang?: string };
export const MenuContext = createContext<MenuValue>({ links: [], linkStatus: {} });
export const useMenu = () => useContext(MenuContext);
