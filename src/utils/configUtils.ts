import {
  BaseConfig,
  ObsVideoConfig,
  ObsAudioConfig,
  ObsOverlayConfig,
  Metadata,
  CloudConfig,
  Flavour,
  AudioSource,
} from 'main/types';
import path from 'path';
import ConfigService from '../config/ConfigService';
import {
  categoryRecordingSettings,
  currentRetailEncounters,
} from '../main/constants';
import { VideoCategory } from '../types/VideoCategory';
import { ESupportedEncoders } from '../main/obsEnums';
import { Language, Phrase } from 'localisation/phrases';
import { getLocalePhrase } from 'localisation/translations';
import {
  checkDisk,
  exists,
  getWowFlavour,
  isFolderOwned,
  takeOwnershipBufferDir,
  takeOwnershipStorageDir,
} from 'main/util';

const allowRecordCategory = (cfg: ConfigService, category: VideoCategory) => {
  if (category === VideoCategory.Clips) {
    console.info('[configUtils] Clips are never recorded directly');
    return false;
  }

  const categoryConfig = categoryRecordingSettings[category];

  if (!categoryConfig) {
    console.info('[configUtils] Unrecognised category', category);
    return false;
  }

  const categoryAllowed = cfg.get<boolean>(categoryConfig.allowRecordKey);

  if (!categoryAllowed) {
    console.info('[configUtils] Configured to not record:', category);
    return false;
  }

  console.info('[configUtils] Good to record:', category);
  return true;
};

const shouldUpload = (cfg: ConfigService, metadata: Metadata) => {
  const { category, flavour } = metadata;

  const upload = cfg.get<boolean>('cloudUpload');

  if (!upload) {
    console.info('[configUtils] Cloud upload is disabled');
    return false;
  }

  if (flavour === Flavour.Retail && !cfg.get<boolean>('cloudUploadRetail')) {
    console.info('[configUtils] Retail upload is disabled');
    return false;
  }

  if (flavour === Flavour.Classic && !cfg.get<boolean>('cloudUploadClassic')) {
    console.info('[configUtils] Classic upload is disabled');
    return false;
  }

  if (category === VideoCategory.Clips) {
    const uploadClips = cfg.get<boolean>('cloudUploadClips');
    console.info('[configUtils] Upload clip?', uploadClips);
    return uploadClips;
  }

  const categoryConfig = categoryRecordingSettings[category];

  if (!categoryConfig) {
    console.info('[configUtils] Unrecognised category', category);
    return false;
  }

  const categoryAllowed = cfg.get<boolean>(categoryConfig.autoUploadKey);

  if (!categoryAllowed) {
    console.info('[configUtils] Configured to not upload:', category);
    return false;
  }

  if (category === VideoCategory.Raids) {
    const { difficulty, encounterID } = metadata;

    const uploadCurrentRaidOnly =
      flavour === Flavour.Retail &&
      cfg.get<boolean>('uploadCurrentRaidEncountersOnly');

    if (
      encounterID !== undefined &&
      uploadCurrentRaidOnly &&
      !currentRetailEncounters.includes(encounterID)
    ) {
      console.warn('[configUtils] Wont upload, not a current encounter');
      return;
    }

    const orderedDifficulty = ['lfr', 'normal', 'heroic', 'mythic'];
    const orderedDifficultyIDs = ['LFR', 'N', 'HC', 'M'];

    const minDifficultyToUpload = cfg
      .get<string>('cloudUploadRaidMinDifficulty')
      .toLowerCase();

    if (difficulty === undefined) {
      console.info('[configUtils] Undefined difficulty, not blocking');
      return true;
    }

    const configuredIndex = orderedDifficulty.indexOf(minDifficultyToUpload);
    const actualIndex = orderedDifficultyIDs.indexOf(difficulty);

    if (actualIndex < 0) {
      console.info('[configUtils] Unrecognised difficulty, not blocking');
      return true;
    }

    if (actualIndex < configuredIndex) {
      console.info('[configUtils] Raid encounter below  upload threshold');
      return false;
    }
  }

  if (category === VideoCategory.MythicPlus) {
    const minKeystoneLevel = cfg.get<number>('cloudUploadDungeonMinLevel');
    const { keystoneLevel } = metadata;

    if (keystoneLevel === undefined) {
      console.info('[configUtils] Keystone level undefined, not blocking');
      return true;
    }

    if (keystoneLevel < minKeystoneLevel) {
      console.info('[configUtils] Keystone too low for upload');
      return false;
    }
  }

  console.info('[configUtils] Good to upload:', category);
  return true;
};

