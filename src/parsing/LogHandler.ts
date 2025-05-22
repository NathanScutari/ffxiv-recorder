import { BrowserWindow } from 'electron';
import { EventEmitter } from 'stream';
import VideoProcessQueue from '../main/VideoProcessQueue';
import Poller from '../utils/Poller';
import Combatant from '../main/Combatant';
import ConfigService from '../config/ConfigService';
import Recorder from '../main/Recorder';
import { Flavour, PlayerDeathType, VideoQueueItem } from '../main/types';
import Activity from '../activitys/Activity';
import RaidEncounter from '../activitys/RaidEncounter';

import {
  ambiguate,
  isUnitFriendly,
  isUnitPlayer,
  isUnitSelf,
} from './logutils';

import LogLine from './LogLine';
import { VideoCategory } from '../types/VideoCategory';
import { allowRecordCategory, getFlavourConfig } from '../utils/configUtils';
import { CombatDataEvent, CombatantData } from './CombatData';
import { LogLineFFXIV } from './LogLineFFXIV';
import Ennemy from 'main/Ennemy';

/**
 * Generic LogHandler class. Everything in this class must be valid for both
 * classic and retail combat logs.
 *
 * If you need something flavour specific then put it in the appropriate
 * subclass; i.e. RetailLogHandler, ClassicLogHandler or EraLogHandler.
 */
export default abstract class LogHandler extends EventEmitter {
  public activity?: Activity;

  public overrunning = false;

  protected recorder: Recorder;

  protected player: Combatant | undefined;

  protected cfg: ConfigService = ConfigService.getInstance();

  protected poller: Poller = Poller.getInstance(getFlavourConfig(this.cfg));

  protected mainWindow: BrowserWindow;

  private minBossHp = 100 * 10 ** 6;

  /**
   * Once we have completed a recording, we throw it onto the
   * VideoProcessQueue to handle cutting it to size, writing accompanying
   * metadata and saving it to the final location for display in the GUI.
   */
  protected videoProcessQueue: VideoProcessQueue;

  constructor(
    mainWindow: BrowserWindow,
    recorder: Recorder,
    videoProcessQueue: VideoProcessQueue,
    dataTimeout: number,
  ) {
    super();

    this.mainWindow = mainWindow;
    this.recorder = recorder;

    this.videoProcessQueue = videoProcessQueue;
  }

  protected async handleEncounterStartLine(
    event: LogLineFFXIV,
    flavour: Flavour,
  ) {
    console.debug('[LogHandler] Handling ENCOUNTER_START event:');
    let startDate;
    let encounterName;

    startDate = new Date(new Date(event.line[1]).toISOString());
    encounterName = event.rawLine;

    const activity = new RaidEncounter(
      startDate,
      encounterName,
      flavour,
      this.cfg,
    );

    await this.startActivity(activity);
  }

  protected isPotentialBoss(c: CombatantData): boolean {
    const hasJob = !!c.Job;
    const hp = parseInt(c.damagetaken ?? '0') || 0;

    return !hasJob && hp > 1000000; // seuil arbitraire à ajuster
  }

  protected async handleEncounterEndLine(ennemyList: Map<string, Ennemy>) {
    console.debug('[LogHandler] Handling ENCOUNTER_END event:');

    if (!this.activity) {
      console.info('[LogHandler] Encounter stop with no active encounter');
      return;
    }

    let sumOfEnnemyHealth = 0;
    for (const ennemy of ennemyList.values()) {
      sumOfEnnemyHealth +=
        !Number.isNaN(ennemy.maxHealth) && ennemy.maxHealth
          ? ennemy.maxHealth
          : 0;
    }

    console.info("Ennemies :", [...ennemyList.values()].length);
    for (const ennemy of ennemyList.values()) {
      if (!Number.isNaN(ennemy.health) && !Number.isNaN(ennemy.maxHealth)) {
        console.info("- ", ennemy.name, ennemy.id, Math.round(ennemy.maxHealth * 100 / sumOfEnnemyHealth))
      }
    }

    //We consider a boss an entity that has at list 30% of the sum of the max hp, should account for fight ending with multiple boss death close to each other
    const bossList = [...ennemyList.values()].filter(
      (ennemy) =>
        !Number.isNaN(ennemy.maxHealth) &&
        ennemy.maxHealth &&
        ennemy.maxHealth >= sumOfEnnemyHealth * 0.3,
    );

    //Fight percentage will be the higher values of all ennemies in bossList except 100%
    let maxHealthPercentage = 0;
    for (const boss of bossList) {
      if (
        boss.health &&
        boss.maxHealth &&
        !Number.isNaN(boss.health) &&
        !Number.isNaN(boss.maxHealth)
      ) {
        const bossPercentage = (boss.health * 100) / boss.maxHealth;
        if (bossPercentage > maxHealthPercentage) {
          maxHealthPercentage = bossPercentage;
          if (this.activity instanceof RaidEncounter) {
            this.activity.encounterName = boss.name;
          }
        }
      }
    }

    if (this.activity instanceof RaidEncounter) {
      this.activity.fightPercentage =
        Math.round(maxHealthPercentage * 100) / 100;

      if (bossList.length > 0 && bossList.every((b) => b.isDead)) {
        this.activity.encounterName = bossList.reduce(
          (max, b) =>
            !Number.isNaN(b.maxHealth) &&
            b.maxHealth &&
            b.maxHealth >
              (!Number.isNaN(max.maxHealth) && max.maxHealth && max.maxHealth
                ? max.maxHealth
                : 0)
              ? b
              : max,
          bossList[0],
        ).name;
      }
    }

    //Kill only if all ennemies in bosslist are dead
    const result = bossList.length > 0 && bossList.every((boss) => boss.isDead);

    if (result) {
      const overrun = this.cfg.get<number>('raidOverrun');
      this.activity.overrun = overrun;
    }

    this.activity.end(new Date(Date.now()), result);
    await this.endActivity();
  }

