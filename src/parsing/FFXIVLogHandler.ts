import VideoProcessQueue from 'main/VideoProcessQueue';
import { BrowserWindow } from 'electron';
import Combatant from '../main/Combatant';

import Recorder from '../main/Recorder';
import LogHandler from './LogHandler';

import { Flavour, PlayerDeathType } from '../main/types';
import { LogLineFFXIV } from './LogLineFFXIV';
import Ennemy from 'main/Ennemy';
import CombatLogWatcherFFXIV from './CombatLogWatcherFFXIV';

export default class FfXIVLogHandler extends LogHandler {
  private isInCombat: boolean;
  private playerName: string;
  private zoneName: string;

  private combatLogWatcher: CombatLogWatcherFFXIV;

  private ennemyList: Map<string, Ennemy>;

  constructor(
    mainWindow: BrowserWindow,
    recorder: Recorder,
    videoProcessQueue: VideoProcessQueue,
    xivLogPath: string,
  ) {
    super(mainWindow, recorder, videoProcessQueue, 10);
    this.isInCombat = false;
    this.combatLogWatcher = new CombatLogWatcherFFXIV(xivLogPath, 15000);

    this.combatLogWatcher.on('LogLine', (event) => {
      if (this.isLogLine(event)) this.handleLogLine(event);
    });

    this.ennemyList = new Map<string, Ennemy>();

    this.playerName = this.cfg.get<string>('playerName');
    this.zoneName = this.cfg.get<string>('zoneName');

    console.log('Restored last known player name: ', this.playerName);
    console.log('Restored last known map: ', this.zoneName);

    this.combatLogWatcher.watch();
  }

  public dispose() {
    this.combatLogWatcher.unwatch();
  }

  private isLogLine(event: any): event is LogLineFFXIV {
    return (
      typeof event === 'object' &&
      event.type === 'LogLine' &&
      typeof event.line === 'object' &&
      typeof event.rawLine === 'string'
    );
  }

  private isPlayer(id: string, ownerId: string): boolean {
    return id.startsWith('10') && ownerId == '00';
  }

  private isLikelyEnnemy(id: string): boolean {
    return id.startsWith('40');
  }

  private handleUnitAddedLine(line: LogLineFFXIV): void {
    // const id = line.line[2];
    // if (this.activity) {
    //   const ennemy = this.ennemyList.get(id);
    //   if (ennemy) {
    //     console.log('Trying to unmark', ennemy.name, ennemy.id);
    //     ennemy.unMark();
    //   }
    // }
  }

  private handleUnitRemovedLine(line: LogLineFFXIV): void {
    const entity = line.line[3];
    const currentHp = line.line[11];
    const maxHp = line.line[12];
    const id = line.line[2];

    if (this.activity) {
      if (currentHp === maxHp) {
        console.log('Removed ennemy: ', entity, id);
        this.ennemyList.delete(id);
      }
    }
  }

  private handleLogLine(event: LogLineFFXIV): void {
    const opCode = event.line[0];

    switch (opCode) {
      case '25': // death
        this.handleUnitDiedLine(event);
        break;
      case '21': // damage info (when spell is used)
        this.handleUnitPreDamageEvent(event);
        break;
      case '37': // damage info (when the target actually takes damage)
        this.handleUnitDamageEvent(event);
        break;
      case '01': // map change
        this.handleMapChange(event);
        break;
      case '02': // primary player
        this.handlePrimaryPlayer(event);
        break;
      case '03': // add unit
        this.handleUnitAddedLine(event);
        break;
      case '04': // remove unit
        this.handleUnitRemovedLine(event);
        break;
      case '260': // inCombat
        this.handleInCombatLine(event);
        break;
      default:
        break;
    }
  }

  private handlePrimaryPlayer(line: LogLineFFXIV) {
    console.log('Got YOU: ', line.line[3]);
    this.playerName = line.line[3];
    this.cfg.set('playerName', this.playerName);
  }

  private handleMapChange(line: LogLineFFXIV) {
    console.log('Map Change: ', line.line[3]);
    this.zoneName = line.line[3];
    this.cfg.set('zoneName', this.zoneName);
  }