const getBaseConfig = (cfg: ConfigService): BaseConfig => {
  const storagePath = cfg.getPath('storagePath');
  let obsPath: string;

  if (cfg.get<boolean>('separateBufferPath')) {
    obsPath = cfg.getPath('bufferStoragePath');
  } else {
    obsPath = path.join(storagePath, '.temp');
  }

  // Bizzare here bug where the amd_amf_h264 suddenly started massively leaking
  // memory for me, and switching to the texture one resolved it. This migrates
  // all users of the amd_amf_h264 encoder to use h264_texture_amf.
  let obsRecEncoder = cfg.get<string>('obsRecEncoder');

  if (obsRecEncoder === 'amd_amf_h264') {
    obsRecEncoder = ESupportedEncoders.AMD_H264;
    cfg.set('obsRecEncoder', obsRecEncoder);
  }

  // The jim_nvenc encoder was deprecated in libobs. Migrate to the new version.
  if (obsRecEncoder === 'jim_nvenc') {
    obsRecEncoder = ESupportedEncoders.NVENC_H264;
    cfg.set('obsRecEncoder', obsRecEncoder);
  }

  // The jim_av1_nvenc encoder was deprecated in libobs. Migrate to the new version.
  if (obsRecEncoder === 'jim_av1_nvenc') {
    obsRecEncoder = ESupportedEncoders.NVENC_AV1;
    cfg.set('obsRecEncoder', obsRecEncoder);
  }

  return {
    storagePath: cfg.get<string>('storagePath'),
    maxStorage: cfg.get<number>('maxStorage'),
    obsPath,
    obsOutputResolution: cfg.get<string>('obsOutputResolution'),
    obsFPS: cfg.get<number>('obsFPS'),
    obsQuality: cfg.get<string>('obsQuality'),
    obsRecEncoder,
    recordFFXIV: cfg.get<boolean>('recordFFXIV'),
    xivLogPath: cfg.get<string>('xivLogPath'),
  };
};

const getObsVideoConfig = (cfg: ConfigService): ObsVideoConfig => {
  return {
    obsCaptureMode: cfg.get<string>('obsCaptureMode'),
    monitorIndex: cfg.get<number>('monitorIndex'),
    captureCursor: cfg.get<boolean>('captureCursor'),
    forceSdr: cfg.get<boolean>('forceSdr'),
    videoSourceScale: cfg.get<number>('videoSourceScale'),
    videoSourceXPosition: cfg.get<number>('videoSourceXPosition'),
    videoSourceYPosition: cfg.get<number>('videoSourceYPosition'),
  };
};

const getObsAudioConfig = (cfg: ConfigService): ObsAudioConfig => {
  return {
    audioSources: cfg.get<AudioSource[]>('audioSources'),
    obsAudioSuppression: cfg.get<boolean>('obsAudioSuppression'),
    obsForceMono: cfg.get<boolean>('obsForceMono'),
    pushToTalk: cfg.get<boolean>('pushToTalk'),
    pushToTalkKey: cfg.get<number>('pushToTalkKey'),
    pushToTalkMouseButton: cfg.get<number>('pushToTalkMouseButton'),
    pushToTalkModifiers: cfg.get<string>('pushToTalkModifiers'),
  };
};