  protected handleUnitDiedLine(event: LogLineFFXIV): void {
    if (!this.activity) {
      return;
    }

    const playerName = event.line[3];

    const deathDate = new Date(new Date(event.line[1]).getTime() - 1000);
    const activityStartDate = this.activity.startDate.getTime() / 1000;
    let relativeTime = deathDate.getTime() / 1000 - activityStartDate;
    if (relativeTime < 0) relativeTime = 0;

    const playerDeath: PlayerDeathType = {
      specId: 0,
      friendly: true,
      name: playerName,
      date: deathDate,
      timestamp: relativeTime,
    };

    this.activity.addDeath(playerDeath);
  }

  protected async startActivity(activity: Activity) {
    const { category } = activity;
    const allowed = allowRecordCategory(this.cfg, category);

    if (!allowed) {
      console.info('[LogHandler] Not configured to record', category);
      return;
    }

    console.info(
      `[LogHandler] Start recording a video for category: ${category}`,
    );

    try {
      this.activity = activity;
      await this.recorder.start();
      this.emit('state-change');
    } catch (error) {
      console.error('[LogHandler] Error starting activity', String(error));
      this.activity = undefined;
    }
  }

  /**
   * End the recording after the overrun has elasped. Every single activity
   * ending comes through this function.
   */
  protected async endActivity() {
    if (!this.activity) {
      console.error("[LogHandler] No active activity so can't stop");
      return;
    }

    console.info(
      `[LogHandler] Ending recording video for category: ${this.activity.category}`,
    );

    // It's important we clear the activity before we call stop as stop will
    // await for the overrun, and we might do weird things if the player
    // immediately starts a new activity while we're awaiting. See issue 291.
    const lastActivity = this.activity;
    this.overrunning = true;
    this.activity = undefined;

    const { overrun } = lastActivity;

    if (overrun > 0) {
      this.emit('state-change');
      console.info('[LogHandler] Awaiting overrun:', overrun);
      await new Promise((resolve) => setTimeout(resolve, 1000 * overrun));
      console.info('[LogHandler] Done awaiting overrun');
    }

    this.overrunning = false;
    const { startDate } = this.recorder;
    let videoFile;

    try {
      await this.recorder.stop();
      videoFile = this.recorder.lastFile;
      this.poller.start();
    } catch (error) {
      console.error('[LogHandler] Failed to stop OBS, discarding video', error);
      return;
    }

    try {
      const activityStartTime = lastActivity.startDate.getTime();
      const bufferStartTime = startDate.getTime();
      const offset = (activityStartTime - bufferStartTime) / 1000;
      const metadata = lastActivity.getMetadata();
      const { duration } = metadata;
      const suffix = lastActivity.getFileName();

      if (lastActivity.category === VideoCategory.Raids) {
        const minDuration = this.cfg.get<number>('minEncounterDuration');
        const notLongEnough = duration < minDuration;

        if (notLongEnough) {
          console.info('[LogHandler] Discarding raid encounter, too short');
          return;
        }
      }

      const queueItem: VideoQueueItem = {
        source: videoFile,
        suffix,
        offset,
        duration,
        metadata,
        deleteSource: true,
      };

      this.videoProcessQueue.queueVideo(queueItem);
    } catch (error) {
      // We've failed to get the Metadata from the activity. Throw away the
      // video and log why. Example of when we hit this is on raid resets
      // where we don't have long enough to get a GUID for the player.
      console.warn(
        '[LogHandler] Discarding video as failed to get Metadata:',
        String(error),
      );
    }
  }

