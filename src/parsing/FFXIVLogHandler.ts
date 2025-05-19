import VideoProcessQueue from 'main/VideoProcessQueue';
import { BrowserWindow } from 'electron';
import Combatant from '../main/Combatant';

import {
  dungeonEncounters,
  dungeonsByMapId,
  dungeonTimersByMapId,
  instanceDifficulty,
  retailBattlegrounds,
  retailUniqueSpecSpells,
} from '../main/constants';

import Recorder from '../main/Recorder';
import ArenaMatch from '../activitys/ArenaMatch';
import LogHandler from './LogHandler';
import Battleground from '../activitys/Battleground';
import ChallengeModeDungeon from '../activitys/ChallengeModeDungeon';

import {
  ChallengeModeTimelineSegment,
  TimelineSegmentType,
} from '../main/keystone';

import { Flavour, PlayerDeathType } from '../main/types';
import SoloShuffle from '../activitys/SoloShuffle';
import LogLine from './LogLine';
import { VideoCategory } from '../types/VideoCategory';
import { FFXIVWebSocketServer } from 'wsclient/FFXIVWebSocketServer';
import { isUnitFriendly } from './logutils';
import RaidEncounter from 'activitys/RaidEncounter';
import { CombatantData, CombatDataEvent } from './CombatData';
import { LogLineFFXIV } from './LogLineFFXIV';
import Ennemy from 'main/Ennemy';
import Player from 'main/Player';
import CombatLogWatcherFFXIV from './CombatLogWatcherFFXIV';

export default class FfXIVLogHandler extends LogHandler {
  private isInCombat: boolean;
  private playerName: string;

  private combatLogWatcher: CombatLogWatcherFFXIV;

  private ennemyList: Map<string, Ennemy>;
  private playerList: Map<string, Player>;

  constructor(
    mainWindow: BrowserWindow,
    recorder: Recorder,
    videoProcessQueue: VideoProcessQueue,
    xivLogPath: string
  ) {
    super(mainWindow, recorder, videoProcessQueue, 10);
    this.isInCombat = false;
    this.combatLogWatcher = new CombatLogWatcherFFXIV(xivLogPath, 15000);

    this.combatLogWatcher.on('LogLine', (event) => {
      if (this.isLogLine(event))
        this.handleLogLine(event);
    });

    this.ennemyList = new Map<string, Ennemy>();
    this.playerList = new Map<string, Player>();

    this.playerName = '';

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

  private isCombatDataEvent(event: any): event is CombatDataEvent {
    return (
      typeof event === 'object' &&
      event.type === 'CombatData' &&
      typeof event.Encounter === 'object' &&
      typeof event.Combatant === 'object'
    );
  }

  private isRaid(event: CombatDataEvent): boolean {
    return (
      Object.values(event.Combatant).filter((c: any) => c.Job !== undefined)
        .length === 1
    );
  }

  private isPlayer(combatant: CombatantData): boolean {
    return combatant.Job !== undefined;
  }

  private handleCombatData(event: CombatDataEvent) {
    if (!this.isInCombat) return;

    if (!this.activity && this.isRaid(event)) {
      super.handleEncounterStartLine(event, Flavour.FFXIV);
    }

    if (!this.activity) return;

    if (!this.activity.playerGUID) this.activity.playerGUID = this.playerName;
  }

  private handleUnitAddedLine(line: LogLineFFXIV): void {
    const entity = line.line[3];
    const job = line.line[4];
    const id = line.line[2];

    if (entity && job != '00') {
      this.playerList.set(id, new Player(entity, job));
      console.log('Added player: ', entity);
    }
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
      } else {
        this.ennemyList.get(id)?.markForRemoval();
      }
    }

    if (this.playerList.delete(id)) {
      console.log('Removed player: ', entity);
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
  }

  private updateMarkedRemoval() {
    const toRemove = [...this.ennemyList.values()].filter((e) => e.checkMark());

    for (const ennemy of toRemove) {
      console.log('Removed ennemy marked: ', ennemy.name, ennemy.id);
      this.ennemyList.delete(ennemy.id);
    }
  }

  private handleInCombatLine(line: LogLineFFXIV): void {
    const inActCombat = line.line[2];

    console.log("Combat event", line.rawLine);

    //début de combat
    if (!this.isInCombat && inActCombat == '1') {
      this.ennemyList.clear();
      this.isInCombat = true;
      super.handleEncounterStartLine(line, Flavour.FFXIV);
      if (this.activity)
        this.activity.playerGUID = this.playerName;
    }

    //fin de combat
    if (this.isInCombat && inActCombat == '0') {
      this.isInCombat = false;
      this.handleEncounterEndLine(this.ennemyList);
    }
  }

  private handleUnitPreDamageEvent(event: LogLineFFXIV): void {
    if (!this.activity) return;
    if (event.line.length < 6) return;

    // On récupère les combattants que dans les 10 premières secondes, le temps de voir si il faut annuler la vidéo,
    // après on arrête de vérifier pour éviter du process inutile.
    if (
      new Date(Date.now()).getTime() - this.activity.startDate.getTime() >
      10000
    )
      return;

    const entity = event.line[3];
    const id = event.line[2];

    let player = this.activity.getCombatant(entity);
    if (!player) {
      const storedPlayer = this.playerList.get(id);
      if (storedPlayer) {
        player = new Combatant(storedPlayer.name, storedPlayer.job);
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

    this.updateMarkedRemoval();

    //Corresponds to the target entity receiving damage
    const entity = event.line[3];
    const currentHealth = event.line[5];
    const maxHealth = event.line[6];
    const id = event.line[2];

    let player = this.activity.getCombatant(entity);

    //Not an allied player, so we track its health, used at the end to determine which entity is the boss and if wipe / kill
    if (!player) {
      const ennemy = this.ennemyList.get(id);

      if (!ennemy) {
        console.log('Ennemy added: ', entity, id);
        console.log(event.rawLine);
        this.ennemyList.set(
          id,
          new Ennemy(entity, parseInt(currentHealth), parseInt(maxHealth), id),
        );
      } else {
        ennemy.health = parseInt(currentHealth);
      }
    }
  }

  protected async handleEncounterStartLine(
    event: CombatDataEvent,
    flavour: Flavour,
  ) {
    const startDate = new Date(Date.now());
    const encounterName = event.Encounter.title; // À adapter selon structure de log

    const activity = new RaidEncounter(
      startDate,
      encounterName,
      flavour,
      this.cfg,
    );

    await this.startActivity(activity);
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

    ennemy.isDead = true;
  }
}
