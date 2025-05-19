/**
 * Represents an non player entity.
 */
export default class Player {
  private _name: string;

  private _job: string;

  /**
   * Get job
   */
  get job(): string {
    return this._job;
  }

  /**
   * Set job
   */
  set job(value: string) {
    this._job = value;
  }

  /**
   * Get name
   */
  get name(): string {
    return this._name;
  }

  /**
   * Set name
   */
  set name(value: string) {
    this._name = value;
  }

  /**
   * Constructs a new Combatant.
   *
   * @param GUID the GUID of the combatant.
   * @param teamID the team the combatant belongs to.
   * @param specID the specID of the combatant
   */
  constructor(name: string, job: string) {
    this._name = name;
    this._job = job;
  }
}