const getOverlayConfig = (cfg: ConfigService): ObsOverlayConfig => {
  return {
    chatOverlayEnabled: cfg.get<boolean>('chatOverlayEnabled'),
    chatOverlayOwnImage: cfg.get<boolean>('chatOverlayOwnImage'),
    chatOverlayOwnImagePath: cfg.get<string>('chatOverlayOwnImagePath'),
    chatOverlayScale: cfg.get<number>('chatOverlayScale'),
    chatOverlayXPosition: cfg.get<number>('chatOverlayXPosition'),
    chatOverlayYPosition: cfg.get<number>('chatOverlayYPosition'),
    chatOverlayCropX: cfg.get<number>('chatOverlayCropX'),
    chatOverlayCropY: cfg.get<number>('chatOverlayCropY'),
  };
};

const getCloudConfig = (): CloudConfig => {
  const cfg = ConfigService.getInstance();

  return {
    cloudStorage: cfg.get<boolean>('cloudStorage'),
    cloudUpload: cfg.get<boolean>('cloudUpload'),
    cloudAccountName: cfg.get<string>('cloudAccountName'),
    cloudAccountPassword: cfg.get<string>('cloudAccountPassword'),
    cloudGuildName: cfg.get<string>('cloudGuildName'),
  };
};

const getLocaleError = (phrase: Phrase) => {
  const lang = ConfigService.getInstance().get<string>('language') as Language;
  return getLocalePhrase(lang, phrase);
};

const validateBaseConfig = async (config: BaseConfig) => {
  const {
    storagePath,
    maxStorage,
    obsPath,
    recordFFXIV,
    xivLogPath,
  } = config;

  if (!storagePath) {
    console.warn('[Manager] storagePath is falsy', storagePath);
    const error = getLocaleError(Phrase.ErrorStoragePathInvalid);
    throw new Error(error);
  }

  if (storagePath.includes('#')) {
    // A user hit this: the video player loads the file path as a URL where
    // # is interpreted as a timestamp.
    console.warn('[Manager] storagePath contains #', storagePath);
    const error = getLocaleError(Phrase.ErrorStoragePathInvalid);
    throw new Error(error);
  }

  const storagePathExists = await exists(storagePath);

  if (!storagePathExists) {
    console.warn('[Manager] storagePath does not exist', storagePath);
    const error = getLocaleError(Phrase.ErrorStoragePathInvalid);
    throw new Error(error);
  }

  await checkDisk(storagePath, maxStorage);

  if (!obsPath) {
    console.warn('[Manager] obsPath is falsy', obsPath);
    const error = getLocaleError(Phrase.ErrorBufferPathInvalid);
    throw new Error(error);
  }

  const obsParentDir = path.dirname(obsPath);
  const obsParentDirExists = await exists(obsParentDir);

  if (!obsParentDirExists) {
    console.warn('[Manager] obsPath does not exist', obsPath);
    const error = getLocaleError(Phrase.ErrorBufferPathInvalid);
    throw new Error(error);
  }

  if (path.resolve(storagePath) === path.resolve(obsPath)) {
    console.warn('[Manager] storagePath is the same as obsPath');
    const error = getLocaleError(Phrase.ErrorStoragePathSameAsBufferPath);
    throw new Error(error);
  }

  const obsDirExists = await exists(obsPath);

  // 10GB is a rough guess at what the worst case buffer directory might be.
  if (obsDirExists) {
    await checkDisk(obsPath, 10);
  } else {
    const parentDir = path.dirname(obsPath);
    await checkDisk(parentDir, 10);
  }

  const storagePathOwned = await isFolderOwned(storagePath);

  if (!storagePathOwned) {
    await takeOwnershipStorageDir(storagePath);
  }

  if (obsDirExists && !(await isFolderOwned(obsPath))) {
    await takeOwnershipBufferDir(obsPath);
  }

if (recordFFXIV) {
      if (xivLogPath.length < 3) {
        throw new Error(getLocaleError(Phrase.InvalidFFXIVLogPath));
      }
    }
};

export {
  allowRecordCategory,
  shouldUpload,
  getBaseConfig,
  getObsVideoConfig,
  getObsAudioConfig,
  getOverlayConfig,
  getCloudConfig,
  validateBaseConfig,
  getLocaleError,
};
