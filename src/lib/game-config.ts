// Impostazioni generali del mondo di gioco.
// La data di gioco scorre da sola (1 giorno reale = 1 giorno ON): vedi
// lib/game-date.ts e Gestione -> Data di gioco.
import { gameYearNow } from "./game-date";

// Anno attuale del gioco (Dopo la Conquista): serve a calcolare l'eta' dei viventi
// negli alberi genealogici
export const GAME_YEAR = gameYearNow();
