import crypto from 'crypto';
import { IConfigService } from 'config/ConfigService';
import { PlayerDeathType, Flavour, Metadata } from '../main/types';
import Combatant from '../main/Combatant';
import { VideoCategory } from '../types/VideoCategory';

/**
 * Abstract activity class.
 */
export default abstract class Activity {
  protected _category: VideoCategory;

  protected _result: boolean;

  protected _combatantMap: Map<string, Combatant>;

  protected _startDate: Date;

  protected _deaths: PlayerDeathType[];

  protected _flavour: Flavour;

  protected _endDate?: Date;

  protected _zoneID?: number;

  protected _playerGUID?: string;

  protected _overrun: number = 0;

  protected hash = crypto.createHash('md5');

  protected cfg: IConfigService;

  protected _youFound: boolean;

  constructor(
    startDate: Date,
    category: VideoCategory,
    flavour: Flavour,
    cfg: IConfigService,
  ) {
    this._result = false;
    this._combatantMap = new Map();
    this._startDate = startDate;
    this._category = category;
    this._deaths = [];
    this._flavour = flavour;
    this.cfg = cfg;
    this._youFound = false;
  }

  abstract getMetadata(): Metadata;
  abstract getFileName(): string;

  get youFound() {
    return this._youFound;
  }

  set youFound(value) {
    this._youFound = value;
  }

  get zoneID() {
    return this._zoneID;
  }

  set zoneID(zoneID) {
    this._zoneID = zoneID;
  }

  get category() {
    return this._category;
  }

  set category(category) {
    this._category = category;
  }

  get startDate() {
    return this._startDate;
  }

  set startDate(date) {
    this._startDate = date;
  }

  get result() {
    return this._result;
  }

  set result(result) {
    this._result = result;
  }

  get deaths() {
    return this._deaths;
  }

  get playerGUID() {
    return this._playerGUID;
  }

  set playerGUID(guid) {
    this._playerGUID = guid;
  }

  get endDate() {
    return this._endDate;
  }

  set endDate(date) {
    this._endDate = date;
  }

  get combatantMap() {
    return this._combatantMap;
  }

  set combatantMap(cm) {
    this._combatantMap = cm;
  }

  get flavour() {
    return this._flavour;
  }

  set flavour(flavour) {
    this._flavour = flavour;
  }

  get overrun() {
    return this._overrun;
  }

  set overrun(s) {
    console.info('[Activity] Setting overrun to', s);
    this._overrun = s;
  }

  get duration() {
    if (!this.endDate) {
      throw new Error('Failed to get duration of in-progress activity');
    }

    const baseDuration =
      (this.endDate.getTime() - this.startDate.getTime()) / 1000;

    return baseDuration + this.overrun;
  }

  get player() {
    if (!this.playerGUID) {
      throw new Error('Failed to get player combatant, playerGUID not set');
    }

    const player = this.getCombatant(this.playerGUID);

    if (!player) {
      throw new Error('Player not found in combatants');
    }

    return player;
  }

  end(endDate: Date, result: boolean) {
    endDate.setTime(endDate.getTime());
    this.endDate = endDate;
    this.result = result;
  }

  getPlayerCount() {
    return this.combatantMap.size;
  }

  getCombatant(GUID: string) {
    return this.combatantMap.get(GUID);
  }

  updateYou(job: string) {
    //Pour pas avoir à itérer dans la map à chaque log
    if (this.youFound) {
      return;
    }
    let combatant = this.getYou();
    if (combatant) {
      combatant.jobName = job;
      this.playerGUID = combatant.GUID;
    }

  }

  getYou() {
    return [...this.combatantMap.values()].find(c => c.jobName == undefined);
  }

  addCombatant(combatant: Combatant) {
    this.combatantMap.set(combatant.GUID, combatant);
  }

  addDeath(death: PlayerDeathType) {
    this.deaths.push(death);
  }

  /**
   * Gets fields from the metadata that are deterministic and hashes them. This is used to
   * correlate videos; deliberately excludes fields that vary from player to player for this
   * reason. Does not include start time as I'm not sure it's totally fixed across multi povs;
   * it might vary slightly with local system clock.
   */
  getUniqueHash(): string {
    const deterministicFields = [this.category, this.flavour, this.result].map(
      (f) => f.toString(),
    );

    const sortedNames: string[] = [];

    Array.from(this.combatantMap.values())
      .map((combatant) => combatant.name)
      .sort()
      .forEach((name) => {
        if (name) sortedNames.push(name);
      });

    const uniqueString = deterministicFields.join(' ') + sortedNames.join(' ');

    return this.hash.update(uniqueString).digest('hex');
  }
}
