import { RawCombatant } from './types';

/**
 * Represents an arena combatant.
 */
export default class Combatant {
  private _GUID: string;
  
  private _jobName?: string;

  private _name?: string;

  /**
   * Constructs a new Combatant.
   *
   * @param GUID the GUID of the combatant.
   * @param teamID the team the combatant belongs to.
   * @param specID the specID of the combatant
   */
  constructor(GUID: string, jobName?: string) {
    this._GUID = GUID;

    if (jobName !== undefined) {
      this._jobName = jobName;
    }

    if (GUID !== undefined) {
      this.name = GUID;
    }
  }

  /**
   * Gets the GUID.
   */
  get GUID() {
    return this._GUID;
  }

  /**
   * Sets the specID.
   */
  set GUID(value) {
    this._GUID = value;
  }

  /**
   * Gets the job name (eg: Vpr)
   */
  get jobName() {
    return this._jobName;
  }

  /**
   * Sets the specID.
   */
  set jobName(value) {
    this._jobName = value;
  }

  /**
   * Gets the name.
   */
  get name() {
    return this._name;
  }

  /**
   * Sets the name.
   */
  set name(value) {
    this._name = value;
  }

  isFullyDefined() {
    const hasGUID = this.name !== undefined;
    const hasName = this.name !== undefined;
    const hasJob = this.jobName !== undefined;
    return hasGUID && hasName && hasJob;
  }

  getRaw(): RawCombatant {
    const rawCombatant: RawCombatant = { _GUID: this.GUID };

    if (this.jobName !== undefined) rawCombatant._jobName = this.jobName;
    if (this.name !== undefined) rawCombatant._name = this.name;

    return rawCombatant;
  }
}
