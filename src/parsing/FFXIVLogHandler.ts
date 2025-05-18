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

export default class FfXIVLogHandler extends LogHandler {
  private xivWSServer: FFXIVWebSocketServer;

  private isInCombat: boolean;
  private playerName: string;

  constructor(
    mainWindow: BrowserWindow,
    recorder: Recorder,
    videoProcessQueue: VideoProcessQueue
  ) {
    super(mainWindow, recorder, videoProcessQueue, 10);
    this.isInCombat = false;

    this.xivWSServer = new FFXIVWebSocketServer(13337);

    this.xivWSServer.addOverlayListener('LogLine', (event) => {
      if (this.isLogLine(event)) {
        this.handleLogLine(event);
      }
    });

    this.xivWSServer.addOverlayListener('CombatData', (event) => {
      if (this.isCombatDataEvent(event)) {
        this.handleCombatData(event);
      }
    });

    this.playerName = this.cfg.get<string>('playerName');
  }

  public dispose() {
    this.xivWSServer.dispose();
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
        .length === 8
    );
  }

  private isPlayer(combatant: CombatantData): boolean {
    return combatant.Job !== undefined;
  }

  private handleCombatData(event: CombatDataEvent) {
    if (!this.isInCombat) {
      if (event.isActive === 'true' && this.isRaid(event)) {
        //Un combat de raid a démarré
        this.playerName = this.cfg.get<string>('playerName');
        this.isInCombat = true;
        super.handleEncounterStartLine(event, Flavour.FFXIV);
      }

      //Correspond à des event hors combat
      return;
    }

    if (!this.activity) {
      console.error('No activity in progress while isInCombat is true');
      this.isInCombat = false;
      this.forceEndActivity();
      return;
    }

    if (this.activity.getPlayerCount() > 2) {
      console.info(
        'Stopped recording because player count exceeded maximum allowed.',
      );
      this.isInCombat = false;
      this.forceEndActivity();
    }

    //fin de combat
    if (event.isActive === 'false') {
      this.isInCombat = false;
      this.handleEncounterEndLine(event);
    }

    //Gestion des combatants, permet de récupérer les infos des joueurs du combat et les ajouter à l'activité, ou mettre à jour le job dans le cas du "YOU"
    if (this.isInCombat) {
      for (let combatant of Object.values(event.Combatant)) {
        //cas particulier pour YOU, on essaye de le mettre à jour pour récupérer son job
        if (combatant.name === 'YOU') {
          if (combatant.Job) {
            this.activity.playerGUID = this.playerName;
          }
          combatant.name = this.playerName;
        }

        //peut être un boss, un familier, une add etc
        if (!this.isPlayer(combatant)) {
          continue;
        }

        let player = this.activity.getCombatant(combatant.name);

        if (!player || !player.isFullyDefined()) {
          player = new Combatant(combatant.name, combatant.Job);
          this.activity.addCombatant(player);
        }
      }
    }
  }

  private handleLogLine(event: LogLineFFXIV): void {
    const opCode = event.line[0];

    switch (opCode) {
      case '25': // death
        this.handleUnitDiedLine(event);
        break;
      default:
        // console.debug('Unhandled opcode', opCode);
        break;
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

  protected async handleEncounterEndLine(event: CombatDataEvent) {
    if (!this.activity) return;
    super.handleEncounterEndLine(event);
  }

  protected handleUnitDiedLine(event: LogLineFFXIV): void {
    if (!this.activity) return;

    const playerName = event.line[3];
    const player = this.activity.getCombatant(playerName);

    console.log(event.rawLine);

    if (!player) {
      return;
    }

    super.handleUnitDiedLine(event);
    // const playerName = line.arg(2); // à confirmer
    // const playerGUID = line.arg(1);
    // const unitFlags = 0xf000; // à définir selon ton format
    // const isUnitUnconsciousAtDeath = false;

    // const playerSpecId = this.activity.getCombatant(playerGUID)?.specID ?? 0;
    // const deathDate = (line.date().getTime() - 2) / 1000;
    // const activityStartDate = this.activity.startDate.getTime() / 1000;
    // let relativeTime = deathDate - activityStartDate;
    // if (relativeTime < 0) relativeTime = 0;

    // const playerDeath: PlayerDeathType = {
    //   name: playerName,
    //   specId: playerSpecId,
    //   date: line.date(),
    //   timestamp: relativeTime,
    //   friendly: isUnitFriendly(unitFlags),
    // };

    // this.activity.addDeath(playerDeath);
  }
}