  private handleInCombatLine(line: LogLineFFXIV): void {
    const inActCombat = line.line[2];

    console.log('Combat event', line.rawLine);

    //début de combat
    if (!this.isInCombat && inActCombat == '1') {
      this.ennemyList.clear();
      this.isInCombat = true;
      line.rawLine = this.zoneName;
      super.handleEncounterStartLine(line, Flavour.FFXIV);
      if (this.activity) this.activity.playerGUID = this.playerName;
    }

    //fin de combat
    if (this.isInCombat && inActCombat == '0') {
      this.isInCombat = false;
      this.handleEncounterEndLine(this.ennemyList);
    }
  }

  private checkForCombatant(entity: string, id: string, owner: string) {
    if (!this.activity) return;

    let player = this.activity.getCombatant(entity);
    if (!player) {
      if (this.isPlayer(id, owner)) {
        player = new Combatant(entity, '');
        console.log('Added combatant: ', entity);
        this.activity.addCombatant(player);

        // Si plus de 8 personnes, alors on est pas en raid
        if (this.activity.getPlayerCount() > 8) {
          console.info(
            'Stopped recording because player count exceeded maximum allowed.',
          );
          this.isInCombat = false;
          this.forceEndActivity();
        }
      }
    } else {
      if (this.activity.getPlayerCount() < 8) {
        console.info('Force stopping, not 8 player content');
        this.forceEndActivity();
      }
    }
  }

  private handleUnitPreDamageEvent(event: LogLineFFXIV): void {
    if (!this.activity) return;
    if (event.line.length < 6) return;

    // On récupère les combattants que dans les 10 premières secondes, le temps de voir si il faut annuler la vidéo,
    // après on arrête de vérifier pour éviter du process inutile.
    if (
      new Date(Date.now()).getTime() - this.activity.startDate.getTime() <
      10000
    ) {

      const entity = event.line[3];
      const id = event.line[2];
      const owner = event.line[47];
      this.checkForCombatant(entity, id, owner);
    }
      const targetEntity = event.line[7];
      const targetId = event.line[6];
      const targetCurrentHealth = event.line[24];
      const targetMaxHealth = event.line[25];
      const sourceId = event.line[2];

      this.checkAddEnnemy(
        targetEntity,
        targetId,
        targetCurrentHealth,
        targetMaxHealth,
        sourceId,
      );
  }

  private checkAddEnnemy(
    entity: string,
    id: string,
    currentHealth: string,
    maxHealth: string,
    damageSourceId: string,
  ) {
    if (entity == '') return;

    if (!this.isLikelyEnnemy(id) || !this.isPlayer(damageSourceId, '00'))
      return;

    const ennemy = this.ennemyList.get(id);

    if (!ennemy) {
      console.log('Ennemy added: ', entity, id);
      this.ennemyList.set(
        id,
        new Ennemy(entity, parseInt(currentHealth), parseInt(maxHealth), id),
      );
    }
  }

  private checkUpdateEnnemy(
    entity: string,
    id: string,
    currentHealth: string,
    maxHealth: string,
  ) {
    if (entity == '') return;

    if (!this.isLikelyEnnemy(id)) return;

    const ennemy = this.ennemyList.get(id);
    if (ennemy) {
      let health = parseInt(currentHealth);
      let maxHealthParsed = parseInt(maxHealth);
      if (!Number.isNaN(health) && !Number.isNaN(maxHealthParsed)) {
        ennemy.health = health;
        ennemy.maxHealth = maxHealthParsed;
      }
    }
  }

  private handleUnitDamageEvent(event: LogLineFFXIV): void {
    if (!this.activity) return;
    if (event.line.length < 6) return;
    if (
      new Date(Date.now()).getTime() - this.activity.startDate.getTime() <
      10000
    )
      return;

    //Corresponds to the target entity receiving damage
    const entity = event.line[3];
    const currentHealth = event.line[5];
    const maxHealth = event.line[6];
    const id = event.line[2];

    this.checkUpdateEnnemy(entity, id, currentHealth, maxHealth);
  }

  protected async handleEncounterEndLine(ennemyList: Map<string, Ennemy>) {
    if (!this.activity) return;
    super.handleEncounterEndLine(this.ennemyList);
  }

  protected handleUnitDiedLine(event: LogLineFFXIV): void {
    if (!this.activity) return;

    const entityName = event.line[3];
    const id = event.line[2];
    const player = this.activity.getCombatant(entityName);

    if (player) {
      super.handleUnitDiedLine(event);
      return;
    }

    const ennemy = this.ennemyList.get(id);
    if (!ennemy) return;

    console.log('Ennemy dead: ', ennemy.name, ennemy.id);
    ennemy.isDead = true;
  }
}