  protected async dataTimeout(ms: number) {
    console.info(
      `[LogHandler] Haven't received data for combatlog in ${
        ms / 1000
      } seconds.`,
    );

    if (this.activity) {
      await this.forceEndActivity(-ms / 1000);
    }
  }

  public async forceEndActivity(timedelta = 0) {
    if (!this.activity) {
      console.error('[LogHandler] forceEndActivity called but no activity');
      return;
    }

    console.info('[LogHandler] Force ending activity, timedelta:', timedelta);
    const endDate = new Date();
    endDate.setTime(endDate.getTime() + timedelta * 1000);
    this.activity.overrun = 0;

    this.activity.end(endDate, false);
    await this.endActivity();
    this.activity = undefined;
  }

  protected async zoneChangeStop(line: LogLine) {
    if (!this.activity) {
      console.error('[LogHandler] No active activity on zone change stop');

      return;
    }

    const endDate = line.date();
    this.activity.end(endDate, false);
    await this.endActivity();
  }

  protected isArena() {
    if (!this.activity) {
      return false;
    }

    const { category } = this.activity;

    return (
      category === VideoCategory.TwoVTwo ||
      category === VideoCategory.ThreeVThree ||
      category === VideoCategory.FiveVFive ||
      category === VideoCategory.Skirmish ||
      category === VideoCategory.SoloShuffle
    );
  }

  protected isBattleground() {
    if (!this.activity) {
      return false;
    }

    const { category } = this.activity;
    return category === VideoCategory.Battlegrounds;
  }

  protected processCombatant(
    srcGUID: string,
    srcNameRealm: string,
    srcFlags: number,
    allowNew: boolean,
  ) {
    let combatant: Combatant | undefined;

    if (!this.activity) {
      return combatant;
    }

    // Logs sometimes emit this GUID and we don't want to include it.
    // No idea what causes it. Seems really common but not exlusive on
    // "Shadow Word: Death" casts.
    if (srcGUID === '0000000000000000') {
      return combatant;
    }

    if (!isUnitPlayer(srcFlags)) {
      return combatant;
    }

    // We check if we already know the playerGUID here, no point updating it
    // because it can't change, unless the user changes characters mid
    // recording like in issue 355, in which case better to retain the initial
    // character details.
    if (!this.activity.playerGUID && isUnitSelf(srcFlags)) {
      this.activity.playerGUID = srcGUID;
    }

    // Even if the combatant exists already we still update it with the info it
    // may not have yet. We can't tell the name, realm or if it's the player
    // from COMBATANT_INFO events.
    combatant = this.activity.getCombatant(srcGUID);

    if (allowNew && combatant === undefined) {
      // We've failed to get a pre-existing combatant, but we are allowed to add it.
      combatant = new Combatant(srcGUID);
    } else if (combatant === undefined) {
      // We've failed to get a pre-existing combatant, and we're not allowed to add it.
      return combatant;
    }

    if (combatant.isFullyDefined()) {
      // No point doing anything more here, we already know all the details.
      return combatant;
    }

    [combatant.name] = ambiguate(srcNameRealm);
    this.activity.addCombatant(combatant);
    return combatant;
  }

  protected handleSpellDamage(line: LogLine) {
    if (!this.activity || this.activity.category !== VideoCategory.Raids) {
      // We only care about this event for working out boss HP, which we
      // only do in raids.
      return;
    }

    const max = parseInt(line.arg(15), 10);

    if (this.activity.flavour === Flavour.Retail && max < this.minBossHp) {
      // Assume that if the HP is less than 100 million then it's not a boss.
      // That avoids us marking bosses as 0% when they haven't been touched
      // yet, i.e. short pulls on Gallywix before the shield is broken and we are
      // yet to see SPELL_DAMAGE events (and instead get SPELL_ABSORBED). Only do
      // this for retail as classic will have lower HP bosses and I can't be
      // bothered worrying about it there.
      return;
    }

    const raid = this.activity as RaidEncounter;
    const current = parseInt(line.arg(14), 10);

    // We don't check the unit here, the RaidEncounter class has logic
    // to discard an update that lowers the max HP. That's a strategy to
    // avoid having to maintain a list of boss unit names. It's a reasonable
    // assumption usually that the boss has the most HP of all the units.
    raid.updateHp(current, max);
  }
}
