export interface CombatDataEvent {
  type: 'CombatData';
  Encounter: {
    CurrentZoneName: string;
    title: string; // nom du boss ou description du combat
    duration: string;
  };
  Combatant: {
    [name: string]: CombatantData;
  };
  isActive: string;
}

export interface CombatantData {
  name: string;
  Job?: string;
  deaths?: number;
  damage?: string;
  healed?: string;
  damagetaken?: string;
  // Ajoute les champs utiles à ton usage
}
