"use client";

import { createContext, useContext } from "react";
import type { Contact, MessageKind } from "@/components/game/MessagesModal";

// Azioni che la scheda chiede al gioco: aprire un OFF o un cartiglio (ON)
// verso il personaggio. Fuori dal gioco non c'e' e i pulsanti non compaiono
export const SheetActionsContext = createContext<{
  message: (kind: MessageKind, to: Contact) => void;
} | null>(null);

export const useSheetActions = () => useContext(SheetActionsContext);
