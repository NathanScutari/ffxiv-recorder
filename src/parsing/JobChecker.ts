import axios from 'axios';

export class JobChecker {
  private static BASE_URL = 'https://v2.xivapi.com';
  private static jobColors: Record<string, string> = {
 // Tanks
  "GLA": "#B7D6ED", // PLD pastel
  "MRD": "#E08B97", // WAR pastel
  "PLD": "#B7D6ED",
  "WAR": "#E08B97",
  "DRK": "#B76C75", // DRK pastel
  "GNB": "#A59B5E", // GNB pastel

  // Healers
  "CNJ": "#FFF7EE", // WHM pastel
  "ACN": "#6DB3E8", // SCH/SMN pastel
  "WHM": "#FFF7EE",
  "SCH": "#6DB3E8",
  "AST": "#CDB5F7", // AST pastel
  "SGE": "#7BE7E3", // SGE pastel

  // Mêlée DPS
  "PGL": "#E0BD62", // MNK pastel
  "LNC": "#7184D7", // DRG pastel
  "ROG": "#C87B8C", // NIN pastel
  "SAM": "#ED9B61", // SAM pastel
  "RPR": "#C16767", // RPR pastel
  "MNK": "#E0BD62",
  "DRG": "#7184D7",
  "NIN": "#C87B8C",
  "VPR": "#D84315", // Viper pastel

  // Distance physique
  "ARC": "#A8C08A", // BRD pastel
  "MCH": "#8DE5E5", // MCH pastel
  "DNC": "#F2E5CF", // DNC pastel
  "BRD": "#A8C08A",

  // Distance magique
  "THM": "#BDA5E5", // BLM pastel
  "OCC": "#BDA5E5", // Occultiste pastel
  "SMN": "#7BD681", // SMN pastel
  "BLM": "#BDA5E5",
  "RDM": "#EBA9A9", // RDM pastel
  "BLU": "#87ABF1", // BLU pastel
  "PCT": "#501478", // Pictomancer pastel
};
  
  /**
   * Retourne le nom du job associé à une action, ou null si aucun job.
   * @param actionId ID de l'action (sort/skill)
   */
  static async getJobNameFromActionId(
    actionId: string,
  ): Promise<string | null> {
    try {
        const decimalId = parseInt(actionId, 16);
      const response = await axios.get(
        `${this.BASE_URL}/api/sheet/Action/${decimalId}`,
        {
          params: {
            fields: 'ClassJobCategory.Name',
          },
        },
      );

      let jobName = response.data?.fields?.ClassJobCategory?.fields?.Name ?? null;
      console.info("jobcheck : ", `${this.BASE_URL}/api/sheet/Action/${decimalId}`, jobName);
      if (jobName.length != 3) {
        return null
      }
      return jobName;
    } catch (error) {
      console.error(
        `Erreur lors de la récupération de l'action ${actionId}:`,
        error,
      );
      return null;
    }
  }

  static getJobColorFromName(jobName: string): string | null {
    const normalizedJobName = jobName.trim().toLowerCase();

    const entry = Object.entries(this.jobColors).find(
      ([key]) => key.toLowerCase() === normalizedJobName,
    );

    return entry ? entry[1] : null;
  }
}
