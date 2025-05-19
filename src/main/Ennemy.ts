/**
 * Represents an non player entity.
 */
export default class Ennemy {
  private _health?: number | undefined;
  private _maxHealth?: number | undefined;

  private _dead: boolean;

  private _name: string;

  private _id: string

  private _markedForRemoval?: Date;

  /**
   * Get health
   */
  get health(): number | undefined {
    return this._health;
  }

  /**
   * Set health
   */
  set maxHealth(value: number) {
    this._maxHealth = value;
  }

  /**
   * Get health
   */
  get maxHealth(): number | undefined {
    return this._maxHealth;
  }

  /**
   * Set health
   */
  set health(value: number) {
    this._health = value;
  }

  /**
   * Get health
   */
  get isDead(): boolean {
    return this._dead;
  }

  /**
   * Set health
   */
  set isDead(value: boolean) {
    this._dead = value;
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

  get id(): string {
    return this._id;
  }
  
  public unMark() {
    if (this._markedForRemoval && new Date(Date.now()).getTime() - this._markedForRemoval.getTime() > 3 * 1000) {
      console.info("Unmarked Ennemy", this._name, this._id);
      this._markedForRemoval = undefined;
    }
  }

  public markForRemoval() {
    this._markedForRemoval = new Date(Date.now());
    console.info("Ennemy marked ", this.name, this.id);
  }
  
  public checkMark(): boolean {
    if (!this._markedForRemoval) return false;

    if (new Date(Date.now()).getTime() - this._markedForRemoval.getTime() > 10 * 1000) return true;

    return false;
  }

  /**
   * Constructs a new Combatant.
   *
   * @param GUID the GUID of the combatant.
   * @param teamID the team the combatant belongs to.
   * @param specID the specID of the combatant
   */
  constructor(name: string, health: number, maxHealth: number, id: string) {
    this._name = name;
    this._dead = false;
    this._health = health;
    this._maxHealth = maxHealth;
    this._markedForRemoval = undefined;
    this._id = id;
  }
}
